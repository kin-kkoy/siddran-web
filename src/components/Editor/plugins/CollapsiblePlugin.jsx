import { useEffect, useRef, useState, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $isParagraphNode } from 'lexical';
import { $isHeadingNode } from '@lexical/rich-text';
import { $isListNode, $isListItemNode } from '@lexical/list';
import { loadCollapsed, saveCollapsed } from '../utils/collapseStorage';
import styles from './CollapsiblePlugin.module.css';

// Stable-ID prefixes — used by the GC pass to identify entries this plugin
// owns. Anything matching one of these and NOT in the current scan is dropped.
const MANAGED_ID_RE = /^(?:h[1-6]:|l:|p:)/;

// Delay between an anchor mouseleave and clearing the hover state. Lets the
// cursor traverse the gap from the heading text to the chevron in the gutter
// without the chevron disappearing mid-motion.
const HOVER_LINGER_MS = 150;

// Lucide-style right-pointing chevron. CSS rotates it to point down when
// expanded (default) or right when collapsed.
function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

// ---------- Stable ID helpers ----------
function textPrefix(text) {
  return (text || '').trim().slice(0, 40);
}

// ---------- Universal scanner ----------
// Walks the Lexical model in document order and produces:
//   foldParents:  [{ key, stableId, kind, anchorKey, sectionPath }]
//   blocksByKey:  Map<NodeKey, { sectionPath }>
// sectionPath is the chain of *enclosing* fold parents. A fold parent is
// never hidden by its own collapse — only by an ancestor's.
function scanHierarchy(editor) {
  return editor.read(() => {
    const root = $getRoot();
    const blocks = root.getChildren();

    const headingStack = [];
    const paraStack = [];
    const blocksByKey = new Map();
    const foldParents = [];

    const headingOrdinals = new Map(); // depth → next ordinal
    const ordinals = { list: 0, para: 0 };

    for (let i = 0; i < blocks.length; i++) {
      const node = blocks[i];

      if ($isHeadingNode(node)) {
        const depth = parseInt(node.getTag().slice(1), 10) || 1;
        // Pop heading entries at or below this depth.
        while (headingStack.length > 0 && headingStack[headingStack.length - 1].depth >= depth) {
          headingStack.pop();
        }
        // Headings reset paraStack — they break indent flow.
        paraStack.length = 0;

        const key = node.getKey();
        const sectionPath = [...headingStack, ...paraStack]; // parents only
        blocksByKey.set(key, { sectionPath });

        if (headingHasContent(blocks, i, depth)) {
          const ord = (headingOrdinals.get(depth) || 0) + 1;
          headingOrdinals.set(depth, ord);
          const stableId = `h${depth}:${ord}:${textPrefix(node.getTextContent())}`;
          const entry = {
            key, kind: 'heading', depth, stableId,
            anchorKey: key, sectionPath,
          };
          foldParents.push(entry);
          headingStack.push(entry);
        }
        continue;
      }

      if ($isParagraphNode(node)) {
        const indent = typeof node.getIndent === 'function' ? node.getIndent() : 0;
        // Pop para entries at or above this indent.
        while (paraStack.length > 0 && paraStack[paraStack.length - 1].indent >= indent) {
          paraStack.pop();
        }
        const key = node.getKey();
        const sectionPath = [...headingStack, ...paraStack];
        blocksByKey.set(key, { sectionPath });

        if (paragraphHasContinuation(blocks, i, indent)) {
          ordinals.para += 1;
          const stableId = `p:${ordinals.para}:${textPrefix(node.getTextContent())}`;
          const entry = {
            key, kind: 'para', indent, stableId,
            anchorKey: key, sectionPath,
          };
          foldParents.push(entry);
          paraStack.push(entry);
        }
        continue;
      }

      if ($isListNode(node)) {
        const key = node.getKey();
        const sectionPath = [...headingStack, ...paraStack];
        blocksByKey.set(key, { sectionPath });
        walkListSubtree(node, sectionPath, { foldParents, blocksByKey, ordinals });
        continue;
      }

      // Other block kinds (code, quote, etc.) — annotate, no fold parent.
      const sectionPath = [...headingStack, ...paraStack];
      blocksByKey.set(node.getKey(), { sectionPath });
    }

    return { foldParents, blocksByKey };
  });
}

