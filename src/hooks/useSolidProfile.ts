import { useEffect, useState } from 'react'
import { getSolidProfile, type SolidProfile } from '../services/solidPod'
import type { AppSession } from '../types/AppSession'

const UNREAD: SolidProfile = { name: null, photo: null }

/**
 * One WebID's profile card — their name, and their photo.
 *
 * The fetch is `getSolidProfile`, which is the same cached, deduped path the
 * person avatars go through (see `usePersonPhotos`). So the nav asking for the
 * signed-in user's card costs nothing when a packing list has already drawn
 * them, and the app reads any one card once however many components want it.
 *
 * No abort on unmount, for the same reason: the request belongs to the cache,
 * not to this component, and cancelling it would take it away from whoever else
 * is waiting. Unmounting only stops us writing state.
 */
export function useSolidProfile(
    webId: string | undefined,
    session: AppSession | null | undefined,
): SolidProfile {
    const [profile, setProfile] = useState<SolidProfile>(UNREAD)

    useEffect(() => {
        if (!webId) {
            setProfile(UNREAD)
            return
        }
        let cancelled = false
        // Reset first: a different WebID must not wear the last one's face
        // while its own card is still in flight.
        setProfile(UNREAD)
        getSolidProfile(session, webId)
            .then(p => { if (!cancelled) setProfile(p) })
            .catch(() => { /* unreadable card: the caller's fallback stands */ })
        return () => { cancelled = true }
    }, [webId, session])

    return profile
}
