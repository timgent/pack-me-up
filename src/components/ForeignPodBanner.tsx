import { Link } from 'react-router-dom'
import { ArrowUturnLeftIcon, EyeIcon } from '@heroicons/react/24/outline'
import { InPageBannerSlot } from './PageBannerSlot'

/**
 * Says whose data is on screen while viewing someone else's shared setup, and
 * offers the way back to your own — which was otherwise only in the context
 * switcher, inside the account menu.
 *
 * Full width, with the app's other banners (see `PageBannerSlot`), and blue
 * rather than the tester banner's accent so the two never read as one.
 */
export function ForeignPodBanner({ ownerName, podUrl }: { ownerName: string; podUrl: string }) {
    return (
        <InPageBannerSlot>
            <div
                data-testid="foreign-pod-banner"
                className="bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800 px-4 py-2.5 flex items-center justify-between gap-3"
            >
                <p className="text-sm text-blue-900 dark:text-blue-200 min-w-0">
                    <EyeIcon aria-hidden="true" className="mr-1 inline-block h-4 w-4 align-[-0.2em]" />
                    Viewing <span className="font-semibold break-words" title={podUrl}>{ownerName}</span>'s data
                </p>
                <Link
                    to="/view-lists"
                    className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-blue-900 dark:text-blue-200 underline hover:no-underline"
                >
                    <ArrowUturnLeftIcon aria-hidden="true" className="h-4 w-4" />
                    Back to my lists
                </Link>
            </div>
        </InPageBannerSlot>
    )
}
