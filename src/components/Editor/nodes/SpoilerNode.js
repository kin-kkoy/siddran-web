import { ElementNode } from 'lexical';

// Discord-style spoiler: wraps inline content. The DOM stays hidden until the
// user clicks it, after which it is permanently revealed for that mount.
// Markdown form: ||hidden text||.
export class SpoilerNode extends ElementNode {
  static getType() {
    return 'spoiler';
  }

  static clone(node) {
    return new SpoilerNode(node.__key);
  }

  createDOM() {
    const span = document.createElement('span');
    span.className = 'spoiler spoiler-hidden';
    span.dataset.revealed = 'false';
    // contenteditable="false" makes this span an atomic non-editable inline
    // inside Lexical's contenteditable root. The browser skips it during text
    // selection and arrow-key navigation, so dragging across a hidden spoiler
    // jumps over it instead of including its text. CSS `user-select: none` is
    // weakly enforced inside contenteditable; this attribute is the reliable
    // mechanism. Removed on reveal (below) so the now-visible content
    // participates in selection and editing normally.
    span.contentEditable = 'false';
    span.addEventListener('click', (event) => {
      if (span.dataset.revealed === 'true') return;
      event.stopPropagation();
      span.dataset.revealed = 'true';
      span.classList.remove('spoiler-hidden');
      span.classList.add('spoiler-revealed');
      span.removeAttribute('contenteditable');
    });
    return span;
  }

  // The model carries no per-instance state (revealed is purely visual), so
  // there's nothing to reconcile — keep the existing DOM.
  updateDOM() {
    return false;
  }

  static importJSON() {
    return $createSpoilerNode();
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'spoiler',
      version: 1,
    };
  }

  isInline() {
    return true;
  }

  canInsertTextBefore() {
    return false;
  }

  canInsertTextAfter() {
    return false;
  }

  extractWithChild() {
    return true;
  }
}

export function $createSpoilerNode() {
  return new SpoilerNode();
}

export function $isSpoilerNode(node) {
  return node instanceof SpoilerNode;
}
