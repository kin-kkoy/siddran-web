import { Decoration, EditorView } from '@codemirror/view'
import { StateField, RangeSet } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { HrWidget, BulletWidget, CheckWidget } from './widgets'

// Live-preview decorations — a Phase 1 subset of the reference clone's
// buildDeco (garb2/obsidian-notes-clone.html). The principle: walk the markdown
// syntax tree and, for each node, HIDE its syntax marks (replace with nothing)
// when the selection is NOT on it, and reveal them when the caret lands there.
//
// Handled now: bold / italic / strikethrough / inline-code, ATX headings,
// links, fenced code, horizontal rules, blockquotes, list bullets, checkboxes.
// Deferred to later phases: wikilinks, embeds, highlight, hashtags, tables,
// callouts, images.
//
// Two outputs are produced together:
//  - decorations: the visual mark/line/replace decorations (StateField → view)
//  - atomic:      a RangeSet of the *hidden* spans. Feeding these to
//                 EditorView.atomicRanges makes the caret treat hidden syntax as
//                 a single unit, so horizontal/vertical motion steps cleanly over
//                 it instead of getting lost inside zero-width hidden text.
//
// IMPORTANT: every `hide()` stays within a single line (never spans a line
// break). A cross-line replace merges two document lines into one visual line,
// which (a) drops the line styling of the merged line and (b) desyncs CM's
// document-line vs visual-line counts, making vertical caret motion overshoot.

