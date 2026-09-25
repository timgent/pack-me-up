import { ChevronRightIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'

/**
 * Sharing by typing someone's address, kept out of the way.
 *
 * The invite link needs nothing from the other person, so it leads on both
 * share surfaces; the address field needs the one thing only they can produce,
 * and laid out beside the link it was a second way to do the same thing, read
 * by everybody and needed by few. It is still the way to share with no wait —
 * an invite waits for this app to run again, an address grants on the spot —
 * so it stays, closed until asked for.
 *
 * Controlled, because picking somebody you already know (the chips above it)
 * fills the field in and has to open it to show who, and the Share button.
 */
export function ShareByAddress({ open, onOpenChange, children }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
}) {
    return (
        <details
            open={open}
            onToggle={e => {
                const nowOpen = (e.currentTarget as HTMLDetailsElement).open
                if (nowOpen !== open) onOpenChange(nowOpen)
            }}
            className="group"
        >
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
                Use a sharing address instead
            </summary>
            <div className="mt-3 space-y-3">{children}</div>
        </details>
    )
}
