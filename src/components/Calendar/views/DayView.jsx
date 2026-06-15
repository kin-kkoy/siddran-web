import TimeGrid from './TimeGrid.jsx'
import UnscheduledDrawer from './UnscheduledDrawer.jsx'
import styles from './DayView.module.css'

// Day view = single-column TimeGrid + the unscheduled-tasks drawer beside it.
export default function DayView({ dayISO, itemsAt, ephemeralAt, onSlotClick, onEventClick, onRetime, onResizeEvent, undated, onSchedule, onToggleDaily, onDailyTime, onDailyDone, onJumpToDay }) {
    return (
        <div className={styles.shell}>
            <div className={styles.grid}>
                <TimeGrid
                    days={[dayISO]}
                    itemsAt={itemsAt}
                    ephemeralAt={ephemeralAt}
                    onSlotClick={onSlotClick}
                    onEventClick={onEventClick}
                    onRetime={onRetime}
                    onResizeEvent={onResizeEvent}
                    onToggleDaily={onToggleDaily}
                    onDailyTime={onDailyTime}
                    onDailyDone={onDailyDone}
                    onJumpToDay={onJumpToDay}
                />
            </div>
            <UnscheduledDrawer tasks={undated} onSchedule={onSchedule} />
        </div>
    )
}
