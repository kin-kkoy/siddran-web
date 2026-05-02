import { useState } from 'react'
import styles from './Card.module.css'

function AddCardList({ addNote }) {
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
    <div onClick={handleClick} className={styles.addCardList} aria-disabled={submitting}>
        <span className={styles.addCardListIcon}>+</span>
        <h4>{submitting ? 'Adding…' : 'Add Note'}</h4>
    </div>
  )
}

export default AddCardList
