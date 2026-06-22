import { useEffect, useMemo, useRef } from 'react'
import { markdownToHtml } from './utils/markdownToHtml'
import { toast } from '../../utils/toast'
import 'highlight.js/styles/atom-one-dark.css'
import styles from './ReadingView.module.css'

// Read-only rendered view of a note — the "reading mode" the read/edit toggle
// switches to in the new editor. Renders note markdown to HTML once per content
// change and decorates each <pre> with a Copy button.
function ReadingView({ markdown, onSearchTag }) {
  const ref = useRef(null)
  const html = useMemo(() => markdownToHtml(markdown || ''), [markdown])

  const handleClick = (e) => {
    const tag = e.target.closest?.('.rv-hashtag')
    if (tag && onSearchTag) onSearchTag(tag.getAttribute('data-tag'))
  }

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const cleanups = []
    root.querySelectorAll('pre').forEach((pre) => {
      pre.classList.add('rv-pre')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'rv-copy-btn'
      btn.textContent = 'Copy'
      const onClick = () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        navigator.clipboard.writeText(code)
          .then(() => toast.success('Code copied'))
          .catch(() => toast.error('Copy failed'))
      }
      btn.addEventListener('click', onClick)
      pre.appendChild(btn)
      cleanups.push(() => { btn.removeEventListener('click', onClick); btn.remove() })
    })
    return () => cleanups.forEach((fn) => fn())
  }, [html])

  return <div ref={ref} className={styles.reading} onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
}

export default ReadingView
