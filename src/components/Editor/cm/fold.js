import { gutter, GutterMarker } from '@codemirror/view'
import { codeFolding, foldEffect, unfoldEffect, foldedRanges } from '@codemirror/language'

// Heading-only outline folding. We deliberately do NOT use foldGutter/foldKeymap:
// those route through CodeMirror's `foldable()`, which falls back to the markdown
// language's foldNodeProp and makes EVERY multi-line block (paragraphs!) foldable.
// Instead a custom gutter shows a chevron only on heading lines and folds that
// heading's section (down to the next heading of equal/higher level). codeFolding()
// provides the fold state + the collapse decoration; nothing auto-folds.

const HEADING = /^(#{1,6})\s/

function headingFoldRange(state, lineFrom) {
  const doc = state.doc
  const line = doc.lineAt(lineFrom)
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

function rangeFolded(state, range) {
  let folded = false
  foldedRanges(state).between(range.from, range.from + 1, (from, to) => {
    if (from === range.from && to >= range.to) folded = true
  })
  return folded
}

class ChevronMarker extends GutterMarker {
  constructor(folded) { super(); this.folded = folded }
  eq(o) { return o.folded === this.folded }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-fold-chevron'
    s.textContent = this.folded ? '▸' : '▾'
    return s
  }
}

export const headingFold = [
  codeFolding(),
  gutter({
    class: 'cm-foldGutter',
    lineMarker(view, line) {
      const range = headingFoldRange(view.state, line.from)
      if (!range) return null
      return new ChevronMarker(rangeFolded(view.state, range))
    },
    initialSpacer() { return new ChevronMarker(false) },
    domEventHandlers: {
      mousedown(view, line) {
        const range = headingFoldRange(view.state, line.from)
        if (!range) return false
        const folded = rangeFolded(view.state, range)
        view.dispatch({ effects: folded ? unfoldEffect.of(range) : foldEffect.of(range) })
        return true
      },
    },
  }),
]
