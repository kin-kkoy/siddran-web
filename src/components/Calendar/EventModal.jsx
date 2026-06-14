import { useState, useEffect } from 'react'
import { HiOutlineTrash } from 'react-icons/hi'
import styles from './EventModal.module.css'
import { toISOFromParts } from './calendarDates'
import { toast } from '../../utils/toast'
import logger from '../../utils/logger'

// Create / edit a standalone calendar block (a "sticky"/event). Linking a block to an existing
// note/task/etc. is a later phase (P5); this P1 modal handles title / day / time / colour.
//
// Props:
//   mode      — 'create' | 'edit'
//   draft     — { id?, title, day (ISO), all_day, startTime, endTime, color }
//   onSave    — (payload) => void   payload: { title, start_at, end_at, all_day, color }
//   onDelete  — (id) => void        (edit mode only)
//   onClose   — () => void

const SWATCHES = [
    { name: 'Amber',  value: '#f0b840' },
    { name: 'Blue',   value: '#5a9cf0' },
    { name: 'Green',  value: '#52c47a' },
    { name: 'Purple', value: '#c084fc' },
    { name: 'Red',    value: '#e05c5c' },
]

const REF_LABEL = { note: 'note', task: 'task', daily: 'daily', project: 'project', sandbox: 'sandbox' }

const REF_OPTIONS = [
    { value: '',        label: 'No link' },
    { value: 'note',    label: 'Note' },
    { value: 'task',    label: 'Task' },
    { value: 'daily',   label: 'Daily' },
    { value: 'project', label: 'Project' },
    { value: 'sandbox', label: 'Sandbox' },
]

// ref_type → how to fetch its id+title candidates. Sandboxes reuse the existing list endpoint
// (it already returns all id+title and must not be modified); the rest use ?picker=1.
const PICKER = {
    note:    { path: 'notes?picker=1',       key: 'items' },
    task:    { path: 'tasks?picker=1',       key: 'items' },
    daily:   { path: 'daily-tasks?picker=1', key: 'items' },
    project: { path: 'projects?picker=1',    key: 'items' },
    sandbox: { path: 'sandboxes',            key: 'sandboxes' },
}

