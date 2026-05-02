import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalEditable } from '@lexical/react/useLexicalEditable';
import {
  $computeTableMapSkipCellCheck,
  $getTableNodeFromLexicalNodeOrThrow,
  $isTableCellNode,
  getDOMCellFromTarget,
  getTableElement,
  TableNode,
} from '@lexical/table';
import { calculateZoomLevel, mergeRegister } from '@lexical/utils';
import {
  $getNearestNodeFromDOMNode,
  isHTMLElement,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from 'lexical';

import styles from './TableCellResizerPlugin.module.css';

const DEFAULT_COLUMN_WIDTH = 92;
const MIN_COLUMN_WIDTH = 24;

function getMaxTableWidth(editor) {
  return editor.getRootElement()?.clientWidth || Infinity;
}

function fitColumnWidths(colWidths, maxWidth) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || colWidths.length === 0) {
    return colWidths;
  }

  const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
  if (totalWidth <= maxWidth) {
    return colWidths;
  }

  const scale = maxWidth / totalWidth;
  const fittedMinWidth = Math.min(
    MIN_COLUMN_WIDTH,
    Math.max(1, Math.floor(maxWidth / colWidths.length))
  );
  return colWidths.map((width) =>
    Math.max(fittedMinWidth, Math.floor(width * scale))
  );
}

function widthsAreEqual(a, b) {
  return a.length === b.length && a.every((width, index) => width === b[index]);
}

function getCellColumnIndex(tableCellNode, tableMap) {
  for (let row = 0; row < tableMap.length; row += 1) {
    for (let column = 0; column < tableMap[row].length; column += 1) {
      if (tableMap[row][column].cell === tableCellNode) {
        return column;
      }
    }
  }
  return undefined;
}

