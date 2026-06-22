import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { remarkSpoiler } from './remarkSpoiler'
import { remarkUnderline } from './remarkUnderline'
import { remarkHighlight } from './remarkHighlight'
import { remarkHashtag } from './remarkHashtag'
import { resolveImageUrl } from '../../../utils/imageUpload'

// Markdown → HTML for the reading view. Reuses the same remark plugins the
// editor uses (gfm + the custom spoiler/underline) so notes render identically;
// images go through resolveImageUrl and `#w=NNN` becomes a width; fenced code is
// highlighted by rehype-highlight (highlight.js classes — theme CSS imported by
// ReadingView). Raw HTML other than the handled spoiler/underline nodes is
// dropped (safe default), since these are the user's own notes.

const handlers = {
  spoiler(state, node) {
    return { type: 'element', tagName: 'span', properties: { className: ['rv-spoiler'] }, children: state.all(node) }
  },
  underline(state, node) {
    return { type: 'element', tagName: 'u', properties: {}, children: state.all(node) }
  },
  highlight(state, node) {
    return { type: 'element', tagName: 'mark', properties: {}, children: state.all(node) }
  },
  hashtag(state, node) {
    return {
      type: 'element',
      tagName: 'span',
      properties: { className: ['rv-hashtag'], 'data-tag': node.tag },
      children: state.all(node),
    }
  },
}

// Resolve image src through the R2 helper and lift `#w=NNN` into a width style.
function rehypeCinderImages() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'img' || !node.properties) return
      let src = String(node.properties.src || '')
      const wm = /#w=(\d+)$/.exec(src)
      if (wm) {
        src = src.slice(0, wm.index)
        const w = `width:${wm[1]}px`
        node.properties.style = node.properties.style ? `${node.properties.style};${w}` : w
      }
      node.properties.src = resolveImageUrl(src)
      node.properties.loading = 'lazy'
    })
  }
}

// Turn a blockquote whose first line is `[!type] …` into a callout card.
function rehypeCallouts() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'blockquote') return
      const firstP = node.children.find(c => c.type === 'element' && c.tagName === 'p')
      const firstText = firstP?.children?.[0]
      if (!firstText || firstText.type !== 'text') return
      const m = /^\[!(\w+)\]\s*(.*)$/.exec(firstText.value)
      if (!m) return
      const prev = node.properties?.className || []
      node.properties = node.properties || {}
      node.properties.className = [
        ...(Array.isArray(prev) ? prev : [prev]).filter(Boolean),
        'rv-callout', 'rv-callout-' + m[1].toLowerCase(),
      ]
      firstText.value = m[2] // drop the [!type] marker, keep the title text
    })
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSpoiler)
  .use(remarkUnderline)
  .use(remarkHighlight)
  .use(remarkHashtag)
  .use(remarkRehype, { handlers })
  .use(rehypeCallouts)
  .use(rehypeCinderImages)
  .use(rehypeHighlight, { ignoreMissing: true })
  .use(rehypeStringify)

export function markdownToHtml(md) {
  if (!md) return ''
  return String(processor.processSync(md))
}
