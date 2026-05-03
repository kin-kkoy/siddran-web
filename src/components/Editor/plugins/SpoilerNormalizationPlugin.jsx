import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { SpoilerNode } from '../nodes/SpoilerNode';

// Removes empty SpoilerNodes in real time. Without this, deleting all content
// inside an existing spoiler leaves a ghost wrapper that serializes to
// <spoiler></spoiler> on disk. Lexical's transform pipeline runs after every
// editor update, so this fires on backspace/cut/typing-then-empty.
function SpoilerNormalizationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(SpoilerNode, (node) => {
      if (node.getChildrenSize() === 0 || node.getTextContent() === '') {
        node.remove();
      }
    });
  }, [editor]);

  return null;
}

export default SpoilerNormalizationPlugin;