// True if the heading at `fromIndex` has any content under it before the
// next equal-or-higher heading.
function headingHasContent(blocks, fromIndex, depth) {
  for (let j = fromIndex + 1; j < blocks.length; j++) {
    const sib = blocks[j];
    if ($isHeadingNode(sib)) {
      const sibDepth = parseInt(sib.getTag().slice(1), 10) || 1;
      if (sibDepth <= depth) return false;
      return true;
    }
    return true;
  }
  return false;
}

// True if the paragraph at `fromIndex` has any following sibling at higher
// indent, before either a heading (which breaks indent flow) or a paragraph
// at equal-or-lower indent.
function paragraphHasContinuation(blocks, fromIndex, baseIndent) {
  for (let j = fromIndex + 1; j < blocks.length; j++) {
    const sib = blocks[j];
    if ($isHeadingNode(sib)) return false;
    if ($isParagraphNode(sib)) {
      const sibIndent = typeof sib.getIndent === 'function' ? sib.getIndent() : 0;
      if (sibIndent > baseIndent) return true;
      if (sibIndent <= baseIndent) return false;
    }
    // Lists, code, quotes etc. don't break para flow but also don't trigger.
  }
  return false;
}

// Recursively walk a ListNode's children, building fold parents for real list
// items that have nested children (either via the wrapper-li convention or
// via a directly-nested ListNode child).
function walkListSubtree(listNode, parentPath, ctx) {
  const items = listNode.getChildren().filter($isListItemNode);
  const listType = typeof listNode.getListType === 'function' ? listNode.getListType() : 'bullet';
  let lastRealEntry = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = item.getKey();
    const children = item.getChildren();
    const firstChild = children[0];
    const isWrapper = children.length === 1 && firstChild && $isListNode(firstChild);

    if (isWrapper) {
      // Wrapper: its inner ListNode belongs to the previous real item (if any).
      // Wrapper + descendants get the extended path so they hide together.
      const childPath = lastRealEntry ? [...parentPath, lastRealEntry] : parentPath;
      ctx.blocksByKey.set(key, { sectionPath: childPath });
      walkListSubtree(firstChild, childPath, ctx);
      continue;
    }

    // Real item.
    ctx.blocksByKey.set(key, { sectionPath: parentPath });

    // Determine if this real item is a fold parent: either it directly
    // contains a nested ListNode, or its next sibling is a wrapper li.
    const directNested = children.find($isListNode) || null;
    let isFoldParent = false;
    if (directNested) {
      isFoldParent = true;
    } else {
      const next = items[i + 1];
      if (next) {
        const nextChildren = next.getChildren();
        if (nextChildren.length === 1 && $isListNode(nextChildren[0])) {
          isFoldParent = true;
        }
      }
    }

    if (isFoldParent) {
      ctx.ordinals.list += 1;
      const stableId = `l:${ctx.ordinals.list}:${textPrefix(item.getTextContent())}`;
      lastRealEntry = {
        key, kind: 'list', listType, stableId,
        anchorKey: key, sectionPath: parentPath,
      };
      ctx.foldParents.push(lastRealEntry);

      if (directNested) {
        // Walk the directly-nested list with the extended path right now;
        // a future wrapper sibling (rare) would still see lastRealEntry.
        const childPath = [...parentPath, lastRealEntry];
        ctx.blocksByKey.set(directNested.getKey(), { sectionPath: childPath });
        walkListSubtree(directNested, childPath, ctx);
      }
    } else {
      lastRealEntry = null;
    }
  }
}

