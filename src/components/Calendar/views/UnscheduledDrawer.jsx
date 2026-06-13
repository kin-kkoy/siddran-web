import { useRef, useState } from 'react'
import styles from './UnscheduledDrawer.module.css'
import { slotFromPoint } from './timeGridGeom'

const DRAG_THRESHOLD = 4

// Lists undated tasks. Drag one onto the time grid to schedule it (drop resolves to a day +
// time via slotFromPoint, then onSchedule(taskId, day, time) sets its due_date).
export default function UnscheduledDrawer({ tasks, onSchedule }) {
    const drag = useRef(null)
    const ghostRef = useRef(null)
    const [dragTitle, setDragTitle] = useState(null)

    const positionGhost = (x, y) => {
        if (ghostRef.current) ghostRef.current.style.transform = `translate(${x + 12}px, ${y + 12}px)`
    }

    const onPointerDown = (e, task) => {
        drag.current = { task, startX: e.clientX, startY: e.clientY, dragging: false }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
    }
    const onPointerMove = (e) => {
        const st = drag.current
        if (!st) return
        if (!st.dragging) {
            if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < DRAG_THRESHOLD) return
            st.dragging = true
            setDragTitle(st.task.title)
        }
        positionGhost(e.clientX, e.clientY)
    }
    const onPointerUp = (e) => {
        const st = drag.current
        drag.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
        setDragTitle(null)
        if (st?.dragging) {
            const slot = slotFromPoint(e.clientX, e.clientY)
            if (slot) onSchedule(st.task.id, slot.day, slot.time)
        }
    }

    return (
        <aside className={styles.drawer}>
            <h4 className={styles.title}>Unscheduled · {tasks.length}</h4>
            {tasks.length === 0 ? (
                <div className={styles.empty}>Nothing unscheduled. <br /><small>Drag a task onto the grid to plan it.</small></div>
            ) : (
                tasks.map(t => (
                    <div
                        key={t.id}
                        className={styles.item}
                        title={t.title}
                        onPointerDown={(e) => onPointerDown(e, t)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                    >
                        <span className={styles.grip}>⠿</span>
                        <span className={styles.itemTitle}>{t.title}</span>
                    </div>
                ))
            )}
            {dragTitle && <div ref={ghostRef} className={styles.ghost}>{dragTitle}</div>}
        </aside>
    )
}
