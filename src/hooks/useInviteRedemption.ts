import { useEffect, useRef, useState } from 'react'
import { useSolidPod } from '../components/SolidPodContext'
import { useToast } from '../components/ToastContext'
import { reportError } from '../errorReporting'
import { deleteInvite, listInvites, type StoredInvite } from '../services/invites'
import {
    POD_CONTAINERS,
    getPrimaryPodUrl,
    grantCollaboratorAccess,
    grantFullCollaboratorAccess,
} from '../services/solidPod'

export interface RedeemedInvite {
    invite: StoredInvite
    webIds: string[]
}

/**
 * The other half of an invite link: turning an acceptance into actual access.
 *
 * Nothing can grant on the inviter's behalf while she is away — there is no
 * server here, and her Pod credentials live in her browser — so an acceptance
 * waits on the Pod until her client next runs. This is that moment. It is the
 * one real cost of the whole design, and the UI says so on both ends rather
 * than pretending otherwise.
 *
 * What it will not do is trust the acceptance. The appended WebID is whatever
 * a stranger wrote; the *invite* it was appended to is the inviter's own
 * record of what she offered, and that is what decides what gets granted. So a
 * WebID on a list invite can only ever reach that list, whatever else is
 * written beside it.
 */
export function useInviteRedemption(): { redeemed: RedeemedInvite[] } {
    const { session, isLoggedIn } = useSolidPod()
    const { showToast } = useToast()
    const [redeemed, setRedeemed] = useState<RedeemedInvite[]>([])
    // Once per sign-in: an acceptance left on the Pod is picked up next time,
    // and re-reading the container on every render would be pointless traffic.
    const doneFor = useRef<string | null>(null)

    const webId = session?.info.webId

    useEffect(() => {
        if (!isLoggedIn || !session || !webId) return
        if (doneFor.current === webId) return
        doneFor.current = webId

        let cancelled = false

        async function redeemAll() {
            const podUrl = await getPrimaryPodUrl(session!)
            if (!podUrl || cancelled) return

            const invites = await listInvites(session!, podUrl)
            const waiting = invites.filter(invite => invite.acceptedBy.length > 0)
            if (waiting.length === 0 || cancelled) return

            const done: RedeemedInvite[] = []
            for (const invite of waiting) {
                // A 'list' invite with no list named is not something to guess
                // at — "grant something else instead" would be the worst
                // possible reading of it.
                if (invite.kind === 'list' && !invite.listId) continue

                try {
                    for (const accepter of invite.acceptedBy) {
                        if (invite.kind === 'full-setup') {
                            await grantFullCollaboratorAccess(session!, podUrl, accepter)
                        } else {
                            const listUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}${invite.listId}.ttl`
                            await grantCollaboratorAccess(session!, listUrl, accepter)
                        }
                    }
                    // Only once every grant landed. Deleting after a failure
                    // would lose the acceptance for good: the person who
                    // accepted has no way to tell, and no way to do it again.
                    await deleteInvite(session!, invite.url)
                    done.push({ invite, webIds: invite.acceptedBy })
                } catch (err) {
                    reportError(err, 'useInviteRedemption: failed to grant access for an accepted invite')
                }
            }

            if (cancelled || done.length === 0) return
            setRedeemed(done)

            const names = done.flatMap(entry => entry.webIds).length
            showToast(
                names === 1
                    ? 'Someone accepted your invite — they have access now'
                    : `${names} people accepted your invites — they have access now`,
                'success',
            )
        }

        redeemAll().catch(err => {
            // An unreachable Pod is normal rather than exceptional, and there
            // is nothing for the user to do about it: the acceptance is still
            // sitting on the Pod for next time. Recorded, not announced.
            reportError(err, 'useInviteRedemption: could not check for accepted invites')
        })

        return () => { cancelled = true }
    }, [isLoggedIn, session, webId, showToast])

    return { redeemed }
}
