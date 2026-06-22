import { foldService, foldGutter, codeFolding, foldKeymap } from '@codemirror/language'
import { keymap } from '@codemirror/view'

// Outline folding for markdown: a heading folds everything from the end of its
// line down to the line before the next heading of equal-or-higher level (or the
// end of the document). Chevrons live in the fold gutter (styled in theme.js).

const HEADING = /^(#{1,6})\s/

function headingFoldRange(state, lineStart) {
  const doc = state.doc
  const line = doc.lineAt(lineStart)
  const m = HEADING.exec(line.text)
  if (!m) return null
  const level = m[1].length
  let endLineNum = doc.lines
  for (let n = line.number + 1; n <= doc.lines; n++) {
    const hm = HEADING.exec(doc.line(n).text)
    if (hm && hm[1].length <= level) { endLineNum = n - 1; break }
  }
  if (endLineNum <= line.number) return null
  const to = doc.line(endLineNum).to
  if (to <= line.to) return null
  return { from: line.to, to }
}

export const headingFold = [
  codeFolding(),
  foldService.of((state, lineStart) => headingFoldRange(state, lineStart)),
  foldGutter(),
  keymap.of(foldKeymap),
]
