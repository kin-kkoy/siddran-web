import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $getNodeByKey,
  $isParagraphNode,
  $isTextNode,
  $isLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $createLineBreakNode,
  $getNearestNodeFromDOMNode,
} from 'lexical';
import { $findMatchingParent } from '@lexical/utils';
import { $isLinkNode, $createLinkNode } from '@lexical/link';
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  $isTableSelection,
  $createTableCellNode,
  $createTableRowNode,
  $insertTableRow__EXPERIMENTAL,
  $insertTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $deleteTableColumn__EXPERIMENTAL,
  $getTableRowIndexFromTableCellNode,
  $getTableColumnIndexFromTableCellNode,
  TableCellHeaderStates,
} from '@lexical/table';
import {
  FaArrowUp,
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaAlignLeft,
  FaAlignCenter,
  FaAlignRight,
  FaCopy,
  FaTrash,
  FaTextWidth,
  FaCheck,
} from 'react-icons/fa';

import { $isSpoilerNode, $createSpoilerNode } from '../nodes/SpoilerNode';
import styles from './TableContextMenuPlugin.module.css';

// ---------- Inline-node deep clone (for duplicate row/col) ----------
//
// Lexical's static .clone() is shallow. We need a deep clone that preserves
// the inline node types this codebase actually models. Anything outside this
// list falls back to plain text content — acceptable for "duplicate" UX,
// which is a convenience operation.
function cloneInline(node) {
  if ($isTextNode(node)) {
    const t = $createTextNode(node.getTextContent());
    t.setFormat(node.getFormat());
    t.setStyle(node.getStyle());
    return t;
  }
  if ($isLineBreakNode(node)) return $createLineBreakNode();
  if ($isLinkNode(node)) {
    const link = $createLinkNode(node.getURL());
    for (const child of node.getChildren()) {
      const c = cloneInline(child);
      if (c) link.append(c);
    }
    return link;
  }
  if ($isSpoilerNode(node)) {
    const sp = $createSpoilerNode();
    for (const child of node.getChildren()) {
      const c = cloneInline(child);
      if (c) sp.append(c);
    }
    return sp;
  }
  const text = node.getTextContent();
  return text ? $createTextNode(text) : null;
}

function cloneCellContent(cell) {
  const headerState =
    typeof cell.getHeaderStyles === 'function'
      ? cell.getHeaderStyles()
      : TableCellHeaderStates.NO_STATUS;
  const newCell = $createTableCellNode(headerState);
  for (const child of cell.getChildren()) {
    if ($isParagraphNode(child)) {
      const p = $createParagraphNode();
      p.setFormat(child.getFormatType());
      for (const inline of child.getChildren()) {
        const c = cloneInline(inline);
        if (c) p.append(c);
      }
      newCell.append(p);
    } else {
      const text = child.getTextContent();
      if (text) {
        const p = $createParagraphNode();
        p.append($createTextNode(text));
        newCell.append(p);
      }
    }
  }
  // TableCellNode requires at least one block child.
  if (newCell.getChildrenSize() === 0) {
    newCell.append($createParagraphNode());
  }
  return newCell;
}

function cloneRow(row) {
  const newRow = $createTableRowNode();
  for (const cell of row.getChildren().filter($isTableCellNode)) {
    newRow.append(cloneCellContent(cell));
  }
  return newRow;
}

// ---------- Plugin ----------

