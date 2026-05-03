import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $createTextNode,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FOCUS_COMMAND,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListNode,
} from '@lexical/list';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
} from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createCodeNode, $isCodeNode } from '@lexical/code';
import { $findMatchingParent, $getNearestNodeOfType, mergeRegister } from '@lexical/utils';
import { TOGGLE_LINK_COMMAND, $isLinkNode, $createLinkNode } from '@lexical/link';
import { INSERT_TABLE_COMMAND } from '@lexical/table';

import {
  FaBold,
  FaItalic,
  FaUnderline,
  FaStrikethrough,
  FaListUl,
  FaListOl,
  FaQuoteRight,
  FaCode,
  FaLink,
  FaUndo,
  FaRedo,
  FaCheckSquare,
  FaTable,
  FaImage,
} from 'react-icons/fa';
import { LuHeading1, LuHeading2, LuHeading3, LuPilcrow } from 'react-icons/lu';

import styles from './ToolbarPlugin.module.css';
import LinkPopover from './LinkPopover';
import { useSettings } from '../../../contexts/SettingsContext';
import { useApi } from '../../../contexts/ApiContext';
import { insertImagesFromFiles } from './ImagePlugin';

function ToolbarPlugin({ isReadMode }) {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [blockType, setBlockType] = useState('paragraph');

  // Dock visibility states
  const [isHovering, setIsHovering] = useState(false);
  const [isDockVisible, setIsDockVisible] = useState(true); // Visible by default
  const { settings } = useSettings();

  // Link popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkPopoverPosition, setLinkPopoverPosition] = useState({ x: 0, y: 0 });
  const [hasSelectedText, setHasSelectedText] = useState(false);

  const dockRef = useRef(null);
  const triggerRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  // Position and layout state for centering on editor
  const [dockLayout, setDockLayout] = useState({
    left: '50%',
    triggerLeft: '50%',
    maxWidth: 'none',
    minLeft: 0,
  });

  // Determine if dock should be shown
  // When autoHideToolbar is OFF, dock is always visible (in write mode)
  const shouldShowDock = !settings.autoHideToolbar || isDockVisible || isHovering;

  // Calculate dock position based on editor container and sidebar
  const updateDockLayout = useCallback(() => {
    const editorContainer = document.querySelector('[data-editor-container]');
    if (!editorContainer) return;

    const rect = editorContainer.getBoundingClientRect();
    const editorLeft = rect.left;
    const editorWidth = rect.width;
    const editorRight = rect.right;
    const centerX = editorLeft + editorWidth / 2;

    // Constrain max width to editor width minus padding (32px each side)
    const maxWidth = Math.max(200, editorWidth - 64);

    setDockLayout({
      left: `${centerX}px`,
      triggerLeft: `${centerX}px`,
      maxWidth: `${maxWidth}px`,
      minLeft: editorLeft,
      editorRight: editorRight,
    });
  }, []);

  // Update layout on mount, resize, scroll, and sidebar changes
  useEffect(() => {
    updateDockLayout();

    // Throttled update using requestAnimationFrame for smooth animations
    let rafId = null;
    const throttledUpdate = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updateDockLayout();
        rafId = null;
      });
    };

    window.addEventListener('resize', throttledUpdate);
    window.addEventListener('scroll', throttledUpdate, true);

    // Use ResizeObserver for editor container size changes
    const editorContainer = document.querySelector('[data-editor-container]');
    let resizeObserver;
    if (editorContainer && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(throttledUpdate);
      resizeObserver.observe(editorContainer);
    }

    // Use MutationObserver to detect sidebar collapse/expand (class changes)
    // We continuously update during sidebar transition for smooth movement
    const sidebar = document.querySelector('[class*="sidebar"]');
    let mutationObserver;
    let animationInterval = null;

    if (sidebar && typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            // Start continuous updates during the transition (0.3s = 300ms)
            // Update every frame for smooth movement
            if (animationInterval) clearInterval(animationInterval);

            const startTime = performance.now();
            const duration = 350; // slightly longer than sidebar transition

            const animate = () => {
              const elapsed = performance.now() - startTime;
              updateDockLayout();

              if (elapsed < duration) {
                requestAnimationFrame(animate);
              }
            };

            requestAnimationFrame(animate);
          }
        }
      });
      mutationObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    return () => {
      window.removeEventListener('resize', throttledUpdate);
      window.removeEventListener('scroll', throttledUpdate, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (animationInterval) clearInterval(animationInterval);
    };
  }, [updateDockLayout]);

  // Handle editor focus/blur
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          setIsDockVisible(false); // Hide when editor gains focus
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          // Small delay to check if focus moved to dock
          setTimeout(() => {
            const activeElement = document.activeElement;
            const isDockFocused = dockRef.current?.contains(activeElement);
            if (!isDockFocused) {
              setIsDockVisible(true); // Show when editor loses focus
            }
          }, 10);
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor]);

  // Handle mouse entering trigger zone
  const handleTriggerMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHovering(true);
  }, []);

  // Handle mouse leaving trigger zone or dock
  const handleMouseLeave = useCallback(() => {
    // Small delay to prevent flicker when moving between trigger and dock
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 150);
  }, []);

  // Handle mouse entering dock (to prevent hide when moving from trigger to dock)
  const handleDockMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHovering(true);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsCode(selection.hasFormat('code'));

      const node = selection.anchor.getNode();
      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));

      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow();
      }

      const elementKey = element.getKey();
      const elementDOM = editor.getElementByKey(elementKey);

      if (elementDOM !== null) {
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType(anchorNode, ListNode);
          const type = parentList ? parentList.getListType() : element.getListType();
          setBlockType(type === 'check' ? 'check' : type === 'number' ? 'ol' : 'ul');
        } else {
          const type = $isHeadingNode(element)
            ? element.getTag()
            : $isCodeNode(element)
            ? 'code'
            : element.getType();
          setBlockType(type);
        }
      }
    }
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      )
    );
  }, [editor, updateToolbar]);

  // Format handlers
  const formatBold = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
  const formatItalic = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
  const formatUnderline = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
  const formatStrikethrough = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');

  const formatHeading = (headingTag) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === headingTag) {
          $setBlocksType(selection, () => {
            const { $createParagraphNode } = require('lexical');
            return $createParagraphNode();
          });
        } else {
          $setBlocksType(selection, () => $createHeadingNode(headingTag));
        }
      }
    });
  };

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const { $createParagraphNode } = require('lexical');
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const formatQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === 'quote') {
          const { $createParagraphNode } = require('lexical');
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      }
    });
  };

  const formatCodeBlock = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === 'code') {
          const { $createParagraphNode } = require('lexical');
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createCodeNode());
        }
      }
    });
  };

  const formatList = (listType) => {
    if (listType === 'ul') {
      if (blockType === 'ul') {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      } else {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      }
    } else if (listType === 'ol') {
      if (blockType === 'ol') {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      } else {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      }
    } else if (listType === 'check') {
      if (blockType === 'check') {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      } else {
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      }
    }
  };

  const insertLink = useCallback(() => {
    if (isLink) {
      // Remove existing link
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
      return;
    }

    // Check if there's selected text
    const nativeSelection = window.getSelection();
    const selectedText = nativeSelection?.toString().trim() || '';
    setHasSelectedText(selectedText.length > 0);

    // Get position for popover - position above the dock
    const dock = dockRef.current;
    if (dock) {
      const rect = dock.getBoundingClientRect();
      setLinkPopoverPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10, // Position above the dock
      });
    }

    setLinkPopoverOpen(true);
  }, [isLink, editor]);

  const handleLinkConfirm = useCallback(
    (url, linkText) => {
      editor.focus();

      if (linkText) {
        // No text was selected, insert link node with provided text
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const linkNode = $createLinkNode(url);
            const textNode = $createTextNode(linkText);
            linkNode.append(textNode);
            selection.insertNodes([linkNode]);
          }
        });
      } else {
        // Text was selected, apply link to selection
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
      }
    },
    [editor]
  );

  const handleLinkPopoverClose = useCallback(() => {
    setLinkPopoverOpen(false);
    editor.focus();
  }, [editor]);

  const { authFetch, API } = useApi();

  const openImagePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        insertImagesFromFiles(editor, authFetch, API, files);
      }
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }, [editor, authFetch, API]);

  const insertTable = useCallback(() => {
    // 2x2 default (header row + one body row, two columns). Lexical inserts
    // at the current selection — clicking with caret on an empty paragraph
    // drops the table cleanly into the document flow.
    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      columns: '2',
      rows: '2',
      includeHeaders: true,
    });
  }, [editor]);

  const undo = () => editor.dispatchCommand(UNDO_COMMAND, undefined);
  const redo = () => editor.dispatchCommand(REDO_COMMAND, undefined);

  // Hide the entire toolbar dock in read mode
  if (isReadMode) return null;

  return createPortal(
    <>
      {/* Invisible trigger zone at bottom of viewport, centered on editor */}
      <div
        ref={triggerRef}
        className={styles.triggerZone}
        style={{ left: dockLayout.triggerLeft, maxWidth: dockLayout.maxWidth }}
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-hidden="true"
      />

      {/* Floating dock, centered on editor */}
      <div
        ref={dockRef}
        className={`${styles.dock} ${shouldShowDock ? styles.visible : styles.hidden}`}
        style={{ left: dockLayout.left, maxWidth: dockLayout.maxWidth }}
        onMouseEnter={handleDockMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-toolbar
        role="toolbar"
        aria-label="Text formatting toolbar"
      >
        <div className={styles.dockContent}>
          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className={styles.toolbarBtn}
            title="Undo (Ctrl+Z)"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaUndo />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={styles.toolbarBtn}
            title="Redo (Ctrl+Y)"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaRedo />
          </button>

          <div className={styles.divider} />

          {/* Text formatting */}
          <button
            onClick={formatBold}
            className={`${styles.toolbarBtn} ${isBold ? styles.active : ''}`}
            title="Bold (Ctrl+B)"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaBold />
          </button>
          <button
            onClick={formatItalic}
            className={`${styles.toolbarBtn} ${isItalic ? styles.active : ''}`}
            title="Italic (Ctrl+I)"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaItalic />
          </button>
          <button
            onClick={formatUnderline}
            className={`${styles.toolbarBtn} ${isUnderline ? styles.active : ''}`}
            title="Underline (Ctrl+U)"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaUnderline />
          </button>
          <button
            onClick={formatStrikethrough}
            className={`${styles.toolbarBtn} ${isStrikethrough ? styles.active : ''}`}
            title="Strikethrough"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaStrikethrough />
          </button>

          <div className={styles.divider} />

          {/* Block types */}
          <button
            onClick={formatParagraph}
            className={`${styles.toolbarBtn} ${blockType === 'paragraph' ? styles.active : ''}`}
            title="Paragraph"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <LuPilcrow />
          </button>
          <button
            onClick={() => formatHeading('h1')}
            className={`${styles.toolbarBtn} ${blockType === 'h1' ? styles.active : ''}`}
            title="Heading 1"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <LuHeading1 />
          </button>
          <button
            onClick={() => formatHeading('h2')}
            className={`${styles.toolbarBtn} ${blockType === 'h2' ? styles.active : ''}`}
            title="Heading 2"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <LuHeading2 />
          </button>
          <button
            onClick={() => formatHeading('h3')}
            className={`${styles.toolbarBtn} ${blockType === 'h3' ? styles.active : ''}`}
            title="Heading 3"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <LuHeading3 />
          </button>

          <div className={styles.divider} />

          {/* Lists */}
          <button
            onClick={() => formatList('ul')}
            className={`${styles.toolbarBtn} ${blockType === 'ul' ? styles.active : ''}`}
            title="Bullet List"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaListUl />
          </button>
          <button
            onClick={() => formatList('ol')}
            className={`${styles.toolbarBtn} ${blockType === 'ol' ? styles.active : ''}`}
            title="Numbered List"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaListOl />
          </button>
          <button
            onClick={() => formatList('check')}
            className={`${styles.toolbarBtn} ${blockType === 'check' ? styles.active : ''}`}
            title="Checklist"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaCheckSquare />
          </button>

          <div className={styles.divider} />

          {/* Quote and Code */}
          <button
            onClick={formatQuote}
            className={`${styles.toolbarBtn} ${blockType === 'quote' ? styles.active : ''}`}
            title="Quote"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaQuoteRight />
          </button>
          <button
            onClick={formatCodeBlock}
            className={`${styles.toolbarBtn} ${blockType === 'code' ? styles.active : ''}`}
            title="Code Block"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaCode />
          </button>

          <div className={styles.divider} />

          {/* Link */}
          <button
            onClick={insertLink}
            className={`${styles.toolbarBtn} ${isLink ? styles.active : ''}`}
            title="Insert Link"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaLink />
          </button>

          {/* Table */}
          <button
            onClick={insertTable}
            className={styles.toolbarBtn}
            title="Insert Table"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaTable />
          </button>

          {/* Image */}
          <button
            onClick={openImagePicker}
            className={styles.toolbarBtn}
            title="Insert Image"
            tabIndex={shouldShowDock ? 0 : -1}
          >
            <FaImage />
          </button>
        </div>

        {/* Future: settings toggle button (always-visible vs auto-hide) can go here */}
      </div>

      {/* Link popover */}
      <LinkPopover
        isOpen={linkPopoverOpen}
        onClose={handleLinkPopoverClose}
        onConfirm={handleLinkConfirm}
        anchorPosition={linkPopoverPosition}
        hasSelectedText={hasSelectedText}
      />
    </>,
    document.body
  );
}

export default ToolbarPlugin;
