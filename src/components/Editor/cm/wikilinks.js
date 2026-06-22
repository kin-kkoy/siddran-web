import { EditorView, keymap } from '@codemirror/view'
import { Facet, Prec } from '@codemirror/state'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'

// Obsidian-style `[[wikilinks]]` between notes: a Lezer inline node, live-preview
// rendering (in cm/livePreview.js), `[[`-autocomplete over existing note titles,
// and click-to-open (creating the note first when it doesn't exist yet).

// Lezer markdown extension — a Wikilink node spanning `[[ … ]]`. Parsed before
// `Link` so `[[` isn't consumed as a normal link.
export const wikilinkMarkdownExtension = {
  defineNodes: [{ name: 'Wikilink' }],
  parseInline: [
    {
      name: 'Wikilink',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== 91 /* [ */ || cx.char(pos + 1) !== 91) return -1
        let e = pos + 2
        while (e < cx.end && !(cx.char(e) === 93 /* ] */ && cx.char(e + 1) === 93)) e++
        if (e >= cx.end) return -1
        return cx.addElement(cx.elt('Wikilink', pos, e + 2))
      },
    },
  ],
}

// Config the editor provides: current notes + resolve/navigate/create callbacks.
// Read from `state.facet(wikilinkConfig)` by buildDeco and the click handler.
export const wikilinkConfig = Facet.define({
  combine: (values) => values[0] || {},
})

// Case-insensitive, first-match resolution by title (ignoring any `#heading`
// suffix and the `|alias`). Titles aren't unique, so first match wins.
export function resolveNote(notes, target) {
  if (!notes || !target) return null
  const key = String(target).split('#')[0].trim().toLowerCase()
  if (!key) return null
  return notes.find((n) => (n.title || '').trim().toLowerCase() === key) || null
}

// Split `target|alias` (and strip `#heading`) out of the raw inner text.
export function parseWikilink(inner) {
  const pipe = inner.indexOf('|')
  const linkpart = pipe >= 0 ? inner.slice(0, pipe) : inner
  const alias = pipe >= 0 ? inner.slice(pipe + 1) : ''
  const target = linkpart.split('#')[0].trim()
  return { target, alias, pipe }
}

// Autocomplete source — fires after `[[`, suggests existing note titles only.
function wikilinkComplete(context) {
  const before = context.matchBefore(/\[\[[^\]\n]*/)
  if (!before) return null
  const cfg = context.state.facet(wikilinkConfig)
  const notes = (cfg.notes ? cfg.notes() : []) || []
  const options = notes.map((n) => {
    const title = n.title || 'Untitled'
    return {
      label: title,
      type: 'text',
      apply: (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: `${title}]]` },
          selection: { anchor: from + title.length + 2 },
        })
      },
    }
  })
  return { from: before.from + 2, to: context.pos, options, filter: true, validFor: /[^\]\n]*/ }
}

// Click a rendered link → open the note, or create it then open when unresolved.
const clickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    const el = event.target?.closest?.('.cm-internal-link')
    if (!el) return false
    event.preventDefault()
    const target = el.getAttribute('data-target') || ''
    const cfg = view.state.facet(wikilinkConfig)
    const note = cfg.resolve ? cfg.resolve(target) : null
    if (note) cfg.navigate?.(note.id)
    else if (target) cfg.create?.(target)
    return true
  },
})

export function wikilinks(config) {
  return [
    wikilinkConfig.of(config),
    autocompletion({ override: [wikilinkComplete], activateOnTyping: true, icons: false }),
    // Highest precedence so the open completion list owns Arrow/Enter/Esc; when
    // no completion is active these fall through to caret motion / newline.
    Prec.highest(keymap.of(completionKeymap)),
    clickHandler,
  ]
}
