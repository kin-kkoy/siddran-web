// One shared notion of a "callout block", mirroring the editor's line rule in
// cm/livePreview.js (Blockquote case): a `> [!type]` line starts a fresh callout,
// following `>` lines are its body, and a non-`>` (lazy-continuation) line ends it.
//
// CommonMark on its own would (a) merge two adjacent `> [!type]` blockquotes into
// one and (b) let a lazy non-`>` line get absorbed into the preceding blockquote —
// both happen during parsing, before any remark transformer can intervene. So we
// normalize the SOURCE first: insert a blank line at exactly the boundaries the
// editor splits on, which makes CommonMark's own blockquote parser produce one
// blockquote per callout with no absorbed lazy lines. rehypeCallouts then tags
// each resulting blockquote. Result: editor and reading view segment identically.

const CALLOUT_HEAD = /^\s*>\s*\[!\w+\]/
const QUOTE_LINE = /^\s*>/

export function normalizeCalloutSource(md) {
  if (!md || md.indexOf('[!') === -1) return md // fast path: no callouts present
  const lines = md.split('\n')
  const out = []
  let inCallout = false // currently inside a callout block?
  const prevBlank = () => out.length === 0 || out[out.length - 1].trim() === ''

  for (const line of lines) {
    if (CALLOUT_HEAD.test(line)) {
      // A head always begins a fresh block: split it from any preceding non-blank
      // line (another callout, a plain quote, or a paragraph) so they don't merge.
      if (!prevBlank()) out.push('')
      inCallout = true
      out.push(line)
      continue
    }
    if (inCallout) {
      if (QUOTE_LINE.test(line)) {
        out.push(line) // `>` continuation → still this callout's body
        continue
      }
      // Lazy / non-`>` line ends the callout. Force a paragraph break (unless the
      // line is itself blank, which already ends it) so it isn't absorbed.
      if (line.trim() !== '' && !prevBlank()) out.push('')
      inCallout = false
      out.push(line)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}
