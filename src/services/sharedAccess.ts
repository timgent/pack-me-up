import { getSolidDataset } from '@inrupt/solid-client'
import type { AppSession } from '../types/AppSession'
import { isAuthenticationError, verifyForeignPodAccess } from './solidPod'

/**
 * Whether something recorded as shared with me can be opened yet.
 *
 * An accepted invite is recorded straight away (`acceptedInvites.ts`), but the
 * access behind it only arrives when the sender's app next runs. Until then
 * the share is `waiting`, and the Sharing page says so rather than offering an
 * Open that leads to a refusal. Worked out live rather than stored, so it
 * turns into an ordinary entry by itself the first time the grant is there.
 *
 * Only a refusal counts as waiting. A check that could not be made at all —
 * offline, a server down — says nothing about access, and opening the share
 * is where the app explains what it can.
 */
export type SharedAccessState = 'open' | 'waiting'

export type SharedAccessTarget =
    | { kind: 'setup'; podUrl: string }
    | { kind: 'list'; listUrl: string }

export async function checkSharedAccess(session: AppSession, target: SharedAccessTarget): Promise<SharedAccessState> {
    try {
        if (target.kind === 'setup') {
            return (await verifyForeignPodAccess(session, target.podUrl)) ? 'open' : 'waiting'
        }
        await getSolidDataset(target.listUrl, { fetch: session.fetch })
        return 'open'
    } catch (err) {
        return isAuthenticationError(err) ? 'waiting' : 'open'
    }
}
