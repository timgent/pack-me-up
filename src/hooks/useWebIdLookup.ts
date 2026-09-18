import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { getSolidProfile, type SolidProfile } from '../services/solidPod'
import { normaliseWebIdInput } from '../services/webIdInput'
import type { AppSession } from '../types/AppSession'

/**
 * What we can say about the address in a "share with…" field.
 *
 * `unknown` is deliberately not a failure. A profile card can be unreadable
 * because the address is wrong, and it can be unreadable because the server is
 * down, the card is private, or the person simply never published one — and
 * from here those look identical. So `unknown` warns and lets the share
 * proceed; only `invalid` (not a web address at all) has nothing to grant to.
 */
export type WebIdLookupStatus = 'empty' | 'invalid' | 'checking' | 'found' | 'unknown'

export interface WebIdLookup {
    /** The WebID to actually grant access to, or null when there isn't one. */
    webId: string | null
    status: WebIdLookupStatus
    /** Their name and photo when the card was readable — for showing who this is. */
    profile: SolidProfile
}

const UNRESOLVED: SolidProfile = { name: null, photo: null, resolved: false }

/** Long enough that typing an address does not fire a request per keystroke. */
const SETTLE_MS = 500

/**
 * Turns what someone typed into a WebID, and then into an answer to the only
 * question that matters before granting access: is anybody there?
 *
 * Granting to an address nobody answers at is silent — WAC records the agent
 * without complaint, the sharer gets a link and a success message, and the
 * person on the other end sees nothing ever. This hook exists so the field can
 * say "✓ Bob Smith" first.
 *
 * The normalised WebID is returned straight away, before any lookup, because
 * the caller needs it to enable its Share button; only the confirmation waits.
 */
export function useWebIdLookup(raw: string, session: AppSession | null | undefined): WebIdLookup {
    const webId = useMemo(() => normaliseWebIdInput(raw), [raw])
    const [settledWebId] = useDebounce(webId, SETTLE_MS)
    const [answer, setAnswer] = useState<{ webId: string; profile: SolidProfile } | null>(null)

    useEffect(() => {
        if (!settledWebId) return
        let cancelled = false
        getSolidProfile(session, settledWebId)
            .then(profile => { if (!cancelled) setAnswer({ webId: settledWebId, profile }) })
            .catch(() => { if (!cancelled) setAnswer({ webId: settledWebId, profile: UNRESOLVED }) })
        return () => { cancelled = true }
    }, [settledWebId, session])

    // An answer only counts for the address it was asked about. Without this,
    // editing a confirmed address leaves the previous person's tick on screen
    // while the new one is still unchecked.
    const profile = answer && answer.webId === webId ? answer.profile : null

    const status: WebIdLookupStatus =
        raw.trim() === '' ? 'empty'
            : webId === null ? 'invalid'
                : profile === null ? 'checking'
                    : profile.resolved ? 'found'
                        : 'unknown'

    return { webId, status, profile: profile ?? UNRESOLVED }
}
