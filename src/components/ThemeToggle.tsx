import { MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useTheme } from './ThemeContext'

interface ThemeToggleProps {
    /** The mobile menu is a list of labelled rows, so the icon alone won't do. */
    showLabel?: boolean
    className?: string
}

/**
 * Switches between light and dark. Clicking it is an explicit choice, so from
 * then on the OS setting no longer has a say — see ThemeContext.
 */
export const ThemeToggle = ({ showLabel = false, className = '' }: ThemeToggleProps) => {
    const { theme, toggleTheme } = useTheme()
    const goingDark = theme === 'light'
    const label = goingDark ? 'Switch to dark mode' : 'Switch to light mode'

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={label}
            title={label}
            className={
                showLabel
                    ? `w-full flex items-center gap-3 px-3 py-3 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200 ${className}`
                    : `p-2 rounded-lg text-white hover:bg-white/20 transition-all duration-200 ${className}`
            }
        >
            {goingDark ? <MoonIcon className="h-5 w-5" aria-hidden="true" /> : <SunIcon className="h-5 w-5" aria-hidden="true" />}
            {showLabel && <span>{goingDark ? 'Dark mode' : 'Light mode'}</span>}
        </button>
    )
}
