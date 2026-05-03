import {
  $isParagraphNode,
  $isTextNode,
  $isLineBreakNode,
} from 'lexical';
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import { $isListNode, $isListItemNode } from '@lexical/list';
import { $isCodeNode } from '@lexical/code';
import { $isLinkNode } from '@lexical/link';
import {
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
} from '@lexical/table';
import { $isSpoilerNode } from '../nodes/SpoilerNode';
import { $isImageNode } from '../nodes/ImageNode';
import { $isImagePlaceholderNode } from '../nodes/ImagePlaceholderNode';

// Convert a Lexical RootNode into an mdast root tree. Caller wraps in
// editorState.read(() => lexicalToMdast($getRoot())). The returned tree is
// fed to remark-stringify.
export function lexicalToMdast(rootNode) {
  return {
    type: 'root',
    children: rootNode.getChildren().map(convertBlock).filter(Boolean),
  };
}

// ---------- Block-level conversion ----------

function convertBlock(node) {
  if ($isParagraphNode(node)) {
    const inlines = convertInlines(node.getChildren());
    if (inlines.length === 0) {
      return {
        type: 'paragraph',
        children: [{ type: 'text', value: '\\' }],
      };
    }
    return {
      type: 'paragraph',
      children: inlines,
    };
  }

  if ($isHeadingNode(node)) {
    const tag = node.getTag(); // 'h1'..'h6'
    const depth = Math.min(Math.max(parseInt(tag.slice(1), 10) || 1, 1), 6);
    return {
      type: 'heading',
      depth,
      children: convertInlines(node.getChildren()),
    };
  }

  if ($isQuoteNode(node)) {
    // Lexical QuoteNode holds inlines directly; mdast blockquote expects
    // child blocks (paragraphs). Split on hard line breaks so a multi-line
    // quote round-trips into multiple mdast paragraphs.
    const inlineGroups = splitOnLineBreaks(node.getChildren());
    const paragraphs = inlineGroups.length > 0
      ? inlineGroups.map(group => ({
          type: 'paragraph',
          children: convertInlines(group),
        }))
      : [{ type: 'paragraph', children: [] }];
    return { type: 'blockquote', children: paragraphs };
  }

  if ($isListNode(node)) {
    return convertList(node);
  }

  if ($isCodeNode(node)) {
    return {
      type: 'code',
      lang: node.getLanguage() || null,
      meta: null,
      value: node.getTextContent(),
    };
  }

  if ($isTableNode(node)) {
    return convertTable(node);
  }

  return null;
}

// GFM table → mdast.
//   { type: 'table', align, children: [tableRow, ...] }
// First row is treated as the header row by GFM convention.
// mdast tableCell.children must be phrasing content only — Lexical cells
// hold block-level paragraphs, so we flatten the first paragraph's inlines
// into the cell. Multi-paragraph cell content is concatenated with hard
// line breaks (closest GFM can express).
//
// Column alignment (Option B from the design discussion): we read each
// cell's inner paragraph format. If every cell in a column has the same
// non-empty alignment, we promote it to mdast `table.align[col]` so the
// markdown carries it (`|:---:|---:|`). If the column is mixed, we drop
// alignment for that column — markdown can't express per-cell alignment.
function convertTable(tableNode) {
  const rows = tableNode.getChildren().filter($isTableRowNode);
  const numCols = rows[0]
    ? rows[0].getChildren().filter($isTableCellNode).length
    : 0;
  const align = computeColumnAlignment(rows, numCols);

  return {
    type: 'table',
    align,
    children: rows.map(convertTableRow),
  };
}

function computeColumnAlignment(rows, numCols) {
  const align = new Array(numCols).fill(null);
  for (let col = 0; col < numCols; col++) {
    let columnAlign = undefined; // unknown until we see first cell
    let uniform = true;
    for (const row of rows) {
      const cells = row.getChildren().filter($isTableCellNode);
      const cell = cells[col];
      if (!cell) {
        uniform = false;
        break;
      }
      const para = cell.getChildren().filter($isParagraphNode)[0];
      const fmt = para ? para.getFormatType() : '';
      const normalized =
        fmt === 'left' || fmt === 'center' || fmt === 'right' ? fmt : null;
      if (columnAlign === undefined) {
        columnAlign = normalized;
      } else if (normalized !== columnAlign) {
        uniform = false;
        break;
      }
    }
    if (uniform && columnAlign) align[col] = columnAlign;
  }
  return align;
}

function convertTableRow(rowNode) {
  return {
    type: 'tableRow',
    children: rowNode.getChildren().filter($isTableCellNode).map(convertTableCell),
  };
}

function convertTableCell(cellNode) {
  const phrasing = [];
  const blocks = cellNode.getChildren();
  blocks.forEach((block, i) => {
    if ($isParagraphNode(block)) {
      if (i > 0) phrasing.push({ type: 'break' });
      phrasing.push(...convertInlines(block.getChildren()));
    } else if (typeof block.getTextContent === 'function') {
      const text = block.getTextContent();
      if (text) phrasing.push({ type: 'text', value: text });
    }
  });
  return {
    type: 'tableCell',
    children: phrasing,
  };
}

