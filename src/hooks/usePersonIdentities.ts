import { useEffect, useMemo, useRef, useState } from 'react'
import type { ColorablePerson } from '../edit-questions/person-colors'
import {
    buildPersonIdentityLookup,
    type PersonIdentityLookup,
    type PhotoLookup,
} from '../edit-questions/person-identity'
import type { Person } from '../edit-questions/types'
import type { PackingAppDatabase } from '../services/database'
import { getSolidProfile } from '../services/solidPod'
import type { AppSession } from '../types/AppSession'

export type { PersonIdentityLookup } from '../edit-questions/person-identity'

const NO_ONE: readonly ColorablePerson[] = []
const NO_PHOTOS: PhotoLookup = () => undefined

/**
 * The photos of everyone in `webIds`, as they arrive.
 *
 * Keyed by WebID, which is the only key that cannot go stale: it identifies one
 * profile, so two people called Sam cannot share an entry, renaming somebody
 * cannot orphan one, and removing them leaves nothing pointing at theirs.
 *
 * The fetch itself is shared and cached by `getSolidProfile`, so nothing here
 * needs to dedupe, and a component mounting for the second time costs nothing.
 * Which is also why there is no abort on unmount: the request belongs to the
 * cache, not to this component, and cancelling it would take it away from
 * whoever else is waiting. Unmounting only stops us writing state.
 */
export function usePersonPhotos(people: readonly Person[], session: AppSession | null | undefined): PhotoLookup {
    const webIds = useMemo(
        () => people.filter(person => !person.deletedAt && person.webId).map(person => person.webId!),
        [people],
    )
    return usePhotosByWebId(webIds, session)
}

function usePhotosByWebId(webIds: readonly string[], session: AppSession | null | undefined): PhotoLookup {
    const [photos, setPhotos] = useState<Record<string, string>>({})
    // Who to look up, not the identity of the array holding them.
    const key = [...new Set(webIds)].sort().join(' ')

    useEffect(() => {
        // No session is not a reason to skip: profile cards are public, and
        // `getSolidProfile` reads them unauthenticated when there is none.
        if (key === '') return
        let cancelled = false
        for (const webId of key.split(' ')) {
            getSolidProfile(session, webId)
                .then(profile => {
                    if (cancelled || !profile.photo) return
                    setPhotos(prev => prev[webId] === profile.photo ? prev : { ...prev, [webId]: profile.photo! })
                })
                .catch(() => { /* no photo: the initial stands */ })
        }
        return () => { cancelled = true }
    }, [key, session])

    return useMemo(() => (webId: string) => photos[webId], [photos])
}

/**
 * How to draw the people a packing list mentions: the colours and emoji set on
 * the questions page, plus their Solid profile photos, read live.
 *
 * Live rather than copied onto each list at generation, for the same reason the
 * section order is (see `useSectionOrder`) — how a person looks is a statement
 * about that person, not about one trip. Recolouring someone should reach the
 * list already open in front of you, not just the next one you make.
 *
 * `alsoOnThisList` is everyone the list names who isn't in the question set:
 * guests, and the whole cast of a list shared from someone else's pod. They get
 * whatever colours are left over, so no two people on one list collide.
 */
export function usePersonIdentities(
    db: PackingAppDatabase | undefined,
    alsoOnThisList: readonly ColorablePerson[] = NO_ONE,
    session?: AppSession | null,
): PersonIdentityLookup {
    const [people, setPeople] = useState<Person[]>([])

    useEffect(() => {
        if (!db) return
        let cancelled = false
        Promise.resolve()
            .then(() => db.getQuestionSet())
            .then(questionSet => {
                if (cancelled) return
                setPeople(questionSet?.people ?? [])
            })
            .catch(() => { /* nobody known: everyone is drawn as a stranger */ })
        return () => { cancelled = true }
    }, [db])

    const photoFor = usePersonPhotos(people, session)

    // Who is on the list, not the identity of the array holding them — the
    // callers build it fresh whenever an item changes.
    const rosterKey = alsoOnThisList.map(p => `${p.id ?? ''}${p.name}`).join('')
    const rosterRef = useRef(alsoOnThisList)
    rosterRef.current = alsoOnThisList

    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosterKey stands in for alsoOnThisList
    return useMemo(() => buildPersonIdentityLookup(people, rosterRef.current, photoFor), [people, rosterKey, photoFor])
}

/** The identity lookup for a component that has no database to read — tests, and previews. */
export const NO_IDENTITIES: PersonIdentityLookup = buildPersonIdentityLookup([], [], NO_PHOTOS)
