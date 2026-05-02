import { useState, useMemo } from 'react'
import { FaCheck } from 'react-icons/fa'
import { HiOutlineTrash } from 'react-icons/hi'
import styles from './DailyTaskModal.module.css'
import ConfirmModal from './ConfirmModal'
import { toast } from '../../utils/toast'
import logger from '../../utils/logger'

function DailyTaskModal({ tasks, toggleCompletion, addDailyTask, deleteTask, batchToggleDailyTasks, batchDeleteDailyTasks, onOpenDetail, onClose }) {
    const [taskTitle, setTaskTitle] = useState("")
    const [selectedPriority, setSelectedPriority] = useState('normal')
    const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // Batch state: pending changes tracked locally
    const [pendingCompletions, setPendingCompletions] = useState(new Map()) // Map<id, boolean>
    const [pendingDeletions, setPendingDeletions] = useState(new Set())     // Set<id>

    const hasPendingChanges = pendingCompletions.size > 0 || pendingDeletions.size > 0

    // Compute effective tasks with pending changes merged in
    const effectiveTasks = useMemo(() => {
        return tasks.map(t => {
            const isPendingDelete = pendingDeletions.has(t.id)
            const isPendingToggle = pendingCompletions.has(t.id)
            const effectiveCompleted = isPendingToggle ? pendingCompletions.get(t.id) : t.is_completed
            return {
                ...t,
                is_completed: effectiveCompleted,
                _pendingDelete: isPendingDelete,
                _pendingToggle: isPendingToggle
            }
        })
    }, [tasks, pendingCompletions, pendingDeletions])

    // Progress bar uses effective state, excluding pending-deleted tasks
    const visibleTasks = effectiveTasks.filter(t => !t._pendingDelete)
    const completedCount = visibleTasks.filter(t => t.is_completed).length
    const totalCount = visibleTasks.length

    // Priority columns
    const sortByCompletion = (a, b) => a.is_completed === b.is_completed ? 0 : a.is_completed ? 1 : -1
    const lowTasks    = effectiveTasks.filter(t => t.priority === 'low').sort(sortByCompletion)
    const normalTasks = effectiveTasks.filter(t => t.priority === 'normal').sort(sortByCompletion)
    const highTasks   = effectiveTasks.filter(t => t.priority === 'high').sort(sortByCompletion)
    const columns = [
        { key: 'high',   label: 'High',   tasks: highTasks   },
        { key: 'normal', label: 'Normal', tasks: normalTasks },
        { key: 'low',    label: 'Low',    tasks: lowTasks    },
    ].filter(col => col.tasks.length > 0)

    // --- Handlers ---

    const handleToggle = (taskId) => {
        setPendingCompletions(prev => {
            const next = new Map(prev)
            const original = tasks.find(t => t.id === taskId)?.is_completed
            const currentEffective = next.has(taskId) ? next.get(taskId) : original
            const newValue = !currentEffective

            // Net-zero: if toggling back to original, remove from pending
            if (newValue === original) {
                next.delete(taskId)
            } else {
                next.set(taskId, newValue)
            }
            return next
        })
    }

    const handleDelete = (taskId) => {
        setPendingDeletions(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) {
                next.delete(taskId) // undo
            } else {
                next.add(taskId)
            }
            return next
        })
    }

    const handleAdd = () => {
        if (!taskTitle.trim()) return
        addDailyTask(taskTitle, selectedPriority)
        setTaskTitle("")
    }

    const handleSave = async () => {
        if (!hasPendingChanges) {
            onClose()
            return
        }

        setIsSaving(true)

        try {
            const promises = []

            // Batch toggle
            const toggleUpdates = Array.from(pendingCompletions.entries()).map(
                ([id, is_completed]) => ({ id, is_completed })
            )
            if (toggleUpdates.length > 0) {
                promises.push(batchToggleDailyTasks(toggleUpdates))
            }

            // Batch delete
            const deleteIds = Array.from(pendingDeletions)
            if (deleteIds.length > 0) {
                promises.push(batchDeleteDailyTasks(deleteIds))
            }

            await Promise.all(promises)

            toast.success('Changes saved')
            onClose()
        } catch (error) {
            logger.error('Batch save error:', error)
            toast.error('Some changes failed to save. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCloseAttempt = () => {
        if (hasPendingChanges) {
            setShowUnsavedWarning(true)
        } else {
            onClose()
        }
    }

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) handleCloseAttempt()
    }

    return (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.modal}>

                {/* Header */}
                <div className={styles.header}>
                    <h3 className={styles.title}>Today's Tasks</h3>
                    <div className={styles.headerActions}>
                        {hasPendingChanges && (
                            <button
                                className={styles.saveBtn}
                                onClick={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        )}
                        <button className={styles.closeBtn} onClick={handleCloseAttempt}>✕</button>
                    </div>
                </div>

                {/* Progress */}
                <div className={styles.progress}>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: totalCount ? `${(completedCount / totalCount) * 100}%` : '0%' }}
                        />
                    </div>
                    <span className={styles.progressText}>
                        {completedCount} / {totalCount} completed
                    </span>
                </div>

                {/* Add-task row */}
                <div className={styles.addRow}>
                    <input
                        type="text"
                        value={taskTitle}
                        onChange={e => setTaskTitle(e.target.value)}
                        placeholder="New task..."
                        className={styles.addInput}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                    />
                    <select
                        value={selectedPriority}
                        onChange={e => setSelectedPriority(e.target.value)}
                        className={styles.addSelect}
                    >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                    </select>
                    <button className={styles.addBtn} onClick={handleAdd}>+</button>
                </div>

                {/* Columns */}
                {columns.length > 0 ? (
                    <div className={styles.columnsContainer}>
                        {columns.map(col => (
                            <div key={col.key} className={styles.column}>
                                <div className={`${styles.columnHeader} ${styles[col.key]}`}>
                                    {col.label}
                                </div>
                                <ul className={styles.taskList}>
                                    {col.tasks.map(task => (
                                        <li
                                            key={task.id}
                                            className={[
                                                styles.taskItem,
                                                task.is_completed ? styles.completed : '',
                                                task._pendingDelete ? styles.pendingDelete : '',
                                                task._pendingToggle ? styles.pendingToggle : '',
                                            ].filter(Boolean).join(' ')}
                                            onClick={() => !task._pendingDelete && onOpenDetail(task)}
                                        >
                                            {/* Checkbox */}
                                            <button
                                                className={`${styles.checkbox} ${task.is_completed ? styles.checked : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (!task._pendingDelete) handleToggle(task.id)
                                                }}
                                            >
                                                {task.is_completed && <FaCheck size={12} />}
                                            </button>

                                            {/* Task Content */}
                                            <div className={styles.taskContent}>
                                                <span className={styles.taskTitle}>{task.title}</span>
                                                {task._pendingDelete && (
                                                    <span className={styles.pendingHint}>Will be deleted</span>
                                                )}
                                            </div>

                                            {/* Delete / Undo Button */}
                                            <button
                                                className={`${styles.deleteBtn} ${task._pendingDelete ? styles.undoBtn : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDelete(task.id)
                                                }}
                                                title={task._pendingDelete ? 'Undo delete' : 'Mark for deletion'}
                                            >
                                                <HiOutlineTrash size={14} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyState}>No tasks yet — add one above.</div>
                )}

            </div>

            {/* Unsaved Changes Warning */}
            <ConfirmModal
                isOpen={showUnsavedWarning}
                onClose={() => {
                    setShowUnsavedWarning(false)
                    onClose()
                }}
                onConfirm={() => {
                    setShowUnsavedWarning(false)
                    handleSave()
                }}
                title="Unsaved Changes"
                message="You have unsaved changes. Would you like to apply them before closing?"
                confirmText="Apply & Close"
                cancelText="Discard"
            />
        </div>
    )
}

export default DailyTaskModal