function convertList(listNode) {
  const listType = listNode.getListType(); // 'bullet' | 'number' | 'check'
  const ordered = listType === 'number';
  const children = [];
  let lastItem = null;
  const start = ordered && typeof listNode.getStart === 'function'
    ? listNode.getStart()
    : 1;

  for (const item of listNode.getChildren()) {
    if (!$isListItemNode(item)) continue;

    const itemChildren = item.getChildren();
    const firstChild = itemChildren[0];

    // Lexical convention: a nested list lives in a wrapper ListItemNode whose
    // only child is a ListNode. mdast inverts this — nested lists are
    // children of the *previous* real listItem, not a sibling. So when we
    // encounter a wrapper, attach the inner list to the last real mdast item.
    if (itemChildren.length === 1 && $isListNode(firstChild)) {
      if (lastItem) {
        lastItem.children.push(convertList(firstChild));
      } else {
        // Orphan wrapper (no preceding real item) — synthesize a placeholder
        // so the nested content isn't lost. This shouldn't happen with
        // well-formed input but is cheap to guard.
        const orphan = {
          type: 'listItem',
          spread: false,
          checked: null,
          children: [
            { type: 'paragraph', children: [] },
            convertList(firstChild),
          ],
        };
        children.push(orphan);
        lastItem = orphan;
      }
      continue;
    }

    // Real item: split inline content on line breaks into one-or-more
    // paragraphs (mdast listItem children must be block nodes).
    const inlineGroups = splitOnLineBreaks(itemChildren);
    const paragraphs = inlineGroups.length > 0
      ? inlineGroups.map(group => ({
          type: 'paragraph',
          children: convertInlines(group),
        }))
      : [{ type: 'paragraph', children: [] }];

    const mdastItem = {
      type: 'listItem',
      spread: false,
      checked: listType === 'check' ? !!item.getChecked?.() : null,
      children: paragraphs,
    };
    children.push(mdastItem);
    lastItem = mdastItem;
  }

  return {
    type: 'list',
    ordered,
    start: ordered && Number.isInteger(start) ? start : 1,
    spread: false,
    children,
  };
}

// Splits a flat list of Lexical inline nodes into groups separated by
// LineBreakNodes. Used by QuoteNode and ListItemNode to recover the
// multi-paragraph structure mdast requires.
function splitOnLineBreaks(nodes) {
  const groups = [[]];
  for (const n of nodes) {
    if ($isLineBreakNode(n)) {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(n);
    }
  }
  return groups.filter(g => g.length > 0);
}

// ---------- Inline conversion ----------

function convertInlines(nodes) {
  const result = [];
  for (const n of nodes) {
    const m = convertInline(n);
    if (m) result.push(m);
  }
  return result;
}

function convertInline(node) {
  if ($isTextNode(node)) {
    const text = node.getTextContent();
    if (!text) return null;
    return wrapTextWithFormats(text, node);
  }

  if ($isLineBreakNode(node)) {
    // A line break appearing in a paragraph (not split out by a parent block)
    // serializes as an mdast hard break.
    return { type: 'break' };
  }

  if ($isLinkNode(node)) {
    return {
      type: 'link',
      url: node.getURL(),
      title: null,
      children: convertInlines(node.getChildren()),
    };
  }

  if ($isImagePlaceholderNode(node)) {
    // In-flight upload; don't pollute saved markdown with a placeholder.
    return null;
  }

  if ($isImageNode(node)) {
    return {
      type: 'image',
      url: node.getSrc(),
      title: null,
      alt: node.getAltText() || '',
    };
  }

  if ($isSpoilerNode(node)) {
    // SpoilerNode now carries arbitrary inline children (text with formats,
    // links, breaks, etc). Walk children through the same convertInlines
    // pipeline used for paragraphs/links so all formatting and link URLs
    // round-trip. Empty spoilers are dropped to prevent <spoiler></spoiler>
    // (or legacy ||||) from leaking onto disk.
    const children = convertInlines(node.getChildren());
    if (children.length === 0) return null;
    return {
      type: 'spoiler',
      children,
    };
  }

  // Unknown inline — preserve text content if available so user data isn't
  // dropped silently. Mirrors the import-side defensive fallback.
  if (typeof node.getTextContent === 'function') {
    const text = node.getTextContent();
    if (text) return { type: 'text', value: text };
  }
  return null;
}

// Stable wrapping order — innermost first:
//   inlineCode (replaces text leaf entirely)
//   emphasis   (italic)
//   strong     (bold)
//   delete     (strikethrough)
//   underline  (custom mdast node, serialized as <u>...</u> — see remarkUnderline)
// Result for all five formats: <u>~~***`text`***~~</u>. Frozen so saves are
// byte-stable and don't churn existing notes.
function wrapTextWithFormats(text, textNode) {
  let leaf = textNode.hasFormat('code')
    ? { type: 'inlineCode', value: text }
    : { type: 'text', value: text };

  if (textNode.hasFormat('italic')) {
    leaf = { type: 'emphasis', children: [leaf] };
  }
  if (textNode.hasFormat('bold')) {
    leaf = { type: 'strong', children: [leaf] };
  }
  if (textNode.hasFormat('strikethrough')) {
    leaf = { type: 'delete', children: [leaf] };
  }
  if (textNode.hasFormat('underline')) {
    leaf = { type: 'underline', children: [leaf] };
  }
  return leaf;
}