export default function EventModal({ mode, draft, onSave, onDelete, onClose, onOpenLink, authFetch, API }) {
    const [title, setTitle] = useState(draft.title || '')
    const [day, setDay] = useState(draft.day)
    const [allDay, setAllDay] = useState(draft.all_day ?? true)
    const [startTime, setStartTime] = useState(draft.startTime || '09:00')
    const [endTime, setEndTime] = useState(draft.endTime || '')
    const [color, setColor] = useState(draft.color || null)

    // Linking (P5b-2): a block can point at an existing note/task/daily/project/sandbox. refId is
    // kept as a string (DB ref_id is TEXT; sandbox ids are UUIDs).
    const [refType, setRefType] = useState(draft.ref_type || '')
    const [refId, setRefId] = useState(draft.ref_id != null ? String(draft.ref_id) : '')
    const [candidates, setCandidates] = useState([])
    const [pickerLoading, setPickerLoading] = useState(false)
    const [pickerFilter, setPickerFilter] = useState('')

    // Fetch id+title candidates whenever a (non-empty) link type is selected.
    useEffect(() => {
        const cfg = refType ? PICKER[refType] : null
        if (!cfg || !authFetch || !API) { setCandidates([]); return }
        let cancelled = false
        setPickerLoading(true)
        ;(async () => {
            try {
                const res = await authFetch(`${API}/${cfg.path}`)
                if (res.ok && !cancelled) {
                    const data = await res.json()
                    setCandidates((data[cfg.key] || []).map(x => ({ id: String(x.id), title: x.title || '(untitled)' })))
                }
            } catch (error) {
                logger.error('Error fetching link candidates:', error)
            } finally {
                if (!cancelled) setPickerLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [refType, authFetch, API])

    const handleSave = () => {
        if (!title.trim()) {
            toast.warning("A title would be nice, don't you think?")
            return
        }
        if (!day) {
            toast.warning('Pick a date for this block.')
            return
        }
        if (refType && !refId) {
            toast.warning('Pick something to link to, or set the link to "No link".')
            return
        }
        const start_at = toISOFromParts(day, allDay ? null : startTime)
        const end_at = (!allDay && endTime) ? toISOFromParts(day, endTime) : null
        onSave({
            title: title.trim(),
            start_at, end_at, all_day: allDay, color,
            ref_type: refType || null,
            ref_id: refType ? refId : null,
        })
    }

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose()
    }

    return (
        <div className={styles.backdrop} onClick={handleBackdrop}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3 className={styles.title}>{mode === 'edit' ? 'Edit block' : 'New block'}</h3>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className={styles.body}>
                    {draft.ref_type && draft.ref_id && (
                        <button className={styles.openLink} onClick={() => onOpenLink?.(draft.ref_type, draft.ref_id)}>
                            Open linked {REF_LABEL[draft.ref_type] || 'item'} →
                        </button>
                    )}

                    <input
                        className={styles.titleInput}
                        type="text"
                        value={title}
                        autoFocus
                        placeholder="Title…"
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                    />

                    <div className={styles.row}>
                        <label className={styles.label}>Date</label>
                        <input
                            className={styles.field}
                            type="date"
                            value={day}
                            onChange={e => setDay(e.target.value)}
                        />
                    </div>

                    <label className={styles.checkRow}>
                        <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
                        <span>All day</span>
                    </label>

                    {!allDay && (
                        <div className={styles.row}>
                            <label className={styles.label}>Time</label>
                            <div className={styles.timeGroup}>
                                <input className={styles.field} type="time" step={900} value={startTime} onChange={e => setStartTime(e.target.value)} />
                                <span className={styles.dash}>→</span>
                                <input className={styles.field} type="time" step={900} value={endTime} onChange={e => setEndTime(e.target.value)} />
                            </div>
                        </div>
                    )}

                    <div className={styles.row}>
                        <label className={styles.label}>Colour</label>
                        <div className={styles.swatches}>
                            <button
                                className={`${styles.swatchNone} ${color == null ? styles.swatchOn : ''}`}
                                title="Default"
                                onClick={() => setColor(null)}
                            >∅</button>
                            {SWATCHES.map(s => (
                                <button
                                    key={s.value}
                                    className={`${styles.swatch} ${color === s.value ? styles.swatchOn : ''}`}
                                    style={{ background: s.value }}
                                    title={s.name}
                                    onClick={() => setColor(s.value)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className={styles.row}>
                        <label className={styles.label}>Link</label>
                        <select
                            className={styles.field}
                            value={refType}
                            onChange={e => { setRefType(e.target.value); setRefId(''); setPickerFilter('') }}
                        >
                            {REF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    {refType && (
                        <div className={styles.picker}>
                            <input
                                className={styles.field}
                                type="text"
                                value={pickerFilter}
                                placeholder={pickerLoading ? 'Loading…' : `Search ${REF_LABEL[refType] || 'item'}s…`}
                                onChange={e => setPickerFilter(e.target.value)}
                            />
                            <div className={styles.pickerList}>
                                {candidates
                                    .filter(c => !pickerFilter || c.title.toLowerCase().includes(pickerFilter.toLowerCase()))
                                    .slice(0, 50)
                                    .map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className={`${styles.pickerItem} ${refId === c.id ? styles.pickerItemOn : ''}`}
                                            onClick={() => setRefId(c.id)}
                                        >{c.title}</button>
                                    ))}
                                {!pickerLoading && candidates.length === 0 && (
                                    <div className={styles.pickerEmpty}>Nothing to link.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    {mode === 'edit' ? (
                        <button className={styles.deleteBtn} onClick={() => onDelete(draft.id)}>
                            <HiOutlineTrash size={14} /> Delete
                        </button>
                    ) : <span />}
                    <div className={styles.footerRight}>
                        <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                        <button className={styles.saveBtn} onClick={handleSave}>
                            {mode === 'edit' ? 'Save' : 'Create'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
