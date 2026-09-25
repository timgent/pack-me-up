import { Link } from 'react-router-dom'
import { CheckIcon } from '@heroicons/react/24/outline'
import type { SharedContext } from '../services/rdfSerialization'
import { resolveOwnerDisplayName } from '../services/solidPod'

/** A household is one to three; past this the Sharing page lists them all. */
const MAX_LISTED = 5

/**
 * Whose data you are looking at, and the way to look at someone else's.
 *
 * It lived in the header as a select, which crowded the nav links at mid
 * widths and so was hidden below lg — leaving phones and narrow windows
 * without it. It sits in the account menu (and the phone menu) instead,
 * listed rather than behind another control: there are few enough that a
 * list is one tap where a switcher would be two.
 *
 * Named for people, never Pod addresses: an Inrupt Pod's is a UUID on a
 * storage host, which names nobody.
 */
export function ViewingSwitcher({ contexts, currentPodUrl, onSwitch, onClose, tone }: {
    contexts: SharedContext[]
    /** The shared Pod on screen, or null for your own data. */
    currentPodUrl: string | null
    /** Null means your own data. */
    onSwitch: (podUrl: string | null) => void
    /** Closes whatever menu this sits in, for the link to the full list. */
    onClose: () => void
    /** `menu` for the light account dropdown, `dark` for the phone menu. */
    tone: 'menu' | 'dark'
}) {
    if (contexts.length === 0) return null

    const listed = contexts.slice(0, MAX_LISTED)
    const styles = tone === 'menu'
        ? {
            heading: 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide',
            item: 'hover:bg-primary-50 dark:hover:bg-primary-950/40',
            current: 'text-primary-700 dark:text-primary-300',
            more: 'text-primary-700 dark:text-primary-300',
        }
        : {
            heading: 'text-xs font-semibold text-white/70 uppercase tracking-wide',
            item: 'hover:bg-white/20',
            current: 'text-white',
            more: 'text-white/90',
        }

    const option = (label: string, podUrl: string | null) => {
        const isCurrent = podUrl === currentPodUrl
        return (
            <button
                key={podUrl ?? '__own__'}
                type="button"
                onClick={() => onSwitch(podUrl)}
                aria-current={isCurrent ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${isCurrent ? `font-semibold ${styles.current}` : 'font-medium'} ${styles.item} transition-colors duration-200`}
            >
                <CheckIcon aria-hidden="true" className={`h-4 w-4 shrink-0 ${isCurrent ? '' : 'invisible'}`} />
                <span className="truncate">{label}</span>
            </button>
        )
    }

    return (
        <div role="group" aria-labelledby={`viewing-${tone}`} className="space-y-0.5">
            <p id={`viewing-${tone}`} className={`px-2 pb-1 ${styles.heading}`}>Viewing</p>
            {option('Your data', null)}
            {listed.map(ctx => option(ctx.label ?? resolveOwnerDisplayName(null, ctx.webId, ctx.podUrl), ctx.podUrl))}
            {contexts.length > MAX_LISTED && (
                <Link to="/sharing" onClick={onClose} className={`block px-2 py-2 text-sm font-medium underline hover:no-underline ${styles.more}`}>
                    All shared with me…
                </Link>
            )}
        </div>
    )
}
