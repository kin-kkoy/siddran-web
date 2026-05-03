import {
  $createParagraphNode,
  $createTextNode,
  $createLineBreakNode,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $createListNode, $createListItemNode } from '@lexical/list';
import { $createCodeNode } from '@lexical/code';
import { $createLinkNode } from '@lexical/link';
import {
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode,
  TableCellHeaderStates,
} from '@lexical/table';
import { $createSpoilerNode } from '../nodes/SpoilerNode';
import { $createImageNode } from '../nodes/ImageNode';

// Convert an mdast root tree into Lexical nodes appended to the given root.
// Caller is responsible for being inside an editor.update() and for clearing
// the root beforehand if desired.
export function mdastToLexical(tree, root) {
  if (!tree || !Array.isArray(tree.children)) return;
  for (const child of tree.children) {
    const node = convertBlock(child);
    if (node) root.append(node);
  }
}

// ---------- Block-level conversion ----------

function convertBlock(node) {
  switch (node.type) {
    case 'heading': {
      const depth = Math.min(Math.max(node.depth || 1, 1), 6);
      const heading = $createHeadingNode(`h${depth}`);
      appendInlines(heading, node.children, []);
      return heading;
    }

    case 'paragraph': {
      const para = $createParagraphNode();
      const isBlankMarker =
        node.children?.length === 1 &&
        node.children[0].type === 'text' &&
        node.children[0].value === '\\';
      if (!isBlankMarker) {
        appendInlines(para, node.children, []);
      }
      return para;
    }

    case 'blockquote': {
      // Lexical QuoteNode holds inlines directly, so we flatten any wrapping
      // paragraphs and join multiple paragraphs with hard line breaks.
      const quote = $createQuoteNode();
      const paragraphs = (node.children || []).filter(c => c.type === 'paragraph');
      paragraphs.forEach((p, i) => {
        if (i > 0) quote.append($createLineBreakNode());
        appendInlines(quote, p.children, []);
      });
      return quote;
    }

    case 'list':
      return convertList(node);

    case 'code': {
      const codeNode = $createCodeNode(node.lang || undefined);
      codeNode.append($createTextNode(node.value || ''));
      return codeNode;
    }

    case 'table':
      return convertTable(node);

    // Unsupported block kinds — skip silently. Add cases here when introducing
    // image / html node types in Lexical.
    case 'thematicBreak':
    case 'html':
    case 'definition':
    case 'yaml':
    case 'toml':
    default:
      return null;
  }
}

// GFM mdast table → Lexical TableNode tree.
// Each TableCellNode must contain at least one block (a ParagraphNode); we
// always create one and feed cell.children through appendInlines so nested
// formatting (bold/italic/underline/links/spoilers) round-trips. The first
// mdast tableRow becomes the header row per GFM convention.
//
// Column alignment (Option B): mdast `table.align[col]` is 'left' | 'center'
// | 'right' | null. We propagate non-null column alignment to every cell's
// inner paragraph via setFormat so the alignment is visible immediately on
// load. On the next save, lexicalToMdast's column-uniformity check will
// re-promote it cleanly.
function convertTable(tableNode) {
  const rows = (tableNode.children || []).filter((c) => c.type === 'tableRow');
  if (rows.length === 0) return null;

  const align = Array.isArray(tableNode.align) ? tableNode.align : [];
  const lexicalTable = $createTableNode();

  rows.forEach((row, rowIdx) => {
    const lexicalRow = $createTableRowNode();
    const cells = (row.children || []).filter((c) => c.type === 'tableCell');

    cells.forEach((cell, colIdx) => {
      const headerState =
        rowIdx === 0
          ? TableCellHeaderStates.ROW
          : TableCellHeaderStates.NO_STATUS;
      const lexicalCell = $createTableCellNode(headerState);
      const paragraph = $createParagraphNode();
      const colAlign = align[colIdx];
      if (colAlign === 'left' || colAlign === 'center' || colAlign === 'right') {
        paragraph.setFormat(colAlign);
      }
      appendInlines(paragraph, cell.children || [], []);
      lexicalCell.append(paragraph);
      lexicalRow.append(lexicalCell);
    });

    lexicalTable.append(lexicalRow);
  });

  return lexicalTable;
}

