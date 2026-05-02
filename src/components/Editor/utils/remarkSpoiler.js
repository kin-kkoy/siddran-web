import { visit, SKIP } from 'unist-util-visit';

// Discord-style spoiler syntax: ||hidden text||
// Stored in mdast as a custom node:
//   { type: 'spoiler', children: [{ type: 'text', value: '...' }] }
// SpoilerNode in this codebase holds flat text (no nested formatting), so the
// custom mdast node mirrors that contract — children is always a single text.

const SPOILER_RE = /\|\|([^|]+)\|\|/g;

// Parse-side: post-parse transformer that walks text nodes and splits any
// ||...|| matches into spoiler siblings. Pure text-level splitter — does not
// re-tokenize, so spoiler markers inside code spans / fenced code are
// untouched (visit('text') only sees genuine text nodes, not code values).
export function remarkSpoiler() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return;
      const value = node.value;
      const matches = [...value.matchAll(SPOILER_RE)];
      if (matches.length === 0) return;

      const newNodes = [];
      let cursor = 0;
      for (const match of matches) {
        const start = match.index;
        const end = start + match[0].length;
        if (start > cursor) {
          newNodes.push({ type: 'text', value: value.slice(cursor, start) });
        }
        newNodes.push({
          type: 'spoiler',
          children: [{ type: 'text', value: match[1] }],
        });
        cursor = end;
      }
      if (cursor < value.length) {
        newNodes.push({ type: 'text', value: value.slice(cursor) });
      }

      parent.children.splice(index, 1, ...newNodes);
      // Resume after the inserted nodes so we don't re-visit them.
      return [SKIP, index + newNodes.length];
    });
  };
}

// Stringify-side: handler registered on remark-stringify so spoiler nodes
// serialize back to ||text|| in the output markdown.
export function spoilerHandler(node) {
  const inner = node.children.map((c) => c.value || '').join('');
  return `||${inner}||`;
}
