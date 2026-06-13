import { useEffect, useRef, useState } from 'react'
import styles from './CalendarPeek.module.css'

// Collapsible section. Animates a MEASURED max-height (not grid-template-rows, which isn't
// compositor-friendly and stutters with heavy content). On expand we animate 0 → measured
// height then release to `auto`; on collapse we pin the current height then animate to 0.
export default function AccordionSection({ label, meta, collapsed, onToggle, children }) {
    const innerRef = useRef(null)
    const [maxH, setMaxH] = useState(collapsed ? 0 : undefined)

    useEffect(() => {
        const el = innerRef.current
        if (!el) return
        if (collapsed) {
            setMaxH(el.scrollHeight)                       // pin current height (instant)
            const id = requestAnimationFrame(() => setMaxH(0)) // then animate closed
            return () => cancelAnimationFrame(id)
        }
        setMaxH(el.scrollHeight)                            // animate 0 → content height
        const t = setTimeout(() => setMaxH(undefined), 240) // release to auto (lets content grow later)
        return () => clearTimeout(t)
    }, [collapsed])

    return (
        <div className={`${styles.section} ${collapsed ? styles.collapsed : ''}`}>
            <button className={styles.sectionHead} onClick={onToggle}>
                <span className={styles.chev}>▾</span>
                <span className={styles.sectionLabel}>{label}</span>
                {meta != null && <span className={styles.sectionMeta}>{meta}</span>}
            </button>
            <div className={styles.sectionBody} style={{ maxHeight: maxH }}>
                <div className={styles.sectionInner} ref={innerRef}>{children}</div>
            </div>
        </div>
    )
}
