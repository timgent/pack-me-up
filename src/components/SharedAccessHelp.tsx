import { useState } from 'react'
import { Button } from './Button'
import { SolidPodPrompt } from './SolidPodPrompt'
import { YourSharingAddress } from './YourSharingAddress'

/**
 * What the person on the receiving end of a share sees when the link does not
 * open.
 *
 * Both of the screens this replaces were dead ends. "Please log in to view
 * shared content" had no way to log in on it. "Access denied to this pod. The
 * owner may have revoked access." named the one cause that the reader can do
 * nothing about, and left out the likely one: the two of them exchanged
 * different addresses, and the grant went to an account that is not the one
 * they are signed in as. That is a two-message fix once somebody says so.
 *
 * So: signed out, this offers the way in. Signed in, it says which account they
 * are signed in as, suggests a new invite link — which lands on whoever
 * accepts it — and hands them that address to send back as the fallback.
 */
export function SharedAccessHelp({ what, isLoggedIn, webId }: {
    /** Whether the link was to one list or to somebody's whole setup. */
    what: 'list' | 'lists'
    isLoggedIn: boolean
    webId: string | null | undefined
}) {
    const [signInPromptOpen, setSignInPromptOpen] = useState(false)

    const subject = what === 'list' ? 'a packing list' : 'their packing lists'
    const object = what === 'list' ? 'it' : 'them'

    // Signed in without a readable WebID is a session that has not settled into
    // anything we can explain; offering the way in beats explaining nothing.
    const canShowAddress = isLoggedIn && !!webId

    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">
            {canShowAddress ? (
                <>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        You can't open this yet
                    </h1>
                    <p className="text-gray-700 dark:text-gray-300">
                        You're signed in as{' '}
                        <span className="font-mono text-sm break-all">{webId}</span>, and this
                        {what === 'list' ? ' list' : ' Pod'} hasn't been shared with that account.
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                        Usually that means they shared with a <strong>different address</strong> —
                        it's an easy one to get wrong. Less often, they've removed access since
                        sending the link.
                    </p>
                    {/* An invite lands on whichever account accepts it, so it
                        fixes a mixed-up address without anyone finding the
                        right one — hence first. */}
                    <p className="text-gray-700 dark:text-gray-300">
                        The easiest fix: ask them for a <strong>new invite link</strong> and accept
                        it here.
                    </p>
                    <YourSharingAddress
                        webId={webId}
                        title="Or send them your address"
                        description="This is the address you're signed in as. If they share with it, it lands on the account you're actually using."
                    />
                </>
            ) : (
                <>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        Someone shared {subject} with you
                    </h1>
                    <p className="text-gray-700 dark:text-gray-300">
                        Sign in with your Solid Pod to open {object}. Shared {what === 'list' ? 'lists live' : 'lists live'} in
                        the other person's own storage, so the app has to know who you are before it
                        can ask for {object}.
                    </p>
                    <Button type="button" variant="primary" onClick={() => setSignInPromptOpen(true)}>
                        Sign in to open
                    </Button>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Signing in is free, and brings you straight back here.
                    </p>
                </>
            )}

            <SolidPodPrompt
                isOpen={signInPromptOpen}
                onClose={() => setSignInPromptOpen(false)}
                title={`Sign in to open ${object}`}
                message={`Someone shared ${subject} with you. It lives in their own storage, so signing in is how the app proves it's you they shared with. You'll come straight back here.`}
                benefitsTitle="What signing in gets you:"
                benefits={[
                    { label: 'Open what was shared', text: `See ${subject} and pack along with them` },
                    { label: 'Free', text: 'All major Pod providers are free to sign up' },
                    { label: 'Your own address', text: 'So other people can share with you too' },
                    { label: 'You own your data', text: 'Your own lists stay in your personal storage' },
                ]}
                confirmLabel="Sign in"
                dismissLabel="Not now"
            />
        </div>
    )
}
