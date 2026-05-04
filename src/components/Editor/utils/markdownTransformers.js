import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  LINK,
  ORDERED_LIST,
  UNORDERED_LIST,
  CHECK_LIST,
  CODE,
  HEADING,
  QUOTE,
} from '@lexical/markdown';
import { $createTextNode } from 'lexical';
import { $createSpoilerNode, $isSpoilerNode, SpoilerNode } from '../nodes/SpoilerNode';
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from '@lexical/react/LexicalHorizontalRuleNode';

// Horizontal rule (line must contain only `---`, `***`, or `___`).
// @lexical/markdown v0.39 stopped exporting HORIZONTAL_RULE, so we redefine
// it locally with the same shape Lexical uses internally.
const HORIZONTAL_RULE = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? '***' : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const line = $createHorizontalRuleNode();
    // If we're at the end of the document and not importing, insert before the
    // current empty paragraph so the cursor lands on a clean new line below.
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line);
    } else {
      parentNode.insertBefore(line);
    }
    line.selectNext();
  },
  type: 'element',
};

// Discord-style spoiler: ||hidden text||
const SPOILER_TRANSFORMER = {
  dependencies: [SpoilerNode],
  export: (node) => {
    if (!$isSpoilerNode(node)) return null;
    return `||${node.getTextContent()}||`;
  },
  importRegExp: /\|\|([^|]+)\|\|/,
  regExp: /\|\|([^|]+)\|\|$/,
  replace: (textNode, match) => {
    const [, content] = match;
    const spoilerNode = $createSpoilerNode();
    const inner = $createTextNode(content);
    inner.setFormat(textNode.getFormat());
    spoilerNode.append(inner);
    textNode.replace(spoilerNode);
  },
  trigger: '|',
  type: 'text-match',
};

// Combined transformers for all supported markdown syntax
export const TRANSFORMERS = [
  // Text formatting (inline)
  BOLD_ITALIC_STAR, // ***text***
  BOLD_ITALIC_UNDERSCORE, // ___text___
  BOLD_STAR, // **text**
  BOLD_UNDERSCORE, // __text__
  ITALIC_STAR, // *text*
  ITALIC_UNDERSCORE, // _text_
  STRIKETHROUGH, // ~~text~~
  INLINE_CODE, // `code`
  SPOILER_TRANSFORMER, // ||text||
  LINK, // [text](url)

  // Block elements
  HEADING, // # ## ###
  QUOTE, // >
  CODE, // ```code```
  UNORDERED_LIST, // - or *
  ORDERED_LIST, // 1.
  CHECK_LIST, // - [ ] or - [x]
  HORIZONTAL_RULE, // --- (line must contain only dashes)
];
