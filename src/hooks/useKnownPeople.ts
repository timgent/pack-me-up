import { useEffect, useState } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { useSolidPod } from '../components/SolidPodContext'
import { friendlyWebIdName } from '../services/solidPod'
import { normaliseWebIdInput } from '../services/webIdInput'

export interface KnownPerson {
    /** Normalised, so the same person from two sources is one entry. */
    webId: string
    name: string
}

/**
 * Everyone this device already knows an address for.
 *
 * The share fields ask for a WebID, and the second time you share with someone
 * that is a question the app can already answer: it is holding their address in
 * three places and was asking anyway.
 *
 * - the people in your question set, who are who you pack with;
 * - whoever shared their whole setup with you, from `shared-with-me`;
 * - whoever shared one list with you, from `shared-lists-with-me`.
 *
 * All three are local reads, so the suggestions are there before any network
 * is. Names come from what is already stored — the name you gave a person, the
 * pod owner's name recorded when you accepted their invite — and never from a
 * profile fetch, because a row of chips is not worth a request per chip.
 *
 * Addresses are normalised on the way in, which is what makes the deduplication
 * work: a Pod root typed into the People editor and a full WebID recorded from
 * a share are the same person, and offering both is worse than offering one.
 */
export function useKnownPeople(enabled: boolean = true): KnownPerson[] {
    const { db } = useDatabase()
    const { session } = useSolidPod()
    const ownWebId = session?.info.webId
    const [people, setPeople] = useState<KnownPerson[]>([])

    useEffect(() => {
        // Three documents is three reads, and nobody viewing a packing list is
        // owed them — only somebody who has opened a share dialog is. The
        // caller says when that is.
        if (!enabled) return
        let cancelled = false

        // Each source is optional: a fresh device has none of these documents,
        // and a missing one is a normal outcome rather than a failure.
        Promise.all([
            db.getQuestionSet().then(set => set.people ?? []).catch(() => []),
            db.getSharedWithMe().then(shared => shared.contexts ?? []).catch(() => []),
            db.getSharedListsWithMe().then(shared => shared.lists ?? []).catch(() => []),
        ]).then(([questionSetPeople, sharedContexts, sharedLists]) => {
            if (cancelled) return

            // Insertion order is the priority order: the name you gave someone
            // beats the one their pod publishes, which beats their address.
            // You are not somebody you can share with, and the wizard makes
            // you the first person in your own question set — so without this
            // the row opened with a chip called "Me".
            const own = ownWebId ? normaliseWebIdInput(ownWebId) : null

            const byWebId = new Map<string, KnownPerson>()
            const add = (rawWebId: string | undefined | null, name: string | null) => {
                if (!rawWebId) return
                const webId = normaliseWebIdInput(rawWebId)
                if (!webId || webId === own || byWebId.has(webId)) return
                byWebId.set(webId, { webId, name: name?.trim() || friendlyWebIdName(webId) })
            }

            for (const person of questionSetPeople) {
                if (person.deletedAt) continue
                add(person.webId, person.name)
            }
            for (const context of sharedContexts) {
                add(context.webId, context.label ?? null)
            }
            for (const list of sharedLists) {
                // `label` here is the list's name, not the owner's, so there is
                // nothing better than the address to go on.
                add(list.ownerWebId, null)
            }

            setPeople([...byWebId.values()])
        })

        return () => { cancelled = true }
    }, [db, enabled, ownWebId])

    return people
}
