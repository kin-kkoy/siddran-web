import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Card.module.css'

function AddCard({ addNote }) {
  const navigate = useNavigate()
  const inFlightRef = useRef(false)

  const handleClick = async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await addNote("Untitled", (newNote) => {
        if (newNote?.id) navigate(`/notes/${newNote.id}`)
      })
    } finally {
      inFlightRef.current = false
    }
  }

  return (
    <div onClick={handleClick} className={styles.addCard}>
        <span className={styles.addCardIcon}>+</span>
        <h2>Add Note</h2>
    </div>
  )
}

export default AddCard
