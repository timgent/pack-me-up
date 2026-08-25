import { Link } from 'react-router-dom'
import { ApplicationCapabilityRdfa } from './ApplicationCapabilityRdfa'

export const FEEDBACK_EMAIL = 'tim.packmeup@gmail.com'

const linkStyles = 'text-gray-500 dark:text-gray-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors duration-200'

/**
 * Where the things you need once belong — the policy, the data-deletion page, a
 * way to get in touch. All three were in the top nav competing with the everyday
 * links; none of them is an everyday link.
 *
 * "Delete my data" rather than "Your data": the nav's pod switcher already uses
 * "Your data" to mean "your own pod rather than a shared one", and this is also
 * the label Google Play's reviewers are looking for.
 */
export function Footer() {
    return (
        <footer className="border-t border-primary-100 dark:border-primary-900 bg-white/40 dark:bg-gray-900/40 safe-area-bottom">
            {/*
              * pb-24 on mobile keeps the last row above Sentry's fixed feedback
              * widget, which otherwise sits on top of the "Feedback" link once you
              * scroll to the end of the page. Desktop centres the row well clear of
              * the widget, so the extra space comes off again at md.
              */}
            <nav
                aria-label="Site information"
                className="container mx-auto px-4 py-5 pb-24 md:pb-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
            >
                <Link to="/privacy-policy" className={linkStyles}>
                    Privacy policy
                </Link>
                <Link to="/your-data" className={linkStyles}>
                    Delete my data
                </Link>
                <a href={`mailto:${FEEDBACK_EMAIL}`} className={linkStyles}>
                    Feedback
                </a>
            </nav>
            {/* Invisible: the app's Application Capability description as RDFa,
                so the triples travel with the HTML too. See
                ./ApplicationCapabilityRdfa.tsx. */}
            <ApplicationCapabilityRdfa />
        </footer>
    )
}
