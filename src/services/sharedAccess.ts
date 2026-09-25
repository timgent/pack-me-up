import { getSolidDataset } from '@inrupt/solid-client'
import type { AppSession } from '../types/AppSession'
import { isAuthenticationError, verifyForeignPodAccess } from './solidPod'

/**
 * Whether something recorded as shared with me can be opened right now.
 *
 * `refused` means one of two things, and the entry's `awaitingAccess` says
 * which: an accepted invite whose sender's app has not run since (a wait), or
 * a share that has opened before and has since been revoked. Worked out live
 * rather than stored, so an entry changes by itself when access does.
 *
 * Only a refusal counts. A check that could not be made at all —
 * offline, a server down — says nothing about access, and opening the share
 * is where the app explains what it can.
 */
export type SharedAccessState = 'open' | 'refused'

export type SharedAccessTarget =
    | { kind: 'setup'; podUrl: string }
    | { kind: 'list'; listUrl: string }

export async function checkSharedAccess(session: AppSession, target: SharedAccessTarget): Promise<SharedAccessState> {
    try {
        if (target.kind === 'setup') {
            return (await verifyForeignPodAccess(session, target.podUrl)) ? 'open' : 'refused'
        }
        await getSolidDataset(target.listUrl, { fetch: session.fetch })
        return 'open'
    } catch (err) {
        return isAuthenticationError(err) ? 'refused' : 'open'
    }
}
