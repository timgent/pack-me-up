import { LinkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { reportError } from '../errorReporting'
import { buildInviteLink, createInvite, type StoredInvite } from '../services/invites'
import { shareOrigin } from '../services/publicAppOrigin'
import type { InviteKind } from '../services/rdfSerialization'
import type { AppSession } from '../types/AppSession'
import { Button } from './Button'
import { ShareableLink } from './ShareableLink'

/**
 * "Create invite link" — sharing without needing their address first.
 *
 * This is the half of sharing that was missing. Everything else here asks for
 * a WebID, which only the *other* person can produce, so the first step of
 * every share was a conversation in a different app. An invite link reverses
 * it: send the link, they accept, and their address arrives on its own.
 *
 * It sits above the address field rather than beside it, because it is the
 * path that works when you have nothing — and having nothing is where most
 * people start.
 */
export function CreateInviteLink({ session, podUrl, kind, listId, label, subject, onCreated }: {
    session: AppSession
    podUrl: string
    kind: InviteKind
    listId?: string
    /** Copied onto the invite so the other end can say what it is for. */
    label?: string
    /** How the share-sheet message names what is being shared. */
    subject: string
    onCreated?: (invite: StoredInvite) => void
}) {
    const [invite, setInvite] = useState<StoredInvite | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleCreate = async () => {
        setIsCreating(true)
        setError(null)
        try {
            const created = await createInvite(session, podUrl, { kind, listId, label })
            setInvite(created)
            onCreated?.(created)
        } catch (err) {
            // `createInvite` already words the "this Pod won't do it" case, and
            // that wording matters: it tells them the other way still works
            // rather than leaving them stuck.
            const message = err instanceof Error ? err.message : 'Could not create an invite link.'
            reportError(err, 'CreateInviteLink: failed to create invite')
            setError(message)
        } finally {
            setIsCreating(false)
        }
    }

    if (invite && session.info.webId) {
        return (
            <div className="rounded-xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/40 p-4 space-y-2">
                <p className="text-sm font-semibold text-primary-900 dark:text-primary-200">
                    Invite link ready
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    Send this to them. When they open it and accept, they'll be added the next
                    time you open Pack Me Up — you don't need their address at all.
                </p>
                <ShareableLink
                    // `shareOrigin()`, never this device's: inside the native
                    // shell the runtime origin is `https://localhost`, and this
                    // link's whole job is to be opened somewhere else (#357).
                    link={buildInviteLink(shareOrigin(), podUrl, session.info.webId, invite)}
                    label="Invite link"
                    subject={subject}
                />
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <Button type="button" variant="primary" onClick={handleCreate} disabled={isCreating}>
                <LinkIcon aria-hidden="true" className="h-4 w-4" />
                {isCreating ? 'Creating…' : 'Create invite link'}
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
                Don't know their address? Send a link instead — they accept, and their address
                comes back on its own.
            </p>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    )
}
