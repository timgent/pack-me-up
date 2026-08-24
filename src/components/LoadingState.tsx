interface LoadingStateProps {
    /** What is being waited for, e.g. "Loading packing lists..." — read out to screen readers. */
    message: string;
    /** How many placeholder cards to stand in for the content to come. */
    rows?: number;
}

/**
 * The app's one waiting treatment: a suitcase rocking above a skeleton of the
 * content on its way. Sized to sit in the same space the real content will
 * take, so nothing jumps when it arrives.
 */
export function LoadingState({ message, rows = 3 }: LoadingStateProps) {
    return (
        <div role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-3 py-6">
                <span aria-hidden="true" className="loading-suitcase text-5xl leading-none">🧳</span>
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{message}</p>
            </div>

            <div data-testid="loading-skeleton" aria-hidden="true" className="space-y-4">
                {Array.from({ length: rows }, (_, index) => (
                    <div
                        key={index}
                        data-testid="loading-skeleton-card"
                        className="rounded-2xl border-2 border-primary-100 dark:border-primary-900 bg-white dark:bg-gray-900 p-5 shadow-soft"
                    >
                        <div className="loading-skeleton-bar h-5 w-1/2 rounded-full" />
                        <div className="loading-skeleton-bar mt-3 h-4 w-1/3 rounded-full" />
                        <div className="loading-skeleton-bar mt-5 h-3 w-full rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}
