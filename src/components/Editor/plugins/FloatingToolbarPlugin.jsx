import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { TOGGLE_LINK_COMMAND, $isLinkNode } from '@lexical/link';
import { mergeRegister } from '@lexical/utils';

import { FaBold, FaItalic, FaStrikethrough, FaLink, FaCode, FaEyeSlash } from 'react-icons/fa';

import styles from './FloatingToolbarPlugin.module.css';
import LinkPopover from './LinkPopover';
import { $createSpoilerNode, $isSpoilerNode } from '../nodes/SpoilerNode';

function FloatingToolbar({ editor, isReadMode }) {
  const toolbarRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [isSpoiler, setIsSpoiler] = useState(false);

  // Link popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkPopoverPosition, setLinkPopoverPosition] = useState({ x: 0, y: 0 });

  // Drag-state guard. Set true on mousedown, cleared on mouseup. We use mouse
  // events rather than pointer events because trackpad two-finger scrolling
  // fires `pointercancel` mid-drag, which would prematurely clear the flag
  // and re-introduce the sling. Mouse events stay clean during scroll-wheel
  // and trackpad-scroll usage.
  const isDraggingRef = useRef(false);

  // rAF coalescer for selection-change / update-listener double-fires.
  const rafRef = useRef(null);

  const updateToolbarImpl = useCallback(() => {
    if (isReadMode) {
      setIsVisible(false);
      return;
    }

    if (linkPopoverOpen) return;

    const selection = $getSelection();

    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      setIsVisible(false);
      return;
    }

    setIsBold(selection.hasFormat('bold'));
    setIsItalic(selection.hasFormat('italic'));
    setIsStrikethrough(selection.hasFormat('strikethrough'));
    setIsCode(selection.hasFormat('code'));

    const node = selection.anchor.getNode();
    const parent = node.getParent();
    setIsLink($isLinkNode(parent) || $isLinkNode(node));
    setIsSpoiler($isSpoilerNode(parent) || $isSpoilerNode(node));

    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.rangeCount === 0) {
      setIsVisible(false);
      return;
    }

    const range = nativeSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (!(rect.width > 0 && rect.height > 0 && rect.bottom > rect.top)) {
      setIsVisible(false);
      return;
    }

    setPosition({
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + window.scrollY - 10,
    });
    setIsVisible(true);
  }, [linkPopoverOpen, isReadMode]);

  // Coalesce all incoming triggers (selection changes, editor updates,
  // mouseup) into one rAF tick. Skipped while a mouse drag is in flight.
  const scheduleUpdate = useCallback(() => {
    if (isDraggingRef.current) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      editor.getEditorState().read(updateToolbarImpl);
    });
  }, [editor, updateToolbarImpl]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => {
        scheduleUpdate();
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          scheduleUpdate();
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor, scheduleUpdate]);

  // Mouse-event drag tracking. mousedown sets the flag; mouseup clears it
  // and schedules one final settled-state update via rAF (bypassing the
  // in-flight guard by reading the editor state directly).
  useEffect(() => {
    const handleMouseDown = () => {
      isDraggingRef.current = true;
    };
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        editor.getEditorState().read(updateToolbarImpl);
      });
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [editor, updateToolbarImpl]);

  // Hide on scroll. Standard editor UX (Notion, Medium, etc.): the moment any
  // scroll happens, hide the floating toolbar — its absolute coordinates were
  // captured against the pre-scroll viewport, so leaving it visible after a
  // scroll-wheel tick or trackpad scroll causes the cached position to fight
  // the new layout, which is what produced the "sling" when users scrolled
  // mid-drag or shift-clicked after scrolling. Capture phase + true on the
  // third arg because `scroll` events don't bubble; this catches scroll on
  // any ancestor (window, the editor's overflow container, modal scroll
  // wrappers). The toolbar will reappear naturally on the next selection
  // change or mouseup.
  useEffect(() => {
    const handleScroll = () => {
      // Reading state via setter idempotency — React bails when value
      // unchanged, so calling on every scroll tick is cheap.
      setIsVisible(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // Hide on click outside (existing — kept for parity)
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        // Let the selection change handler deal with visibility
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const formatBold = (e) => {
    e.preventDefault();
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
  };

  const formatItalic = (e) => {
    e.preventDefault();
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
  };

  const formatStrikethrough = (e) => {
    e.preventDefault();
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
  };

  const formatCode = (e) => {
    e.preventDefault();
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
  };

  const toggleSpoiler = (e) => {
    e.preventDefault();
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const anchorNode = selection.anchor.getNode();
      const existingSpoiler = $isSpoilerNode(anchorNode)
        ? anchorNode
        : $isSpoilerNode(anchorNode.getParent())
          ? anchorNode.getParent()
          : null;

      if (existingSpoiler) {
        const text = existingSpoiler.getTextContent();
        if (text) existingSpoiler.replace($createTextNode(text));
        else existingSpoiler.remove();
        return;
      }

      const text = selection.getTextContent();
      if (!text) return;
      const spoilerNode = $createSpoilerNode();
      spoilerNode.append($createTextNode(text));
      selection.insertNodes([spoilerNode]);
    });
  };

  const insertLink = useCallback(
    (e) => {
      e.preventDefault();

      if (isLink) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        return;
      }

      const nativeSelection = window.getSelection();
      if (nativeSelection && nativeSelection.rangeCount > 0) {
        const range = nativeSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setLinkPopoverPosition({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 10,
        });
      }

      setLinkPopoverOpen(true);
    },
    [isLink, editor]
  );

  // Refocus without triggering scrollIntoView. Lexical's editor.focus() ends
  // up calling .focus() on the contenteditable without preventScroll.
  const refocusEditor = useCallback(() => {
    const root = editor.getRootElement();
    if (root) root.focus({ preventScroll: true });
  }, [editor]);

  const handleLinkConfirm = useCallback(
    (url) => {
      refocusEditor();
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    },
    [editor, refocusEditor]
  );

  const handleLinkPopoverClose = useCallback(() => {
    setLinkPopoverOpen(false);
    refocusEditor();
  }, [refocusEditor]);

  // Container-level focus guard. Any mousedown on the toolbar (including
  // padding, gaps between buttons, the toolbar background) is preventDefault'd
  // so it can never steal focus from the editor and thus never collapse the
  // selection out from under us. Per-button handlers still preventDefault
  // their own events as belt-and-suspenders.
  const handleToolbarMouseDown = (e) => {
    e.preventDefault();
  };

  if (!isVisible && !linkPopoverOpen) return null;

  return createPortal(
    <>
      {isVisible && (
        <div
          ref={toolbarRef}
          className={styles.floatingToolbar}
          onMouseDown={handleToolbarMouseDown}
          style={{
            position: 'absolute',
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
          data-toolbar
        >
          <button
            onMouseDown={formatBold}
            className={`${styles.btn} ${isBold ? styles.active : ''}`}
            title="Bold"
          >
            <FaBold />
          </button>
          <button
            onMouseDown={formatItalic}
            className={`${styles.btn} ${isItalic ? styles.active : ''}`}
            title="Italic"
          >
            <FaItalic />
          </button>
          <button
            onMouseDown={formatStrikethrough}
            className={`${styles.btn} ${isStrikethrough ? styles.active : ''}`}
            title="Strikethrough"
          >
            <FaStrikethrough />
          </button>
          <button
            onMouseDown={formatCode}
            className={`${styles.btn} ${isCode ? styles.active : ''}`}
            title="Inline Code"
          >
            <FaCode />
          </button>
          <button
            onMouseDown={insertLink}
            className={`${styles.btn} ${isLink ? styles.active : ''}`}
            title="Link"
          >
            <FaLink />
          </button>
          <button
            onMouseDown={toggleSpoiler}
            className={`${styles.btn} ${isSpoiler ? styles.active : ''}`}
            title={isSpoiler ? 'Unhide' : 'Hide (spoiler)'}
          >
            <FaEyeSlash />
          </button>
        </div>
      )}

      {/* Link popover */}
      <LinkPopover
        isOpen={linkPopoverOpen}
        onClose={handleLinkPopoverClose}
        onConfirm={handleLinkConfirm}
        anchorPosition={linkPopoverPosition}
        hasSelectedText={true}
      />
    </>,
    document.body
  );
}

function FloatingToolbarPlugin({ isReadMode }) {
  const [editor] = useLexicalComposerContext();
  return <FloatingToolbar editor={editor} isReadMode={isReadMode}/>;
}

export default FloatingToolbarPlugin;
