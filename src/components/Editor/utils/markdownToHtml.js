import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkRehype from 'remark-rehype'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import { remarkSpoiler } from './remarkSpoiler'
import { remarkUnderline } from './remarkUnderline'
import { remarkHighlight } from './remarkHighlight'
import { remarkHashtag } from './remarkHashtag'
import { remarkWikilinks } from './remarkWikilinks'
import { normalizeCalloutSource } from './calloutBlocks'
import { resolveImageUrl } from '../../../utils/imageUpload'
import logger from '../../../utils/logger'

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
  wikilink(state, node) {
    const wl = node.wl || {}
    const props = { className: ['rv-link', 'rv-link-' + wl.kind] }
    if (wl.kind === 'note') props['data-target'] = wl.target
    else { props['data-link-kind'] = wl.kind; props['data-link-id'] = wl.id }
    return { type: 'element', tagName: 'span', properties: props, children: state.all(node) }
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

// Turn a blockquote whose first line is `[!type] …` into a callout card. Callout
// boundaries are already correct here because normalizeCalloutSource() split the
// source so each callout is its own blockquote (no merges, no absorbed lazy lines).
function rehypeCallouts() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'blockquote') return
      const firstP = node.children.find(c => c.type === 'element' && c.tagName === 'p')
      const firstText = firstP?.children?.[0]
      if (!firstText || firstText.type !== 'text') return
      const m = /^\[!(\w+)\]/.exec(firstText.value)
      if (!m) return
      const prev = node.properties?.className || []
      node.properties = node.properties || {}
      node.properties.className = [
        ...(Array.isArray(prev) ? prev : [prev]).filter(Boolean),
        'rv-callout', 'rv-callout-' + m[1].toLowerCase(),
      ]
      firstText.value = firstText.value.replace(/^\[!\w+\][ \t]*/, '') // drop the marker, keep the rest
    })
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // Render a single newline as a hard line break (<br>), matching how the editor
  // shows each line separately. Two newlines still make a new paragraph.
  .use(remarkBreaks)
  .use(remarkSpoiler)
  .use(remarkUnderline)
  .use(remarkWikilinks)
  .use(remarkHighlight)
  .use(remarkHashtag)
  .use(remarkRehype, { handlers })
  .use(rehypeCallouts)
  .use(rehypeCinderImages)
  .use(rehypeHighlight, { ignoreMissing: true })
  .use(rehypeStringify)

const escapeHtml = (s) => s.replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

export function markdownToHtml(md) {
  if (!md) return ''
  try {
    return String(processor.processSync(normalizeCalloutSource(md)))
  } catch (err) {
    // A render-time parser throw must never crash the note view — fall back to the
    // raw markdown, escaped, so the note still shows its content.
    logger.error('markdownToHtml failed; showing raw text', err)
    return `<pre class="rv-fallback">${escapeHtml(md)}</pre>`
  }
}
