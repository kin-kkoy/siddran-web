import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  PASTE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { remarkSpoiler } from '../utils/remarkSpoiler';
import { remarkUnderline } from '../utils/remarkUnderline';
import { mdastToLexicalNodes } from '../utils/mdastToLexical';

// Same processor MarkdownInitPlugin uses, so pasted markdown parses with the
// exact dialect notes are stored in. Built once per module load (reusable).
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSpoiler)
  .use(remarkUnderline);

// HTML that carries real formatting — when the clipboard has this we let
// Lexical's default rich paste run instead of markdown-parsing the plain text.
// This is what fires when copying from a web page or from inside the editor.
// Bare div/span/p/br are intentionally excluded so plain text some apps wrap
// in a container still gets markdown-parsed.
const RICH_HTML_RE = /<(strong|em|b|i|u|a|h[1-6]|ul|ol|li|table|img|blockquote|code|pre)\b/i;

// Cheap heuristic: does this plain text contain markdown worth parsing? Kept
// conservative-but-broad — paired inline tokens, or block-level line starts.
function looksLikeMarkdown(text) {
  return (
    /(\*\*|__)[^\s][\s\S]*?(\*\*|__)/.test(text) || // bold
    /(^|[^*])\*[^*\s][\s\S]*?\*/.test(text) ||       // italic
    /`[^`\n]+`/.test(text) ||                          // inline code
    /~~[^~\n]+~~/.test(text) ||                        // strikethrough
    /^#{1,6}\s/m.test(text) ||                         // heading
    /^\s*([-*+]|\d+\.)\s/m.test(text) ||               // list item
    /\[[^\]]+\]\([^)]+\)/.test(text) ||                // link
    /^>\s/m.test(text) ||                              // blockquote
    /<u>[\s\S]*?<\/u>/i.test(text) ||                  // underline
    /\|\|[\s\S]+?\|\|/.test(text)                      // spoiler
  );
}

// Auto-parse markdown on paste: when the clipboard holds plain text that looks
// like markdown, parse it and insert formatted nodes at the cursor. Images and
// rich-HTML pastes are deferred to their normal handlers.
function MarkdownPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!editor.isEditable()) return false;
        const cb = event?.clipboardData;
        if (!cb) return false;

        // Defer image pastes to ImagePlugin.
        if (cb.files && cb.files.length > 0) return false;

        const text = cb.getData('text/plain');
        if (!text) return false;

        // Respect rich/HTML pastes — keep Lexical's default behavior.
        const html = cb.getData('text/html');
        if (html && RICH_HTML_RE.test(html)) return false;

        if (!looksLikeMarkdown(text)) return false;

        // Parse outside the update (pure); build + insert nodes inside it.
        const tree = processor.runSync(processor.parse(text));
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const nodes = mdastToLexicalNodes(tree);
          // Pure-inline markdown (a single paragraph) should merge into the
          // current line at the cursor rather than force a block break — so
          // pasting "**hi**" mid-sentence stays inline.
          if (nodes.length === 1 && $isParagraphNode(nodes[0])) {
            selection.insertNodes(nodes[0].getChildren());
          } else {
            selection.insertNodes(nodes);
          }
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

export default MarkdownPastePlugin;
