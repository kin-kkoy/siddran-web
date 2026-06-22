import { visit, SKIP } from 'unist-util-visit'

// `[[Note]]` / `[[task:id|label]]` / `[[sandbox:id|label]]` / `[[bundle:id|label]]`
// → a custom `wikilink` mdast node carrying its kind + target/id + display label,
// so the reading view renders them as styled (and clickable) links instead of raw
// `[[ … ]]` text. Mirrors cm/wikilinks.js parseTypedLink.
const RE = /\[\[([^\]\n]+)\]\]/g

function classify(inner) {
  const pipe = inner.indexOf('|')
  const head = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim()
  const label = pipe >= 0 ? inner.slice(pipe + 1).trim() : ''
  const typed = /^(task|sandbox|bundle):(.+)$/i.exec(head)
  if (typed) return { kind: typed[1].toLowerCase(), id: typed[2].trim(), label: label || head }
  const target = head.split('#')[0].trim()
  return { kind: 'note', target, label: label || target }
}

export function remarkWikilinks() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return
      const value = node.value
      const matches = [...value.matchAll(RE)]
      if (!matches.length) return
      const out = []
      let cursor = 0
      for (const m of matches) {
        const start = m.index
        const end = start + m[0].length
        if (start > cursor) out.push({ type: 'text', value: value.slice(cursor, start) })
        const info = classify(m[1])
        out.push({ type: 'wikilink', wl: info, children: [{ type: 'text', value: info.label }] })
        cursor = end
      }
      if (cursor < value.length) out.push({ type: 'text', value: value.slice(cursor) })
      parent.children.splice(index, 1, ...out)
      return [SKIP, index + out.length]
    })
  }
}