function convertList(listNode) {
  const items = (listNode.children || []).filter(c => c.type === 'listItem');
  const hasChecked = items.some(li => li.checked !== null && li.checked !== undefined);
  const listType = hasChecked
    ? 'check'
    : listNode.ordered
      ? 'number'
      : 'bullet';

  const list = $createListNode(listType);
  if (listType === 'number'
    && Number.isInteger(listNode.start)
    && typeof list.setStart === 'function') {
    list.setStart(listNode.start);
  }

  for (const item of items) {
    // Separate inline content (paragraphs) from nested lists. mdast nests
    // lists inside the parent listItem; Lexical models nested lists as a
    // sibling wrapper ListItemNode that contains the inner ListNode.
    const paragraphChildren = [];
    const nestedLists = [];
    for (const child of item.children || []) {
      if (child.type === 'list') nestedLists.push(child);
      else paragraphChildren.push(child);
    }

    const itemNode = $createListItemNode();
    if (listType === 'check' && item.checked !== null && item.checked !== undefined) {
      itemNode.setChecked(item.checked);
    }
    paragraphChildren.forEach((p, i) => {
      if (p.type !== 'paragraph') return;
      if (i > 0) itemNode.append($createLineBreakNode());
      appendInlines(itemNode, p.children, []);
    });
    list.append(itemNode);

    for (const nested of nestedLists) {
      const wrapper = $createListItemNode();
      wrapper.append(convertList(nested));
      list.append(wrapper);
    }
  }

  return list;
}

// ---------- Inline conversion with format mask ----------

function appendInlines(parent, mdastInlines, formats) {
  if (!Array.isArray(mdastInlines)) return;
  for (const node of mdastInlines) {
    appendInline(parent, node, formats);
  }
}

function appendInline(parent, node, formats) {
  switch (node.type) {
    case 'text': {
      if (!node.value) return;
      parent.append(makeFormattedText(node.value, formats));
      return;
    }

    case 'strong':
      appendInlines(parent, node.children, [...formats, 'bold']);
      return;

    case 'emphasis':
      appendInlines(parent, node.children, [...formats, 'italic']);
      return;

    case 'delete': // GFM strikethrough: ~~text~~
      appendInlines(parent, node.children, [...formats, 'strikethrough']);
      return;

    case 'underline': // custom: <u>text</u> — see remarkUnderline
      appendInlines(parent, node.children, [...formats, 'underline']);
      return;

    case 'inlineCode':
      parent.append(makeFormattedText(node.value || '', [...formats, 'code']));
      return;

    case 'link': {
      const link = $createLinkNode(node.url || '');
      appendInlines(link, node.children, formats);
      parent.append(link);
      return;
    }

    case 'spoiler': {
      // SpoilerNode now carries arbitrary inline children. Walk inner mdast
      // inlines through appendInlines so nested formatting, links, breaks,
      // etc. are reconstructed via the same logic used for paragraphs/links.
      // Carry outer formats through in case a spoiler is itself wrapped in
      // bold/italic on the markdown side.
      const sp = $createSpoilerNode();
      appendInlines(sp, node.children || [], formats);
      // Defensive: drop empty spoilers rather than leaving a wrapper that
      // would re-serialize as <spoiler></spoiler>.
      if (sp.getChildrenSize() === 0) return;
      parent.append(sp);
      return;
    }

    case 'break':
      parent.append($createLineBreakNode());
      return;

    case 'image': {
      if (!node.url) return;
      parent.append($createImageNode({ src: node.url, altText: node.alt || '' }));
      return;
    }

    // Reference-style links/images, raw HTML: not yet modeled in
    // Lexical for this app. Fall back to any inherent text content to avoid
    // dropping user data on the floor.
    case 'linkReference':
    case 'imageReference':
    case 'html':
    default:
      if (node.value) {
        parent.append(makeFormattedText(node.value, formats));
      } else if (Array.isArray(node.children)) {
        appendInlines(parent, node.children, formats);
      }
      return;
  }
}

function makeFormattedText(value, formats) {
  const t = $createTextNode(value);
  // Dedupe so accidentally-doubled formats (e.g. nested <strong><strong>)
  // don't cancel each other out via toggleFormat.
  const unique = [...new Set(formats)];
  for (const f of unique) t.toggleFormat(f);
  return t;
}
