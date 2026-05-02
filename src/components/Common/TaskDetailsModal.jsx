import { useEffect, useRef, useState } from 'react';
import styles from './TaskDetailsModal.module.css'

function TaskDetailsModal({onClose, task, updateTask, isDailyTask}) {

    const [titleData, setTitleData] = useState(task.title)
    const [descriptionData, setDescriptionData] = useState(task.description)
    const [prioritySelected, setPrioritySelected] = useState(task.priority)
    const [dueDate, setDueDate] = useState(task.due_date)
    const [completion, setCompletion] = useState(task.is_completed)
    const isDirtyRef = useRef(false)

    // Warn user before closing tab with unsaved changes
    useEffect(() => {
        const handler = (e) => {
            if (isDirtyRef.current) {
                e.preventDefault()
            }
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [])

    // save the details with the newly updated fields
    const saveDetails = () => {
        if (!isDirtyRef.current) return

        const changes = {}
        if (titleData !== task.title) changes.title = titleData
        if (!isDailyTask && descriptionData !== task.description) changes.description = descriptionData
        if (prioritySelected !== task.priority) changes.priority = prioritySelected
        if (!isDailyTask && dueDate !== task.due_date) changes.due_date = dueDate
        if (completion !== task.is_completed) changes.is_completed = completion

        updateTask(task.id, changes)
    }

    const handleClose = () => {
        saveDetails()
        onClose()
    }

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) handleClose()
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return null
        const date = new Date(dateStr)
        return date.toLocaleDateString(undefined, {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    }

    return (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.modal}>

                {/* Header — title + close */}
                <div className={styles.header}>
                    <input
                        type="text"
                        className={styles.titleInput}
                        value={titleData}
                        onChange={e => { setTitleData(e.target.value); isDirtyRef.current = true; }}
                        placeholder="Task title..."
                    />
                    <button type="button" className={styles.closeBtn} onClick={handleClose}>✕</button>
                </div>

                {/* Body */}
                <div className={styles.body}>

                    {/* Status */}
                    <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Status</span>
                        <button
                            className={`${styles.statusBtn} ${completion ? styles.completed : ''}`}
                            onClick={() => { setCompletion(!completion); isDirtyRef.current = true; }}
                        >
                            <span className={styles.statusDot} />
                            {completion ? "Completed" : "In Progress"}
                        </button>
                    </div>

                    {/* Description */}
                    {!isDailyTask && (
                        <div className={styles.fieldGroup}>
                            <span className={styles.fieldLabel}>Description</span>
                            <textarea
                                className={styles.descriptionInput}
                                value={descriptionData || ''}
                                onChange={e => { setDescriptionData(e.target.value); isDirtyRef.current = true; }}
                                placeholder="Add a description..."
                            />
                        </div>
                    )}
                    

                    <div className={styles.divider} />

                    {/* Priority & Deadline */}
                    <div className={styles.metaRow}>
                        <div className={styles.metaItem}>
                            <span className={styles.fieldLabel}>Priority</span>
                            <select
                                className={styles.prioritySelect}
                                value={prioritySelected}
                                onChange={e => { setPrioritySelected(e.target.value); isDirtyRef.current = true; }}
                            >
                                <option value="high">High</option>
                                <option value="normal">Normal</option>
                                <option value="low">Low</option>
                            </select>
                        </div>

                        {!isDailyTask && (
                            <div className={styles.metaItem}>
                                <span className={styles.fieldLabel}>Deadline</span>
                                <span className={`${styles.deadline} ${!dueDate ? styles.noDate : ''}`}>
                                    {formatDate(dueDate) || 'No deadline set'}
                                </span>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}

export default TaskDetailsModal