import { createPortal } from 'react-dom'
import styles from './ConfirmModal.module.css'

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', cancelText = 'Cancel' }) {
    if (!isOpen) return null

    const stop = (e) => e.stopPropagation()

    const handleBackdropClick = (e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
    }

    return createPortal(
        <div className={styles.backdrop} onClick={handleBackdropClick} onMouseDown={stop}>
            <div className={styles.modal} onClick={stop}>
                <div className={styles.header}>
                    <h2>{title}</h2>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>

                <div className={styles.content}>
                    <p>{message}</p>
                </div>

                <div className={styles.actions}>
                    <button onClick={onClose} className={styles.cancelBtn}>
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} className={styles.confirmBtn}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

export default ConfirmModal
