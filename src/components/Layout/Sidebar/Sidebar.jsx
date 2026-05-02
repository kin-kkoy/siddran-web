import { Link, useLocation, useNavigate } from "react-router-dom";
import styles from './Sidebar.module.css'
import SidebarList from "./SidebarList";
import ProfileDropdown from "../ProfileDropdown/ProfileDropdown";
import logger from "../../../utils/logger";


function Sidebar({ username, isCollapsed, toggleSidebar, notes, notebooks, currentNoteID, setIsAuthed }) {

    const navigate = useNavigate()
    const location = useLocation()

    const onNotePage = location.pathname.startsWith('/notes/') && location.pathname !== '/notes';

    // logout
    const handleLogout = async () => {
        // calling logout endpoint/route to revoke the refresh token
        try {
            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json'},
                credentials: 'include'
            })
        } catch (error) {
            logger.error('Logout error:', error)
        }

        // clear tokens and cached data then redirect
        localStorage.removeItem('accessToken')
        localStorage.removeItem('username')
        localStorage.removeItem('cinder_settings')
        sessionStorage.clear()

        if (setIsAuthed) {
            setIsAuthed(false)
        }

        navigate('/login')
    }


    return (
        <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>

            {/* TOP SECTION: brand + navigation links */}
            <div className={styles.topSection}>

                {/* Brand section — click to collapse */}
                <div className={styles.brand} onClick={() => toggleSidebar(!isCollapsed)}>
                    <div className={styles.brandIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="24" height="24">
                            <defs>
                                <linearGradient id="sidebar-trail" x1="53" y1="17" x2="42" y2="53" gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor="#f0b840" stopOpacity="0.1"/>
                                    <stop offset="55%" stopColor="#f0b840" stopOpacity="0.55"/>
                                    <stop offset="100%" stopColor="#f0b840" stopOpacity="0.9"/>
                                </linearGradient>
                                <clipPath id="sidebar-rounded">
                                    <rect width="64" height="64" rx="14" ry="14"/>
                                </clipPath>
                            </defs>
                            <rect width="64" height="64" rx="14" ry="14" fill="#09090f"/>
                            <g clipPath="url(#sidebar-rounded)">
                                <polygon points="26,10 28.8,25.2 44,28 28.8,30.8 26,46 23.2,30.8 8,28 23.2,25.2" fill="#f0b840"/>
                                <polygon points="26,15 28,25.8 38,28 28,30.2 26,41 24,30.2 14,28 24,25.8" fill="white" fillOpacity="0.22"/>
                                <polygon points="53,3 55.2,8.8 61,11 55.2,13.2 53,19 50.8,13.2 45,11 50.8,8.8" fill="#f0b840" fillOpacity="0.75"/>
                                <path d="M 53 19 Q 56 36 43 52" fill="none" stroke="url(#sidebar-trail)" strokeWidth="1.6" strokeLinecap="round"/>
                                <g transform="translate(44, 48) rotate(-76)">
                                    <ellipse cx="0" cy="0" rx="7" ry="2.8" fill="#1a1a2e" stroke="#f0b840" strokeWidth="1" strokeOpacity="0.95"/>
                                    <ellipse cx="2.5" cy="-0.6" rx="2.2" ry="1.1" fill="#f0b840" fillOpacity="0.25" stroke="#f0b840" strokeWidth="0.5" strokeOpacity="0.6"/>
                                    <circle cx="-6" cy="0" r="2.4" fill="#f0b840" fillOpacity="0.85"/>
                                    <circle cx="-6" cy="0" r="4.2" fill="#f0b840" fillOpacity="0.2"/>
                                </g>
                                <circle cx="8" cy="52" r="0.9" fill="white" fillOpacity="0.2"/>
                                <circle cx="58" cy="48" r="0.8" fill="#a07af0" fillOpacity="0.4"/>
                                <circle cx="14" cy="10" r="0.7" fill="white" fillOpacity="0.2"/>
                            </g>
                        </svg>
                    </div>
                    <div className={styles.brandText}>
                        <div className={styles.brandName}>SIDDRAN</div>
                        <div className={styles.brandSub}>space drifting</div>
                    </div>
                </div>

                {/* Navigation area */}
                <div className={styles.navSection}>
                    <Link to="/notes"
                        className={`${styles.menuBtn} ${location.pathname.startsWith('/notes') ? styles.active : ''}`}
                        title="Notes">
                            <span className={styles.navDot}></span>
                            <span className={styles.navLabel}>Notes</span>
                    </Link>
                    <Link to="/tasks"
                        className={`${styles.menuBtn} ${location.pathname === '/tasks' ? styles.active : ''}`} title="Tasks">
                            <span className={styles.navDot}></span>
                            <span className={styles.navLabel}>Tasks</span>
                    </Link>

                    <Link to="/sandboxes"
                        className={`${styles.menuBtn} ${location.pathname === '/sandboxes' ? styles.active : ''}`}
                        title="SandBoxes">
                            <span className={styles.navDot}></span>
                            <span className={styles.navLabel}>SandBoxes</span>
                    </Link>

                    <Link to="/calendar"
                        className={`${styles.menuBtn} ${location.pathname === '/calendar' ? styles.active : ''}`}
                        title="Calendar">
                            <span className={styles.navDot}></span>
                            <span className={styles.navLabel}>Calendar</span>
                    </Link>

                    <div className={styles.divider} />

                    <Link to="/mods"
                        className={`${styles.menuBtn} ${location.pathname === '/mods' ? styles.active : ''}`}
                        title="Mods">
                            <span className={styles.navDot}></span>
                            <span className={styles.navLabel}>Mods</span>
                    </Link>
                </div>

            </div>


            {/* MIDDLE SECTION: the list of notes/tasks/mods */}
            <div className={styles.menuSection}>
                {onNotePage && (
                    <SidebarList
                        isCollapsed={isCollapsed}
                        notes={notes}
                        notebooks={notebooks}
                        currentNoteID={currentNoteID}
                    />
                )}
            </div>


            {/* BOTTOM SECTION: user & settings */}
            <div className={styles.bottomSection}>
                <ProfileDropdown username={username} isCollapsed={isCollapsed} handleLogout={handleLogout} />
            </div>

        </div>
    )
}

export default Sidebar
