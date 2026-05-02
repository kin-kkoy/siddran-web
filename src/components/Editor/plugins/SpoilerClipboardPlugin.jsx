import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

// Strip hidden-spoiler text from clipboard payloads.
//
// Why this exists: contenteditable="false" on the hidden spoiler makes the
// browser treat it as atomic for caret/keyboard purposes, so the visible
// selection appears to skip it. But the underlying DOM Range still spans the
// element — selection.toString() and the browser's default copy/cut handlers
// pull in its textContent regardless. That defeats the whole "hidden" point.
//
// Fix: intercept `copy` and `cut` on the editor's root, clone the selection's
// range fragment, drop any .spoiler-hidden subtrees, and write the sanitized
// text/HTML to the clipboard ourselves (after preventDefault).
//
// Cut behavior: we sanitize the clipboard but do NOT programmatically delete
// the selected content. Lexical's bulk-delete operations on a range that
// spans a non-editable spoiler can remove the spoiler from the node tree,
// which is a worse outcome than the cut not removing anything. Users who
// want cut semantics can copy first, then manually delete the visible parts.
function SpoilerClipboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleClipboard = (event) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (range.collapsed) return;

      const fragment = range.cloneContents();
      const hidden = fragment.querySelectorAll('.spoiler-hidden');
      // No hidden spoilers in the selection → let the browser handle it
      // normally so we don't strip styling or break edge cases.
      if (hidden.length === 0) return;

      hidden.forEach((el) => el.remove());

      const wrapper = document.createElement('div');
      wrapper.appendChild(fragment);
      const text = wrapper.textContent || '';
      const html = wrapper.innerHTML;

      event.preventDefault();
      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', html);
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        prevRootElement.removeEventListener('copy', handleClipboard);
        prevRootElement.removeEventListener('cut', handleClipboard);
      }
      if (rootElement) {
        rootElement.addEventListener('copy', handleClipboard);
        rootElement.addEventListener('cut', handleClipboard);
      }
    });
  }, [editor]);

  return null;
}

export default SpoilerClipboardPlugin;
