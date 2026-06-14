import TimeGrid from './TimeGrid.jsx'
import UnscheduledDrawer from './UnscheduledDrawer.jsx'
import styles from './DayView.module.css'

// Day view = single-column TimeGrid + the unscheduled-tasks drawer beside it.
export default function DayView({ dayISO, itemsAt, onSlotClick, onEventClick, onRetime, undated, onSchedule, onToggleDaily }) {
    return (
        <div className={styles.shell}>
            <div className={styles.grid}>
                <TimeGrid
                    days={[dayISO]}
                    itemsAt={itemsAt}
                    onSlotClick={onSlotClick}
                    onEventClick={onEventClick}
                    onRetime={onRetime}
                    onToggleDaily={onToggleDaily}
                />
            </div>
            <UnscheduledDrawer tasks={undated} onSchedule={onSchedule} />
        </div>
    )
}
