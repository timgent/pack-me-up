import { useEffect, useRef, useState } from 'react'
import { Outlet, useParams, Navigate, useSearchParams } from 'react-router-dom'
import { ForeignPodContext } from './ForeignPodContext'
import { SharedAccessHelp } from './SharedAccessHelp'
import { ForeignPodBanner } from './ForeignPodBanner'
import { useSolidPod } from './SolidPodContext'
import { useDatabase } from './DatabaseContext'
import {
    verifyForeignPodAccess,
    saveRdfToPod,
    POD_CONTAINERS,
    getPrimaryPodUrl,
    getPodOwnerName,
    friendlyPodName,
} from '../services/solidPod'
import { sharedWithMeToDataset } from '../services/rdfSerialization'
import type { SharedWithMeList } from '../services/rdfSerialization'

export function ForeignPodLayout() {
    const { encodedPodUrl } = useParams<{ encodedPodUrl: string }>()
    const foreignPodUrl = decodeURIComponent(encodedPodUrl ?? '')
    const [searchParams] = useSearchParams()
    const ownerWebIdFromUrl = searchParams.get('owner') ?? undefined
    const { isLoggedIn, session, webId } = useSolidPod()
    const { db } = useDatabase()
    const [accessState, setAccessState] = useState<'pending' | 'ok' | 'denied'>('pending')
    const [ownerName, setOwnerName] = useState<string | null>(null)
    const [resolvedWebId, setResolvedWebId] = useState<string | undefined>(ownerWebIdFromUrl)
    const storedRef = useRef(false)

    useEffect(() => {
        if (!foreignPodUrl || !isLoggedIn || !session) return

        async function verifyAndStore() {
            const hasAccess = await verifyForeignPodAccess(session!, foreignPodUrl)
            if (!hasAccess) {
                setAccessState('denied')
                return
            }
            setAccessState('ok')

            if (storedRef.current) return
            storedRef.current = true

            try {
                let list: SharedWithMeList
                try {
                    list = await db.getSharedWithMe()
                } catch {
                    list = { contexts: [], lastModified: new Date().toISOString() }
                }

                const existing = list.contexts.find(c => c.podUrl === foreignPodUrl)
                const webId = ownerWebIdFromUrl ?? existing?.webId
                setResolvedWebId(webId)

                const name = await getPodOwnerName(session!, foreignPodUrl, webId)
                setOwnerName(name)

                // An entry recorded by accepting an invite is waiting until it
                // first opens — which is now. Clearing it is what lets a later
                // refusal read as revoked rather than as still waiting.
                const needsUpdate = !existing || (webId && !existing.webId) || (name && !existing.label) || existing.awaitingAccess
                if (!needsUpdate) return

                const updated: SharedWithMeList = {
                    contexts: existing
                        ? list.contexts.map(c => {
                            if (c.podUrl !== foreignPodUrl) return c
                            const { awaitingAccess: _opened, ...rest } = c
                            return { ...rest, ...(webId ? { webId } : {}), ...(name ? { label: name } : {}) }
                        })
                        : [...list.contexts, {
                            podUrl: foreignPodUrl,
                            addedAt: new Date().toISOString(),
                            ...(webId ? { webId } : {}),
                            ...(name ? { label: name } : {}),
                        }],
                    lastModified: new Date().toISOString(),
                }
                await db.saveSharedWithMe(updated)

                const ownPodUrl = await getPrimaryPodUrl(session!)
                if (ownPodUrl) {
                    await saveRdfToPod({
                        session: session!,
                        fileUrl: `${ownPodUrl}${POD_CONTAINERS.SHARED_WITH_ME}`,
                        data: updated,
                        serializer: sharedWithMeToDataset,
                    })
                }
            } catch (err) {
                console.error('ForeignPodLayout: failed to store shared context', err)
            }
        }

        verifyAndStore().catch(err => {
            console.error('ForeignPodLayout: unexpected error', err)
            setAccessState('denied')
        })
    }, [foreignPodUrl, isLoggedIn, session, db])

    if (!foreignPodUrl) return <Navigate to="/view-lists" replace />

    // Both of these used to be sentences with nothing to do next — see
    // SharedAccessHelp, which is where following a shared link now lands when
    // the link cannot be opened.
    if (!isLoggedIn) {
        return <SharedAccessHelp what="lists" isLoggedIn={false} webId={null} />
    }

    if (accessState === 'denied') {
        return <SharedAccessHelp what="lists" isLoggedIn webId={webId} />
    }

    if (accessState === 'pending') {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <p className="text-gray-500 dark:text-gray-400">Verifying access…</p>
            </div>
        )
    }

    return (
        <ForeignPodContext.Provider value={{ foreignPodUrl }}>
            <ForeignPodBanner
                podUrl={foreignPodUrl}
                ownerName={ownerName ?? (resolvedWebId ? friendlyPodName(resolvedWebId) : null) ?? friendlyPodName(foreignPodUrl)}
            />
            <Outlet />
        </ForeignPodContext.Provider>
    )
}
