import { useState } from 'react'
import styles from './Card.module.css'

function AddCard({ addNote }) {
  const [submitting, setSubmitting] = useState(false)

  const handleClick = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await addNote("Untitled")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div onClick={handleClick} className={styles.addCard} aria-disabled={submitting}>
        <span className={styles.addCardIcon}>+</span>
        <h2>{submitting ? 'Adding…' : 'Add Note'}</h2>
    </div>
  )
}

export default AddCard
