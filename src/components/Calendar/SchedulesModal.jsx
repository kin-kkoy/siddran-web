import { useState } from 'react'
import { HiOutlineTrash } from 'react-icons/hi'
import styles from './Designer.module.css'

const SWATCHES = [
    { name: 'Amber', value: '#f0b840' }, { name: 'Blue', value: '#5a9cf0' },
    { name: 'Green', value: '#52c47a' }, { name: 'Purple', value: '#c084fc' }, { name: 'Red', value: '#e05c5c' },
]

// Manage saved schedules: rename (inline), recolour (repaints all its blocks), delete (cascades blocks).
export default function SchedulesModal({ schedules, onDelete, onRecolor, onRename, onClose }) {
    const [confirmId, setConfirmId] = useState(null)
    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

    return (
        <div className={styles.backdrop} onClick={handleBackdrop}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Schedules</h3>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className={styles.body}>
                    {schedules.length === 0 ? (
                        <div className={styles.empty}>No saved schedules yet. Build one in the Designer.</div>
                    ) : schedules.map(s => (
                        <div key={s.id} className={styles.schedRow}>
                            <input
                                className={styles.schedName}
                                defaultValue={s.name}
                                onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) onRename(s.id, v) }}
                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                            />
                            <span className={styles.schedCount}>{s.block_count} block{s.block_count === 1 ? '' : 's'}</span>
                            <div className={styles.swatchesSm}>
                                {SWATCHES.map(sw => (
                                    <button key={sw.value} className={`${styles.swatchSm} ${s.color === sw.value ? styles.swatchOn : ''}`} style={{ background: sw.value }} title={`Recolour ${sw.name}`} onClick={() => onRecolor(s.id, sw.value)} />
                                ))}
                            </div>
                            {confirmId === s.id ? (
                                <button className={styles.confirmDel} onClick={() => { onDelete(s.id); setConfirmId(null) }} title="Delete this schedule and all its blocks">Delete?</button>
                            ) : (
                                <button className={styles.delBtn} onClick={() => setConfirmId(s.id)} title="Delete schedule + its blocks"><HiOutlineTrash size={14} /></button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