function TableContextMenu({ editor }) {
  // menu = { x, y, context } | null. x/y are page coords (clientX + scrollX
  // etc.). `context` is captured at open time so subsequent edits don't
  // change which cells we're operating on.
  //
  // context.kind = 'single' | 'multi'
  // context.tableKey: string
  // context.cellKeys: string[] (always the click target cell, or all cells
  //                             in a TableSelection)
  // context.rowRange: [minRow, maxRow]
  // context.colRange: [minCol, maxCol]
  // context.anchorCellKey: cell to selectStart() on before EXPERIMENTAL helpers
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);

  // Build context from a right-click event. Returns null if the click was
  // not inside an editor table.
  const buildContext = useCallback(
    (cellEl) => {
      let result = null;
      editor.read(() => {
        const clickedCell = $getNearestNodeFromDOMNode(cellEl);
        if (!$isTableCellNode(clickedCell)) return;
        const tableNode = $findMatchingParent(clickedCell, $isTableNode);
        if (!tableNode) return;

        // If a TableSelection is active AND the clicked cell is part of it,
        // operate on the whole selection. Otherwise treat the clicked cell
        // as a fresh single-cell context.
        const selection = $getSelection();
        let cells = [clickedCell];
        let kind = 'single';

        if ($isTableSelection(selection)) {
          const selectedCells = selection
            .getNodes()
            .filter($isTableCellNode);
          const inside = selectedCells.some(
            (c) => c.getKey() === clickedCell.getKey()
          );
          if (inside && selectedCells.length > 1) {
            cells = selectedCells;
            kind = 'multi';
          }
        }

        const rowIdxs = cells.map((c) =>
          $getTableRowIndexFromTableCellNode(c)
        );
        const colIdxs = cells.map((c) =>
          $getTableColumnIndexFromTableCellNode(c)
        );

        // Snapshot wrap state at open time. "anyNoWrap" drives the toggle
        // semantics: if any targeted cell currently has nowrap, the action
        // turns nowrap OFF for all of them; otherwise turns it ON.
        const anyNoWrap = cells.some(
          (c) => typeof c.getNoWrap === 'function' && c.getNoWrap()
        );

        result = {
          kind,
          tableKey: tableNode.getKey(),
          cellKeys: cells.map((c) => c.getKey()),
          rowRange: [Math.min(...rowIdxs), Math.max(...rowIdxs)],
          colRange: [Math.min(...colIdxs), Math.max(...colIdxs)],
          anchorCellKey: clickedCell.getKey(),
          anyNoWrap,
        };
      });
      return result;
    },
    [editor]
  );

  // Native contextmenu listener on the Lexical root. The browser menu must be
  // cancelled synchronously once we know the event is inside an editor table
  // cell; doing it after Lexical reads/state updates is too late in Chrome/Edge.
  useEffect(() => {
    const onContextMenu = (e) => {
      const cellEl = e.target.closest('th, td');
      if (!cellEl || !cellEl.closest('table.editor-table')) return;
      e.preventDefault();
      e.stopPropagation();

      const context = buildContext(cellEl);
      if (!context) {
        setMenu(null);
        return;
      }

      // Clamp to viewport so the menu never opens off-screen. Approx menu
      // dimensions — refined after first render if needed.
      const approxW = 220;
      const approxH = 400;
      const x =
        e.clientX + approxW > window.innerWidth
          ? Math.max(8, window.innerWidth - approxW - 8)
          : e.clientX;
      const y =
        e.clientY + approxH > window.innerHeight
          ? Math.max(8, window.innerHeight - approxH - 8)
          : e.clientY;

      setMenu({
        x: x + window.scrollX,
        y: y + window.scrollY,
        context,
      });
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener('contextmenu', onContextMenu);
      rootElement?.addEventListener('contextmenu', onContextMenu);
    });
  }, [editor, buildContext]);

  const closeMenu = useCallback(() => setMenu(null), []);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!menu) return undefined;
    const onDocMouseDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      closeMenu();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    // Defer attaching by one tick so the contextmenu event that opened us
    // doesn't immediately count as outside-click.
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDocMouseDown);
      document.addEventListener('contextmenu', onDocMouseDown);
      document.addEventListener('keydown', onKeyDown);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('contextmenu', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menu, closeMenu]);

  // ---------- Action runners ----------
  //
  // Each runner re-resolves the captured cell key inside editor.update and
  // selectStart()s on it before calling EXPERIMENTAL helpers. For multi-row
  // / multi-col bulk operations, we walk indexes in *descending* order so
  // earlier deletions don't shift later ones.

  const runWithAnchor = (action) => {
    if (!menu) return;
    const { context } = menu;
    editor.update(() => {
      const cells = context.cellKeys
        .map((k) => $getNodeByKey(k))
        .filter((n) => n && $isTableCellNode(n));
      const anchorCell = $getNodeByKey(context.anchorCellKey);
      const tableNode = $getNodeByKey(context.tableKey);
      if (!anchorCell || !$isTableCellNode(anchorCell)) return;
      if (!tableNode || !$isTableNode(tableNode)) return;
      action({ anchorCell, cells, tableNode, context });
    });
    closeMenu();
  };

  // Insert handlers — for multi mode we anchor at the appropriate edge of
  // the selection range so the inserted row/col lands where the user expects.
  const insertRowAbove = () =>
    runWithAnchor(({ tableNode, context }) => {
      const rows = tableNode.getChildren().filter($isTableRowNode);
      const targetRow = rows[context.rowRange[0]];
      const cellInRow = targetRow?.getChildren().filter($isTableCellNode)[0];
      if (!cellInRow) return;
      cellInRow.selectStart();
      $insertTableRow__EXPERIMENTAL(false);
    });

  const insertRowBelow = () =>
    runWithAnchor(({ tableNode, context }) => {
      const rows = tableNode.getChildren().filter($isTableRowNode);
      const targetRow = rows[context.rowRange[1]];
      const cellInRow = targetRow?.getChildren().filter($isTableCellNode)[0];
      if (!cellInRow) return;
      cellInRow.selectStart();
      $insertTableRow__EXPERIMENTAL(true);
    });

  const insertColLeft = () =>
    runWithAnchor(({ tableNode, context }) => {
      const firstRow = tableNode.getChildren().filter($isTableRowNode)[0];
      const cellInCol = firstRow
        ?.getChildren()
        .filter($isTableCellNode)[context.colRange[0]];
      if (!cellInCol) return;
      cellInCol.selectStart();
      $insertTableColumn__EXPERIMENTAL(false);
    });

  const insertColRight = () =>
    runWithAnchor(({ tableNode, context }) => {
      const firstRow = tableNode.getChildren().filter($isTableRowNode)[0];
      const cellInCol = firstRow
        ?.getChildren()
        .filter($isTableCellNode)[context.colRange[1]];
      if (!cellInCol) return;
      cellInCol.selectStart();
      $insertTableColumn__EXPERIMENTAL(true);
    });

  // Bulk delete — descending order so indexes stay valid.
  const deleteRow = () =>
    runWithAnchor(({ tableNode, context }) => {
      const [from, to] = context.rowRange;
      for (let i = to; i >= from; i--) {
        const rows = tableNode.getChildren().filter($isTableRowNode);
        const row = rows[i];
        if (!row) continue;
        const cell = row.getChildren().filter($isTableCellNode)[0];
        if (!cell) continue;
        cell.selectStart();
        $deleteTableRow__EXPERIMENTAL();
      }
    });

  const deleteCol = () =>
    runWithAnchor(({ tableNode, context }) => {
      const [from, to] = context.colRange;
      for (let i = to; i >= from; i--) {
        const firstRow = tableNode.getChildren().filter($isTableRowNode)[0];
        if (!firstRow) break;
        const cell = firstRow.getChildren().filter($isTableCellNode)[i];
        if (!cell) continue;
        cell.selectStart();
        $deleteTableColumn__EXPERIMENTAL();
      }
    });

  const deleteTable = () =>
    runWithAnchor(({ tableNode }) => {
      tableNode.remove();
    });

  // Duplicate — clone selected rows/cols and insert after the selection range.
  const duplicateRow = () =>
    runWithAnchor(({ tableNode, context }) => {
      const rows = tableNode.getChildren().filter($isTableRowNode);
      const [from, to] = context.rowRange;
      const sources = rows.slice(from, to + 1);
      let insertAfter = rows[to];
      if (!insertAfter) return;
      for (const src of sources) {
        const clone = cloneRow(src);
        insertAfter.insertAfter(clone);
        insertAfter = clone;
      }
    });

  const duplicateCol = () =>
    runWithAnchor(({ tableNode, context }) => {
      const [from, to] = context.colRange;
      const rows = tableNode.getChildren().filter($isTableRowNode);
      for (const row of rows) {
        const cells = row.getChildren().filter($isTableCellNode);
        const sources = cells.slice(from, to + 1);
        let insertAfter = cells[to];
        if (!insertAfter) continue;
        for (const src of sources) {
          const clone = cloneCellContent(src);
          insertAfter.insertAfter(clone);
          insertAfter = clone;
        }
      }
    });

  // Alignment — applies to every paragraph in every targeted cell.
  const applyAlignment = (alignment) =>
    runWithAnchor(({ cells }) => {
      for (const cell of cells) {
        const paragraphs = cell.getChildren().filter($isParagraphNode);
        for (const p of paragraphs) p.setFormat(alignment);
      }
    });

  const alignLeft = () => applyAlignment('left');
  const alignCenter = () => applyAlignment('center');
  const alignRight = () => applyAlignment('right');

  // Toggle word wrap on every targeted cell. If any cell has nowrap,
  // turn it off everywhere; otherwise turn it on. Lives on the
  // ExtendedTableCellNode subclass — see nodes/ExtendedTableCellNode.js.
  // In-session only (no markdown round-trip).
  const toggleWordWrap = () =>
    runWithAnchor(({ cells, context }) => {
      const newValue = !context.anyNoWrap;
      for (const cell of cells) {
        if (typeof cell.setNoWrap === 'function') cell.setNoWrap(newValue);
      }
    });

  // ---------- Render ----------

  const handleMenuMouseDown = (e) => {
    // Same focus-stealing guards as the chevron menu used. Container-level
    // so it covers padding, dividers, gaps — not just buttons.
    e.preventDefault();
    e.stopPropagation();
  };

  if (!menu) return null;

  const isMulti = menu.context.kind === 'multi';
  const targetLabel = isMulti
    ? `${menu.context.cellKeys.length} cells`
    : 'cell';

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ top: `${menu.y}px`, left: `${menu.x}px` }}
      onMouseDown={handleMenuMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      <div className={styles.header}>
        Acting on {targetLabel}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Insert</div>
        <button type="button" className={styles.item} onClick={insertRowAbove} role="menuitem">
          <FaArrowUp /> <span>Row above</span>
        </button>
        <button type="button" className={styles.item} onClick={insertRowBelow} role="menuitem">
          <FaArrowDown /> <span>Row below</span>
        </button>
        <button type="button" className={styles.item} onClick={insertColLeft} role="menuitem">
          <FaArrowLeft /> <span>Column left</span>
        </button>
        <button type="button" className={styles.item} onClick={insertColRight} role="menuitem">
          <FaArrowRight /> <span>Column right</span>
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Format</div>
        <button type="button" className={styles.item} onClick={alignLeft} role="menuitem">
          <FaAlignLeft /> <span>Align left</span>
        </button>
        <button type="button" className={styles.item} onClick={alignCenter} role="menuitem">
          <FaAlignCenter /> <span>Align center</span>
        </button>
        <button type="button" className={styles.item} onClick={alignRight} role="menuitem">
          <FaAlignRight /> <span>Align right</span>
        </button>
        <button type="button" className={styles.item} onClick={toggleWordWrap} role="menuitemcheckbox" aria-checked={!menu.context.anyNoWrap}>
          <FaTextWidth />
          <span>Word wrap</span>
          {!menu.context.anyNoWrap && <FaCheck className={styles.checkmark} />}
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Duplicate</div>
        <button type="button" className={styles.item} onClick={duplicateRow} role="menuitem">
          <FaCopy /> <span>{isMulti ? 'Rows' : 'Row'}</span>
        </button>
        <button type="button" className={styles.item} onClick={duplicateCol} role="menuitem">
          <FaCopy /> <span>{isMulti ? 'Columns' : 'Column'}</span>
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Delete</div>
        <button type="button" className={`${styles.item} ${styles.danger}`} onClick={deleteRow} role="menuitem">
          <FaTrash /> <span>{isMulti ? 'Rows' : 'Row'}</span>
        </button>
        <button type="button" className={`${styles.item} ${styles.danger}`} onClick={deleteCol} role="menuitem">
          <FaTrash /> <span>{isMulti ? 'Columns' : 'Column'}</span>
        </button>
        <button type="button" className={`${styles.item} ${styles.danger}`} onClick={deleteTable} role="menuitem">
          <FaTrash /> <span>Table</span>
        </button>
      </div>
    </div>,
    document.body
  );
}

function TableContextMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  return <TableContextMenu editor={editor} />;
}

export default TableContextMenuPlugin;