function buildDeco(state) {
  const deco = []
  const atomic = []
  const doc = state.doc
  const sel = state.selection
  const tree = syntaxTree(state)

  // selection overlaps the range [f,t)
  const over = (f, t) => sel.ranges.some(r => r.from <= t && r.to >= f)
  // selection touches any line spanned by [f,t)
  const lact = (f, t) => {
    const a = doc.lineAt(f).number
    const b = doc.lineAt(t).number
    return sel.ranges.some(r => doc.lineAt(r.from).number <= b && doc.lineAt(r.to).number >= a)
  }
  // hide a syntax span — also recorded as atomic so the caret skips it cleanly
  const hide = (f, t) => {
    if (t > f) {
      deco.push(Decoration.replace({}).range(f, t))
      atomic.push(Decoration.replace({}).range(f, t))
    }
  }
  const mk = (f, t, cls, at) => { if (t > f) deco.push(Decoration.mark({ class: cls, attributes: at }).range(f, t)) }
  const lineCls = (pos, cls) => deco.push(Decoration.line({ class: cls }).range(pos))

  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      const name = node.name, nf = node.from, nt = node.to
      switch (name) {
        case 'StrongEmphasis':
        case 'Emphasis':
        case 'Strikethrough':
        case 'InlineCode': {
          const cls = name === 'StrongEmphasis' ? 'cm-strong'
            : name === 'Emphasis' ? 'cm-em'
              : name === 'Strikethrough' ? 'cm-strike'
                : 'cm-code-inline'
          const mn = (name === 'StrongEmphasis' || name === 'Emphasis') ? 'EmphasisMark'
            : name === 'Strikethrough' ? 'StrikethroughMark'
              : 'CodeMark'
          const marks = node.node.getChildren(mn)
          let iF = nf, iT = nt
          if (marks.length) { iF = marks[0].to; iT = marks[marks.length - 1].from }
          mk(iF, iT, cls)
          if (!over(nf, nt)) marks.forEach(m => hide(m.from, m.to))
          break
        }
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6': {
          const lvl = name.slice(-1)
          lineCls(doc.lineAt(nf).from, 'cm-h cm-h' + lvl)
          if (!lact(nf, nt)) {
            node.node.getChildren('HeaderMark').forEach(m => {
              let t = m.to
              if (doc.sliceString(t, t + 1) === ' ') t++
              hide(m.from, t)
            })
          }
          break
        }
        case 'Link': {
          const marks = node.node.getChildren('LinkMark')
          const url = node.node.getChild('URL')
          const href = url ? doc.sliceString(url.from, url.to) : ''
          if (over(nf, nt)) {
            mk(nf, nt, 'cm-link-active')
          } else if (marks.length >= 2) {
            mk(marks[0].to, marks[1].from, 'cm-external-link', { 'data-href': href })
            hide(nf, marks[0].to)
            hide(marks[1].from, nt)
          }
          break
        }
        case 'FencedCode': {
          // Style the whole block (fence + content lines) uniformly. When the
          // caret is outside, hide only the fence *characters* within their own
          // line — never across the line break — so the block keeps its styling
          // and vertical caret motion stays in sync.
          const marks = node.node.getChildren('CodeMark')
          const openLine = doc.lineAt(nf)
          const lastMark = marks.length ? marks[marks.length - 1] : null
          const closeLine = lastMark ? doc.lineAt(lastMark.from) : doc.lineAt(nt)
          const hasClose = marks.length >= 2 && closeLine.number > openLine.number
          const firstLn = openLine.number
          const lastLn = hasClose ? closeLine.number : doc.lineAt(nt).number
          for (let n = firstLn; n <= lastLn; n++) {
            if (n < 1 || n > doc.lines) continue
            let cls = 'cm-codeblock'
            if (n === firstLn) cls += ' cm-codeblock-top'
            if (n === lastLn) cls += ' cm-codeblock-bot'
            lineCls(doc.line(n).from, cls)
          }
          if (!lact(nf, nt)) {
            hide(openLine.from, openLine.to)
            if (hasClose) hide(closeLine.from, closeLine.to)
          }
          return false
        }
        case 'HorizontalRule': {
          const line = doc.lineAt(nf)
          if (!lact(nf, nt)) deco.push(Decoration.replace({ widget: new HrWidget(), block: true }).range(line.from, line.to))
          return false
        }
        case 'Blockquote': {
          const sl = doc.lineAt(nf), el = doc.lineAt(nt)
          for (let n = sl.number; n <= el.number; n++) lineCls(doc.line(n).from, 'cm-quote')
          node.node.getChildren('QuoteMark').forEach(q => {
            if (!lact(q.from, q.to)) {
              let t = q.to
              if (doc.sliceString(t, t + 1) === ' ') t++
              hide(q.from, t)
            }
          })
          break
        }
        default:
          break
      }
    },
  })

  // list bullets & task checkboxes — line-based for symmetric, reliable handling
  let inFence = false
  for (let ln = 1; ln <= doc.lines; ln++) {
    const line = doc.line(ln), txt = line.text
    if (/^\s*```/.test(txt)) { inFence = !inFence; continue }
    if (inFence) continue
    const tm = /^(\s*)([-*+])(\s+)\[([ xX])\]/.exec(txt)
    if (tm) {
      const dashStart = line.from + tm[1].length
      const cbFrom = dashStart + 1 + tm[3].length, cbTo = cbFrom + 3
      hide(dashStart, cbFrom)
      deco.push(Decoration.replace({ widget: new CheckWidget(/x/i.test(tm[4])) }).range(cbFrom, cbTo))
      continue
    }
    const bm = /^(\s*)([-*+])(\s+)\S/.exec(txt)
    if (bm) {
      const f = line.from + bm[1].length
      deco.push(Decoration.replace({ widget: new BulletWidget() }).range(f, f + 1))
    }
  }

  return {
    decorations: Decoration.set(deco, true),
    atomic: RangeSet.of(atomic, true),
  }
}

export const livePreviewField = StateField.define({
  create(state) { return buildDeco(state) },
  update(value, tr) { return (tr.docChanged || tr.selection) ? buildDeco(tr.state) : value },
  provide: f => [
    EditorView.decorations.from(f, v => v.decorations),
    EditorView.atomicRanges.of(view => view.state.field(f).atomic),
  ],
})
