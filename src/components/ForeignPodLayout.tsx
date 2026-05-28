import { useEffect, useRef, useState } from 'react'
import { Outlet, useParams, Navigate, useSearchParams } from 'react-router-dom'
import { ForeignPodContext } from './ForeignPodContext'
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
    const { isLoggedIn, session } = useSolidPod()
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

                const needsUpdate = !existing || (webId && !existing.webId) || (name && !existing.label)
                if (!needsUpdate) return

                const updated: SharedWithMeList = {
                    contexts: existing
                        ? list.contexts.map(c => c.podUrl === foreignPodUrl
                            ? { ...c, ...(webId ? { webId } : {}), ...(name ? { label: name } : {}) }
                            : c)
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

    if (!isLoggedIn) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <p className="text-gray-700">Please log in to view shared content.</p>
            </div>
        )
    }

    if (accessState === 'denied') {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <p className="text-red-700">Access denied to this pod. The owner may have revoked access.</p>
            </div>
        )
    }

    if (accessState === 'pending') {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <p className="text-gray-500">Verifying access…</p>
            </div>
        )
    }

    return (
        <ForeignPodContext.Provider value={{ foreignPodUrl }}>
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-800 -mx-4 -mt-8 mb-6">
                Viewing <span className="font-semibold" title={foreignPodUrl}>{ownerName ?? (resolvedWebId ? friendlyPodName(resolvedWebId) : null) ?? friendlyPodName(foreignPodUrl)}</span>'s data
            </div>
            <Outlet />
        </ForeignPodContext.Provider>
    )
}
