import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './Card.module.css'

function AddCardList({ addNote }) {
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
    <div onClick={handleClick} className={styles.addCardList}>
        <span className={styles.addCardListIcon}>+</span>
        <h4>Add Note</h4>
    </div>
  )
}

export default AddCardList
