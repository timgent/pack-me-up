import { useCallback, useEffect, useRef, useState } from 'react'
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
export function useInviteRedemption(): { redeemed: RedeemedInvite[]; redeemNow: () => Promise<number> } {
    const { session, isLoggedIn } = useSolidPod()
    const { showToast } = useToast()
    // Every redemption this app run, appended: pages re-read when its length
    // moves, so a second redemption has to move it again.
    const [redeemed, setRedeemed] = useState<RedeemedInvite[]>([])
    // Once per sign-in on its own: an acceptance left on the Pod is picked up
    // next time, and re-reading the container on every render would be
    // pointless traffic. Anything more frequent is asked for (`redeemNow`).
    const doneFor = useRef<string | null>(null)
    // One check at a time. A poll that lands while one is still running
    // shares its answer rather than granting the same acceptance twice.
    const running = useRef<Promise<number> | null>(null)
    const mounted = useRef(true)
    useEffect(() => () => { mounted.current = false }, [])

    const signedIn = isLoggedIn ? session : null
    const sessionRef = useRef(signedIn)
    sessionRef.current = signedIn

    const webId = session?.info.webId

    /** Grants every accepted invite on the Pod; resolves to how many. Throws if the Pod cannot be read. */
    const check = useCallback((): Promise<number> => {
        const current = sessionRef.current
        if (!current?.info.webId) return Promise.resolve(0)
        if (running.current) return running.current

        running.current = (async () => {
            const podUrl = await getPrimaryPodUrl(current)
            if (!podUrl) return 0

            const invites = await listInvites(current, podUrl)
            const waiting = invites.filter(invite => invite.acceptedBy.length > 0)
            if (waiting.length === 0) return 0

            const done: RedeemedInvite[] = []
            for (const invite of waiting) {
                // A 'list' invite with no list named is not something to guess
                // at — "grant something else instead" would be the worst
                // possible reading of it.
                if (invite.kind === 'list' && !invite.listId) continue

                try {
                    for (const accepter of invite.acceptedBy) {
                        if (invite.kind === 'full-setup') {
                            await grantFullCollaboratorAccess(current, podUrl, accepter)
                        } else {
                            const listUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}${invite.listId}.ttl`
                            await grantCollaboratorAccess(current, listUrl, accepter)
                        }
                    }
                    // Only once every grant landed. Deleting after a failure
                    // would lose the acceptance for good: the person who
                    // accepted has no way to tell, and no way to do it again.
                    await deleteInvite(current, invite.url)
                    done.push({ invite, webIds: invite.acceptedBy })
                } catch (err) {
                    reportError(err, 'useInviteRedemption: failed to grant access for an accepted invite')
                }
            }

            if (!mounted.current || done.length === 0) return done.length
            setRedeemed(prev => [...prev, ...done])

            const names = done.flatMap(entry => entry.webIds).length
            showToast(
                names === 1
                    ? 'Someone accepted your invite — they have access now'
                    : `${names} people accepted your invites — they have access now`,
                'success',
            )
            return done.length
        })().finally(() => { running.current = null })

        return running.current
    }, [showToast])

    useEffect(() => {
        if (!isLoggedIn || !session || !webId) return
        if (doneFor.current === webId) return
        doneFor.current = webId

        check().catch(err => {
            // An unreachable Pod is normal rather than exceptional, and there
            // is nothing for the user to do about it: the acceptance is still
            // sitting on the Pod for next time. Recorded, not announced.
            reportError(err, 'useInviteRedemption: could not check for accepted invites')
        })
    }, [isLoggedIn, session, webId, check])

    /**
     * Checks now, for a page waiting on somebody to accept. Never throws: a
     * poll that cannot reach the Pod has nothing to report, and reporting it
     * every few seconds would bury real errors.
     */
    const redeemNow = useCallback(() => check().catch(() => 0), [check])

    return { redeemed, redeemNow }
}
