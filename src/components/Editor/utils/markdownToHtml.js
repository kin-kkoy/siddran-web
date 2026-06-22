import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { remarkSpoiler } from './remarkSpoiler'
import { remarkUnderline } from './remarkUnderline'
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

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkSpoiler)
  .use(remarkUnderline)
  .use(remarkRehype, { handlers })
  .use(rehypeCinderImages)
  .use(rehypeHighlight, { ignoreMissing: true })
  .use(rehypeStringify)

export function markdownToHtml(md) {
  if (!md) return ''
  return String(processor.processSync(md))
}
