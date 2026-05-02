import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNearestNodeFromDOMNode } from 'lexical';
import {
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  $insertTableRow__EXPERIMENTAL,
  $insertTableColumn__EXPERIMENTAL,
} from '@lexical/table';
import { FaPlus } from 'react-icons/fa';

import styles from './TableHoverActionsPlugin.module.css';

// Obsidian-style hover-add buttons for tables. Two "+" pills appear when the
// cursor is inside a table or within ~30px of its right/bottom edge:
//   • Right edge → "Add column right"
//   • Bottom edge → "Add row below"
// More granular operations (insert above/left, delete, alignment, duplicate)
// live in the right-click context menu, not here.
//
// Implementation notes:
// - mousemove is rAF-throttled so we don't fight the browser's compositor.
// - The buttons are portaled to document.body, positioned in page coords
//   (clientRect + window.scrollX/Y).
// - Hovering the buttons themselves keeps the active state alive — we tag
//   them with [data-table-hover-action] and short-circuit hide-on-leave when
//   the cursor is on one of them.
// - A 150ms hide debounce avoids flicker when the cursor crosses a thin gap
//   between the table and the button.

const PROXIMITY_PX = 30;
const HIDE_DELAY_MS = 150;

function TableHoverActions({ editor }) {
  // Active hover target: { tableEl, right: {x,y}, bottom: {x,y} } | null.
  // tableEl is the raw DOM <table> — we resolve it to a Lexical TableNode at
  // click time so the data isn't stale if Lexical reconciles the tree.
  const [active, setActive] = useState(null);

  const activeRef = useRef(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  const setActiveState = useCallback((nextActive) => {
    activeRef.current = nextActive;
    setActive(nextActive);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current !== null) return;
    hideTimeoutRef.current = setTimeout(() => {
      hideTimeoutRef.current = null;
      setActiveState(null);
    }, HIDE_DELAY_MS);
  }, [setActiveState]);

  const positionForTable = useCallback((tableEl) => {
    if (!tableEl || !tableEl.isConnected) {
      setActiveState(null);
      return;
    }

    const rect = tableEl.getBoundingClientRect();
    const sx = window.scrollX;
    const sy = window.scrollY;

    setActiveState({
      tableEl,
      right: {
        x: rect.right + sx + 4,
        y: rect.top + rect.height / 2 + sy,
      },
      bottom: {
        x: rect.left + rect.width / 2 + sx,
        y: rect.bottom + sy + 4,
      },
    });
  }, [setActiveState]);

  const scheduleActiveRecompute = useCallback(() => {
    if (!activeRef.current) return;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      positionForTable(activeRef.current?.tableEl);
    });
  }, [positionForTable]);

  // Find the nearest editor table within PROXIMITY_PX of (x, y). Used when
  // the cursor is just outside a table so the hover region extends to the
  // edge buttons themselves.
  const findNearbyTable = useCallback(
    (x, y) => {
      const root = editor.getRootElement();
      if (!root) return null;
      const tables = root.querySelectorAll('table.editor-table');
      let closest = null;
      let minDist = Infinity;
      for (const t of tables) {
        const r = t.getBoundingClientRect();
        // Distance from point to rect: 0 if inside, else max of axial gaps.
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const dist = Math.max(dx, dy);
        if (dist <= PROXIMITY_PX && dist < minDist) {
          closest = t;
          minDist = dist;
        }
      }
      return closest;
    },
    [editor]
  );

  const recompute = useCallback(() => {
    const { x, y } = lastMousePosRef.current;
    const el = document.elementFromPoint(x, y);
    if (!el) {
      scheduleHide();
      return;
    }

    // Cursor is on one of our floating buttons → keep current active state.
    if (el.closest('[data-table-hover-action]')) {
      cancelHide();
      return;
    }

    // Inside an editor table, or outside but within proximity.
    let tableEl = el.closest('table.editor-table');
    if (!tableEl) tableEl = findNearbyTable(x, y);
    if (!tableEl) {
      scheduleHide();
      return;
    }

    cancelHide();

    positionForTable(tableEl);
  }, [cancelHide, findNearbyTable, positionForTable, scheduleHide]);

  const onMouseMove = useCallback(
    (e) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current !== null) return; // already scheduled this frame
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recompute();
      });
    },
    [recompute]
  );

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove);
    // Reposition on scroll so the buttons stay anchored as the user scrolls
    // the page or any internal overflow container. Capture phase: scroll
    // doesn't bubble, so this catches scrolling on every ancestor.
    const onScroll = () => {
      scheduleActiveRecompute();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    const unregisterUpdateListener = editor.registerUpdateListener(() => {
      scheduleActiveRecompute();
    });

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      unregisterUpdateListener();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (hideTimeoutRef.current !== null) clearTimeout(hideTimeoutRef.current);
    };
  }, [editor, onMouseMove, scheduleActiveRecompute]);

  // Run an insert against the captured table DOM. We resolve to the Lexical
  // TableNode inside editor.update(), pick a target cell (last row / last
  // column) and selectStart() so the EXPERIMENTAL helpers operate on the
  // intended row/column.
  const insertColumnRight = useCallback(() => {
    const tableEl = active?.tableEl;
    if (!tableEl) return;
    editor.update(() => {
      const tableNode = $getNearestNodeFromDOMNode(tableEl);
      if (!tableNode || !$isTableNode(tableNode)) return;
      const firstRow = tableNode.getChildren().filter($isTableRowNode)[0];
      if (!firstRow) return;
      const cells = firstRow.getChildren().filter($isTableCellNode);
      const lastCell = cells[cells.length - 1];
      if (!lastCell) return;
      lastCell.selectStart();
      $insertTableColumn__EXPERIMENTAL(true);
    });
  }, [active, editor]);

  const insertRowBelow = useCallback(() => {
    const tableEl = active?.tableEl;
    if (!tableEl) return;
    editor.update(() => {
      const tableNode = $getNearestNodeFromDOMNode(tableEl);
      if (!tableNode || !$isTableNode(tableNode)) return;
      const rows = tableNode.getChildren().filter($isTableRowNode);
      const lastRow = rows[rows.length - 1];
      if (!lastRow) return;
      const firstCell = lastRow.getChildren().filter($isTableCellNode)[0];
      if (!firstCell) return;
      firstCell.selectStart();
      $insertTableRow__EXPERIMENTAL(true);
    });
  }, [active, editor]);

  // preventDefault on mousedown stops the contenteditable from losing focus
  // (which would also clear the hover state on the next mousemove tick).
  const guard = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!active) return null;

  return createPortal(
    <>
      <button
        type="button"
        data-table-hover-action="column"
        className={`${styles.pill} ${styles.right}`}
        style={{ top: `${active.right.y}px`, left: `${active.right.x}px` }}
        onMouseDown={guard}
        onClick={insertColumnRight}
        title="Add column right"
        aria-label="Add column right"
      >
        <FaPlus />
      </button>
      <button
        type="button"
        data-table-hover-action="row"
        className={`${styles.pill} ${styles.bottom}`}
        style={{ top: `${active.bottom.y}px`, left: `${active.bottom.x}px` }}
        onMouseDown={guard}
        onClick={insertRowBelow}
        title="Add row below"
        aria-label="Add row below"
      >
        <FaPlus />
      </button>
    </>,
    document.body
  );
}

function TableHoverActionsPlugin() {
  const [editor] = useLexicalComposerContext();
  return <TableHoverActions editor={editor} />;
}

export default TableHoverActionsPlugin;