function TableCellResizer({ editor }) {
  const targetRef = useRef(null);
  const resizerRef = useRef(null);
  const tableRectRef = useRef(null);
  const pointerStartPosRef = useRef(null);

  const [hasTable, setHasTable] = useState(false);
  const [activeCell, setActiveCell] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringEdge, setIsHoveringEdge] = useState(false);
  const [pointerCurrentPos, setPointerCurrentPos] = useState(null);

  const resetState = useCallback(() => {
    setActiveCell(null);
    setIsDragging(false);
    setIsHoveringEdge(false);
    setPointerCurrentPos(null);
    targetRef.current = null;
    pointerStartPosRef.current = null;
    tableRectRef.current = null;
  }, []);

  useEffect(() => {
    const tableKeys = new Set();
    return mergeRegister(
      editor.registerMutationListener(TableNode, (nodeMutations) => {
        for (const [nodeKey, mutation] of nodeMutations) {
          if (mutation === 'destroyed') {
            tableKeys.delete(nodeKey);
          } else {
            tableKeys.add(nodeKey);
          }
        }
        setHasTable(tableKeys.size > 0);
      }),
      editor.registerNodeTransform(TableNode, (tableNode) => {
        const columnCount = tableNode.getColumnCount();
        const maxWidth = getMaxTableWidth(editor);
        const currentWidths = tableNode.getColWidths();

        if (currentWidths) {
          const fittedWidths = fitColumnWidths([...currentWidths], maxWidth);
          if (!widthsAreEqual(currentWidths, fittedWidths)) {
            tableNode.setColWidths(fittedWidths);
          }
          return tableNode;
        }

        const defaultWidth = Number.isFinite(maxWidth)
          ? Math.min(DEFAULT_COLUMN_WIDTH, Math.floor(maxWidth / columnCount))
          : DEFAULT_COLUMN_WIDTH;
        tableNode.setColWidths(
          Array(columnCount).fill(Math.max(MIN_COLUMN_WIDTH, defaultWidth))
        );
        return tableNode;
      })
    );
  }, [editor]);

  useEffect(() => {
    if (!hasTable) {
      return undefined;
    }

    const onPointerMove = (event) => {
      const target = event.target;
      if (!isHTMLElement(target)) {
        return;
      }

      if (isDragging) {
        event.preventDefault();
        event.stopPropagation();
        setPointerCurrentPos({
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }

      if (resizerRef.current?.contains(target)) {
        return;
      }

      if (targetRef.current === target) {
        return;
      }

      targetRef.current = target;
      const cell = getDOMCellFromTarget(target);

      if (!cell) {
        resetState();
        return;
      }

      if (activeCell === cell) {
        return;
      }

      editor.read(() => {
        const tableCellNode = $getNearestNodeFromDOMNode(cell.elem);
        if (!tableCellNode) {
          throw new Error('TableCellResizer: Table cell node not found.');
        }

        const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
        const tableElement = getTableElement(
          tableNode,
          editor.getElementByKey(tableNode.getKey())
        );

        if (!tableElement) {
          throw new Error('TableCellResizer: Table element not found.');
        }

        targetRef.current = target;
        tableRectRef.current = tableElement.getBoundingClientRect();
        setActiveCell(cell);
      });
    };

    const onPointerDown = (event) => {
      if (event.pointerType === 'touch') {
        onPointerMove(event);
      }
    };

    const resizerContainer = resizerRef.current;
    resizerContainer?.addEventListener('pointermove', onPointerMove, {
      capture: true,
    });

    const removeRootListener = editor.registerRootListener(
      (rootElement, prevRootElement) => {
        prevRootElement?.removeEventListener('pointermove', onPointerMove);
        prevRootElement?.removeEventListener('pointerdown', onPointerDown);
        rootElement?.addEventListener('pointermove', onPointerMove);
        rootElement?.addEventListener('pointerdown', onPointerDown);
      }
    );

    return () => {
      removeRootListener();
      resizerContainer?.removeEventListener('pointermove', onPointerMove);
    };
  }, [activeCell, editor, hasTable, isDragging, resetState]);

  const updateColumnWidth = useCallback(
    (widthChange) => {
      if (!activeCell) {
        throw new Error('TableCellResizer: Expected active cell.');
      }

      editor.update(
        () => {
          const tableCellNode = $getNearestNodeFromDOMNode(activeCell.elem);
          if (!$isTableCellNode(tableCellNode)) {
            throw new Error('TableCellResizer: Table cell node not found.');
          }

          const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
          const [tableMap] = $computeTableMapSkipCellCheck(
            tableNode,
            null,
            null
          );
          const columnIndex = getCellColumnIndex(tableCellNode, tableMap);
          if (columnIndex === undefined) {
            throw new Error('TableCellResizer: Table column not found.');
          }

          const colWidths = tableNode.getColWidths();
          if (!colWidths) {
            return;
          }

          const width = colWidths[columnIndex];
          if (width === undefined) {
            return;
          }

          const newColWidths = [...colWidths];
          newColWidths[columnIndex] = Math.max(
            width + widthChange,
            MIN_COLUMN_WIDTH
          );
          tableNode.setColWidths(
            fitColumnWidths(newColWidths, getMaxTableWidth(editor))
          );
        },
        { tag: SKIP_SCROLL_INTO_VIEW_TAG }
      );
    },
    [activeCell, editor]
  );

  const finishResize = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!activeCell) {
        throw new Error('TableCellResizer: Expected active cell.');
      }

      if (pointerStartPosRef.current) {
        const { x } = pointerStartPosRef.current;
        const zoom = calculateZoomLevel(activeCell.elem);
        updateColumnWidth((event.clientX - x) / zoom);
      }

      resetState();
      document.removeEventListener('pointerup', finishResize);
      document.removeEventListener('pointercancel', finishResize);
    },
    [activeCell, resetState, updateColumnWidth]
  );

  const startResize = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!activeCell) {
        throw new Error('TableCellResizer: Expected active cell.');
      }

      pointerStartPosRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      setPointerCurrentPos(pointerStartPosRef.current);
      setIsDragging(true);

      document.addEventListener('pointerup', finishResize);
      document.addEventListener('pointercancel', finishResize);
    },
    [activeCell, finishResize]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener('pointerup', finishResize);
      document.removeEventListener('pointercancel', finishResize);
    };
  }, [finishResize]);

  const resizerStyle = useMemo(() => {
    if (!activeCell) {
      return undefined;
    }

    const { height, width, top, left } = activeCell.elem.getBoundingClientRect();
    const zoneWidth = 16;
    const tableRect = tableRectRef.current;
    const style = {
      backgroundColor: 'transparent',
      cursor: 'col-resize',
      height: `${height}px`,
      left: `${window.scrollX + left + width - zoneWidth / 2}px`,
      top: `${window.scrollY + top}px`,
      width: `${zoneWidth}px`,
    };

    if (isDragging && pointerCurrentPos && tableRect) {
      const zoom = calculateZoomLevel(activeCell.elem);
      style.top = `${window.scrollY + tableRect.top}px`;
      style.left = `${window.scrollX + pointerCurrentPos.x / zoom}px`;
      style.width = '3px';
      style.height = `${tableRect.height}px`;
      style.backgroundColor = 'var(--accent-blue)';
      return style;
    }

    if (isHoveringEdge && tableRect) {
      const halfZoneWidth = zoneWidth / 2;
      const highlightWidth = 2;
      const highlightStart = halfZoneWidth - highlightWidth / 2;
      style.top = `${window.scrollY + tableRect.top}px`;
      style.height = `${tableRect.height}px`;
      style.backgroundImage = `linear-gradient(90deg, transparent ${highlightStart}px, var(--accent-blue) ${highlightStart}px, var(--accent-blue) ${
        highlightStart + highlightWidth
      }px, transparent ${highlightStart + highlightWidth}px)`;
    }

    return style;
  }, [activeCell, isDragging, isHoveringEdge, pointerCurrentPos]);

  return (
    <div ref={resizerRef} className={styles.resizerRoot}>
      {activeCell && (
        <div
          className={styles.resizer}
          style={resizerStyle}
          onPointerEnter={() => {
            if (!isDragging) setIsHoveringEdge(true);
          }}
          onPointerLeave={() => {
            if (!isDragging) setIsHoveringEdge(false);
          }}
          onPointerDown={startResize}
        />
      )}
    </div>
  );
}

export default function TableCellResizerPlugin() {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();

  return useMemo(
    () =>
      isEditable
        ? createPortal(<TableCellResizer editor={editor} />, document.body)
        : null,
    [editor, isEditable]
  );
}
