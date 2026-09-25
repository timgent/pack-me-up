import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { SolidPodPrompt } from '../components/SolidPodPrompt'
import { useSolidPod } from '../components/SolidPodContext'
import { useSolidProfile } from '../hooks/useSolidProfile'
import { useSharedWithMeSync } from '../hooks/useSharedWithMeSync'
import { useSharedListsSync } from '../hooks/useSharedListsSync'
import { reportError } from '../errorReporting'
import { acceptInvite, inviteUrlFor } from '../services/invites'
import { invitedListId, withAcceptedInvite, type AcceptedInvite } from '../services/acceptedInvites'
import { isInviteToken } from '../services/inviteToken'
import { friendlyWebIdName } from '../services/solidPod'

/**
 * Where an invite link lands.
 *
 * Everything shown here comes out of the link, because the invite resource is
 * append-only and this page cannot read it — that is the point of it, not a
 * limitation to work around. So the link carries who and what, and none of it
 * is trusted: it decides the wording on this screen, while what actually gets
 * granted is decided later by the inviter's own client from her own copy of
 * the invite. A tampered label misleads nobody but the person who tampered.
 *
 * The one thing that is checked here is the sender's name, which is read from
 * their public profile card rather than taken from the link.
 *
 * Accepting also leaves a record on this side, in the invitee's own
 * shared-with-me documents. Accepting otherwise writes only to the sender's
 * Pod, so the invitee's Sharing page had nothing to show for it — before
 * access arrived, or after. The Sharing page works out which it is.
 */
export function AcceptInvitePage() {
    const { token } = useParams<{ token: string }>()
    const [searchParams] = useSearchParams()
    const { session, isLoggedIn } = useSolidPod()

    const podUrl = searchParams.get('pod') ?? ''
    const ownerWebId = searchParams.get('owner') ?? ''
    const kind = searchParams.get('kind') === 'list' ? 'list' : 'full-setup'
    const label = searchParams.get('label')
    const listId = invitedListId(searchParams.get('list'))

    const { sharedWithMe, saveSharedWithMe } = useSharedWithMeSync()
    const { sharedListsWithMe, saveSharedListsWithMe } = useSharedListsSync()
    // Both documents are rewritten whole, so saving before they have loaded
    // would replace every other share with this one.
    const recordsLoaded = sharedWithMe !== null && sharedListsWithMe !== null

    const [signInPromptOpen, setSignInPromptOpen] = useState(false)
    const [state, setState] = useState<'ready' | 'accepting' | 'accepted'>('ready')
    const [error, setError] = useState<string | null>(null)

    // Their name from their own card, not from the link — the one piece of
    // this that an attacker cannot write.
    const ownerProfile = useSolidProfile(ownerWebId || undefined, session)
    const senderName = ownerProfile.name ?? (ownerWebId ? friendlyWebIdName(ownerWebId) : 'Someone')

    const what = kind === 'list'
        ? (label ? `their packing list “${label}”` : 'one of their packing lists')
        : 'their questions and all their packing lists'

    const linkIsUsable = isInviteToken(token) && podUrl !== '' && ownerWebId !== ''

    const handleAccept = async () => {
        if (!session?.info.webId || !token) return
        setState('accepting')
        setError(null)
        try {
            await acceptInvite(session, inviteUrlFor(podUrl, token), session.info.webId)
            await recordAcceptance()
            setState('accepted')
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not accept this invite.'
            reportError(err, 'AcceptInvitePage: failed to accept invite')
            setError(message)
            setState('ready')
        }
    }

    /**
     * Never fails the acceptance: that is already on their Pod, so saying it
     * failed would be untrue, and accepting again would fail for real. At
     * worst the invitee finds the share the old way, by opening its link.
     */
    const recordAcceptance = async () => {
        if (!sharedWithMe || !sharedListsWithMe) return
        const accepted: AcceptedInvite = kind === 'list'
            ? { kind, podUrl, ownerWebId, ownerName: ownerProfile.name, ...(listId ? { listId } : {}), ...(label ? { label } : {}) }
            : { kind, podUrl, ownerWebId, ownerName: ownerProfile.name }
        const updates = withAcceptedInvite(accepted, sharedWithMe, sharedListsWithMe, new Date().toISOString())
        try {
            if (updates.sharedWithMe) await saveSharedWithMe(updates.sharedWithMe)
            if (updates.sharedListsWithMe) await saveSharedListsWithMe(updates.sharedListsWithMe)
        } catch (err) {
            reportError(err, 'AcceptInvitePage: accepted, but could not record it on this side')
        }
    }

    if (!linkIsUsable) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">This invite link doesn't look right</h1>
                <p className="text-gray-700 dark:text-gray-300">
                    It may have been cut short on the way to you — links are easily broken by
                    a chat app that wraps them. Ask them to send it again.
                </p>
            </div>
        )
    }

    if (state === 'accepted') {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-3">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    <CheckCircleIcon aria-hidden="true" className="h-7 w-7 shrink-0 text-green-600 dark:text-green-400" />
                    Accepted
                </h1>
                <p className="text-gray-700 dark:text-gray-300">
                    {senderName} will share {what} with you the next time they open Pack Me Up.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {/* Said plainly rather than hidden behind a spinner: there is no
                        server to do this while they are away, and somebody waiting on
                        a screen that implies otherwise is worse off than somebody
                        told the truth. */}
                    Nothing happens on their Pod until their app runs, so you won't be able to
                    open it straight away. You don't need to do anything else — it's waiting
                    for you on your Sharing page, and opens from there once they have.
                </p>
                <Link
                    to="/sharing"
                    className="inline-block px-4 py-2 text-sm font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                >
                    Go to Sharing
                </Link>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {senderName} wants to share {what} with you
            </h1>

            {isLoggedIn && session?.info.webId ? (
                <>
                    <p className="text-gray-700 dark:text-gray-300">
                        Accepting sends them your sharing address so they can give you access.
                        It tells them nothing else, and gives them nothing of yours.
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        You'll be accepting as{' '}
                        <span className="font-mono text-xs break-all">{session.info.webId}</span>.
                    </p>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <Button type="button" variant="primary" onClick={handleAccept} disabled={state === 'accepting' || !recordsLoaded}>
                        {state === 'accepting' ? 'Accepting…' : 'Accept invite'}
                    </Button>
                </>
            ) : (
                <>
                    <p className="text-gray-700 dark:text-gray-300">
                        Sign in with your Solid Pod to accept. Accepting is how they learn your
                        sharing address — which is the one thing they need, and the step that is
                        otherwise a conversation.
                    </p>
                    <Button type="button" variant="primary" onClick={() => setSignInPromptOpen(true)}>
                        Sign in to accept
                    </Button>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Signing in is free, and brings you straight back here.
                    </p>
                </>
            )}

            <SolidPodPrompt
                isOpen={signInPromptOpen}
                onClose={() => setSignInPromptOpen(false)}
                title="Sign in to accept"
                message={`${senderName} wants to share ${what} with you. Signing in gives you an address of your own, which is what they need to share with you. You'll come straight back here.`}
                benefitsTitle="What signing in gets you:"
                benefits={[
                    { label: 'Accept this invite', text: `Get ${what}` },
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
