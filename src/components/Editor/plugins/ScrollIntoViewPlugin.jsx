import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ tags }) => {
      // Only scroll on user-initiated changes (typing, Enter, etc.)
      if (tags.has('history-merge') || tags.has('collaboration')) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.top === 0 && rect.bottom === 0)) return;

      // Find the scrollable container (the main content div with overflowY: auto)
      const editable = editor.getRootElement();
      if (!editable) return;

      let scrollParent = editable.parentElement;
      while (scrollParent) {
        const { overflowY } = window.getComputedStyle(scrollParent);
        if (overflowY === 'auto' || overflowY === 'scroll') break;
        scrollParent = scrollParent.parentElement;
      }
      if (!scrollParent) return;

      const containerRect = scrollParent.getBoundingClientRect();
      const margin = 60;

      if (rect.bottom > containerRect.bottom - margin) {
        scrollParent.scrollBy({ top: rect.bottom - containerRect.bottom + margin, behavior: 'smooth' });
      }
    });
  }, [editor]);

  return null;
}

export default ScrollIntoViewPlugin;
