import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface UpdateAvailableBannerProps {
    onReload: () => void
}

/**
 * Says a new build is ready and lets the user apply it on their own terms,
 * rather than the tab reloading out from under them — see usePwaUpdate and
 * services/pwaUpdate.ts. Not dismissible, like OfflineBanner: the fact stays
 * true until they act on it.
 */
export function UpdateAvailableBanner({ onReload }: UpdateAvailableBannerProps) {
    return (
        <div
            data-testid="update-available-banner"
            role="status"
            aria-live="polite"
            className="bg-accent-50 dark:bg-accent-950/40 border-b border-accent-200 dark:border-accent-800 px-4 py-2.5 flex items-center justify-between gap-3"
        >
            <p className="text-sm text-accent-900 dark:text-accent-200 font-medium">
                <ArrowPathIcon aria-hidden="true" className="mr-1 inline-block h-4 w-4 align-[-0.2em]" />
                A new version of Pack Me Up is ready.
            </p>
            <button
                type="button"
                onClick={onReload}
                className="text-sm font-bold text-accent-900 dark:text-accent-200 underline shrink-0 cursor-pointer"
            >
                Reload
            </button>
        </div>
    )
}
