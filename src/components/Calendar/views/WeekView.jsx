import TimeGrid from './TimeGrid.jsx'
import { weekDays, isoDate } from '../calendarDates'

// Week view = the shared TimeGrid over the Monday-start week containing `anchor` (a Date).
export default function WeekView({ anchor, itemsAt, onSlotClick, onEventClick, onRetime }) {
    const days = weekDays(anchor).map(isoDate)
    return (
        <TimeGrid
            days={days}
            itemsAt={itemsAt}
            onSlotClick={onSlotClick}
            onEventClick={onEventClick}
            onRetime={onRetime}
        />
    )
}