// ---------- The plugin ----------
function CollapsiblePlugin({ noteId }) {
  const [editor] = useLexicalComposerContext();
  const [items, setItems] = useState([]);
  // stableId of the fold parent whose anchor (or chevron) is currently
  // hovered. Drives chevron visibility — Obsidian-style hover-only reveal.
  const [hoveredId, setHoveredId] = useState(null);
  // Set<stableId> of currently-collapsed sections.
  const collapsedRef = useRef(new Set());
  // Session-only Map<NodeKey, stableId> from the previous scan; used to
  // migrate fold state when an anchor's text is edited (NodeKey stable,
  // stableId changes).
  const nodeKeyToStableIdRef = useRef(new Map());
  // Latest foldParents from the most recent scan — exposed to the mousemove
  // handler via a ref so it can hit-test without re-binding the listener.
  const foldParentsRef = useRef([]);
  // Mirror of hoveredId for use inside non-React event handlers.
  const hoveredIdRef = useRef(null);
  const overlayRef = useRef(null);
  const rafRef = useRef(0);
  const hoverTimeoutRef = useRef(null);

  // Hydrate persisted state when the note changes; reset session shadow.
  useEffect(() => {
    collapsedRef.current = loadCollapsed(noteId);
    nodeKeyToStableIdRef.current = new Map();
  }, [noteId]);

  const setHoverNow = useCallback((id) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredId(id);
  }, []);

  const scheduleHoverClear = useCallback((id) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredId(prev => (prev === id ? null : prev));
      hoverTimeoutRef.current = null;
    }, HOVER_LINGER_MS);
  }, []);

  const rescan = useCallback(() => {
    const root = editor.getRootElement();
    const overlay = overlayRef.current;
    if (!root || !overlay) return;
    const originRect = overlay.getBoundingClientRect();

    const { foldParents, blocksByKey } = scanHierarchy(editor);
    const collapsed = collapsedRef.current;
    const prevMap = nodeKeyToStableIdRef.current;
    let mutated = false;

    // Rename retention: same NodeKey, different stableId, old was collapsed
    // → migrate to new stableId.
    for (const fp of foldParents) {
      const prevId = prevMap.get(fp.key);
      if (prevId && prevId !== fp.stableId && collapsed.has(prevId)) {
        collapsed.delete(prevId);
        collapsed.add(fp.stableId);
        mutated = true;
      }
    }

    // Refresh shadow map for next scan.
    const nextMap = new Map();
    for (const fp of foldParents) nextMap.set(fp.key, fp.stableId);
    nodeKeyToStableIdRef.current = nextMap;

    // GC orphaned IDs across all three managed kinds.
    const derivable = new Set(foldParents.map(fp => fp.stableId));
    for (const id of [...collapsed]) {
      if (MANAGED_ID_RE.test(id) && !derivable.has(id)) {
        collapsed.delete(id);
        mutated = true;
      }
    }

    // Apply visibility: for each block, hide iff any enclosing fold parent
    // is collapsed. OR-rule across the path → ancestor folds compose.
    for (const [key, info] of blocksByKey) {
      const el = editor.getElementByKey(key);
      if (!el) continue;
      const hide = info.sectionPath.some(p => collapsed.has(p.stableId));
      if (hide) el.setAttribute('data-folded', 'true');
      else el.removeAttribute('data-folded');
    }

    // Project chevrons. Skip parents that are themselves hidden by an
    // ancestor's fold (no point rendering an unreachable chevron).
    // Position is computed against the anchor's *content* edge — factoring in
    // padding/margin so Lexical's indentation styling doesn't pull the
    // chevron away from the visible text.
    const chevronItems = [];
    for (const fp of foldParents) {
      const hiddenByAncestor = fp.sectionPath.some(p => collapsed.has(p.stableId));
      if (hiddenByAncestor) continue;
      const anchorEl = editor.getElementByKey(fp.anchorKey);
      if (!anchorEl) continue;
      const rect = anchorEl.getBoundingClientRect();
      const style = window.getComputedStyle(anchorEl);

      const pt = parseFloat(style.paddingTop) || 0;
      const pl = parseFloat(style.paddingLeft) || 0;
      const ml = parseFloat(style.marginLeft) || 0;

      const textLeft = rect.left - originRect.left + pl + ml;
      // Lists draw markers outside the bounding box; the marker width varies
      // by list type, so each gets its own gutter.
      let gutter = 26; // headings + paragraph continuations
      if (fp.kind === 'list') {
        if (fp.listType === 'number') gutter = 52;       // numbers like "10." are wider
        else if (fp.listType === 'check') gutter = 25;   // checkbox sits close to text
        else gutter = 40;                                // bullet
      }

      chevronItems.push({
        id: fp.stableId,
        kind: fp.kind,
        top: rect.top - originRect.top + pt + 6, // nudge down to align with text baseline
        left: textLeft - gutter,
        isCollapsed: collapsed.has(fp.stableId),
      });
    }

    foldParentsRef.current = foldParents;
    if (mutated) saveCollapsed(noteId, collapsed);
    setItems(chevronItems);
  }, [editor, noteId]);

  // Keep hoveredIdRef in sync so the mousemove handler can read it without
  // closing over a stale value.
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);

  // ---- Hover detection via mousemove on the editor container ----
  // Listening on each anchor element directly fails because Lexical's block
  // elements (h1, p, li) only span the actual text width — cursor in the
  // empty end-of-line space or in the chevron gutter never enters them.
  // Instead we listen for mousemove on the container that surrounds the
  // editor, throttle with rAF, and hit-test the cursor's Y against each
  // fold-parent anchor's bounding rect. Hovering anywhere on a heading /
  // list item / continuation paragraph's vertical band activates its chevron.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const host = overlay.parentElement;
    if (!host) return;

    let scheduled = false;
    const onMouseMove = (e) => {
      if (scheduled) return;
      scheduled = true;
      const y = e.clientY;
      requestAnimationFrame(() => {
        scheduled = false;
        let foundId = null;
        for (const fp of foldParentsRef.current) {
          const el = editor.getElementByKey(fp.anchorKey);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (y >= rect.top && y <= rect.bottom) {
            foundId = fp.stableId;
            break;
          }
        }
        if (foundId) {
          if (foundId !== hoveredIdRef.current) setHoverNow(foundId);
          else setHoverNow(foundId); // also cancels any pending clear
        } else if (hoveredIdRef.current) {
          scheduleHoverClear(hoveredIdRef.current);
        }
      });
    };
    const onMouseLeave = () => {
      if (hoveredIdRef.current) scheduleHoverClear(hoveredIdRef.current);
    };

    host.addEventListener('mousemove', onMouseMove);
    host.addEventListener('mouseleave', onMouseLeave);
    return () => {
      host.removeEventListener('mousemove', onMouseMove);
      host.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [editor, setHoverNow, scheduleHoverClear]);

  // Pending hover-clear timer cleanup on unmount.
  useEffect(() => () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  // Recompute on every editor update (rAF-debounced).
  useEffect(() => {
    rescan();
    return editor.registerUpdateListener(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(rescan);
    });
  }, [editor, rescan]);

  // Re-measure on viewport reflow so chevrons stay aligned.
  useEffect(() => {
    const onResize = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(rescan);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [rescan]);

  const toggle = (id) => {
    const set = collapsedRef.current;
    if (set.has(id)) set.delete(id);
    else set.add(id);
    saveCollapsed(noteId, set);

    // Phase 1: apply DOM visibility attributes immediately so the user sees
    // the fold/unfold response without delay.
    rescan();

    // Phase 2: re-measure chevron coordinates after the browser has painted
    // the layout shift caused by the new data-folded attributes. Without the
    // double rAF the chevron positions trail by one interaction.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => rescan());
    });
  };

  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
      {items.map(item => {
        const visible = hoveredId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.toggle} ${item.isCollapsed ? styles.collapsed : ''}`}
            style={{
              top: `${item.top}px`,
              left: `${item.left}px`,
              opacity: visible ? 0.7 : 0,
              pointerEvents: visible ? 'auto' : 'none',
            }}
            onMouseEnter={() => setHoverNow(item.id)}
            onMouseLeave={() => scheduleHoverClear(item.id)}
            onMouseDown={(e) => { e.preventDefault(); toggle(item.id); }}
            title={item.isCollapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronIcon />
          </button>
        );
      })}
    </div>
  );
}

export default CollapsiblePlugin;
