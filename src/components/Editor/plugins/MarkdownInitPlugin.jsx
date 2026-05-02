import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode } from 'lexical';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { remarkSpoiler } from '../utils/remarkSpoiler';
import { remarkUnderline } from '../utils/remarkUnderline';
import { mdastToLexical } from '../utils/mdastToLexical';

// Built once per module load — unified processors are reusable across calls.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSpoiler)
  .use(remarkUnderline);

function MarkdownInitPlugin({ initialMarkdown }) {
  const [editor] = useLexicalComposerContext();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (initialMarkdown === undefined || initialMarkdown === null) return;

    editor.update(() => {
      const root = $getRoot();
      root.clear();

      if (initialMarkdown) {
        // parse() runs parser plugins (remark-parse, remark-gfm); runSync()
        // runs transformer plugins (remarkSpoiler's text-splitter). Both are
        // required — calling only parse() leaves ||text|| as plain text.
        const tree = processor.runSync(processor.parse(initialMarkdown));
        mdastToLexical(tree, root);
      }

      // Lexical requires at least one block child; ensure an empty paragraph
      // when the input is empty or the parser produced no convertible nodes.
      if (root.getChildrenSize() === 0) {
        root.append($createParagraphNode());
      }
    });
  }, [editor, initialMarkdown]);

  return null;
}

export default MarkdownInitPlugin;
