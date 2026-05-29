import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { useToast } from '../components/ToastContext'
import {
    grantFullCollaboratorAccess,
    revokeFullCollaboratorAccess,
    getFullCollaborators,
    getPrimaryPodUrl,
    getPodOwnerName,
    friendlyPodName,
    saveRdfToPod,
    POD_CONTAINERS,
    getCollaborators,
    isPubliclyAccessible,
} from '../services/solidPod'
import { sharedWithMeToDataset, sharedListsWithMeToDataset } from '../services/rdfSerialization'
import type { SharedContext, SharedListContext, SharedListsWithMe } from '../services/rdfSerialization'
import { SharePackingListModal } from '../components/SharePackingListModal'
import type { PackingList } from '../create-packing-list/types'

type ListSharingStatus = { collaborators: string[]; isPublic: boolean } | 'loading' | 'error'

export function SharingSettingsPage() {
    const { session, isLoggedIn } = useSolidPod()
    const { db } = useDatabase()
    const { showToast } = useToast()
    const navigate = useNavigate()

    const [ownPodUrl, setOwnPodUrl] = useState<string | null>(null)
    const [collaboratorWebId, setCollaboratorWebId] = useState('')
    const [isGranting, setIsGranting] = useState(false)
    const [inviteLink, setInviteLink] = useState<string | null>(null)
    const [collaborators, setCollaborators] = useState<string[]>([])
    const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false)
    const [revokingWebId, setRevokingWebId] = useState<string | null>(null)
    const [sharedContexts, setSharedContexts] = useState<SharedContext[]>([])
    const [podNames, setPodNames] = useState<Record<string, string>>({})
    const [removingPodUrl, setRemovingPodUrl] = useState<string | null>(null)

    // Section 3: individual lists shared with me
    const [sharedLists, setSharedLists] = useState<SharedListContext[]>([])
    const [removingListId, setRemovingListId] = useState<string | null>(null)

    // Section 4: individual lists I've shared
    const [ownLists, setOwnLists] = useState<PackingList[]>([])
    const [sharingStatusByListId, setSharingStatusByListId] = useState<Record<string, ListSharingStatus>>({})
    const [managingList, setManagingList] = useState<{ fileUrl: string; listId: string } | null>(null)

    useEffect(() => {
        if (!isLoggedIn || !session) return
        getPrimaryPodUrl(session).then(url => setOwnPodUrl(url ?? null))
    }, [isLoggedIn, session])

    const loadCollaborators = useCallback(async () => {
        if (!session || !ownPodUrl) return
        setIsLoadingCollaborators(true)
        try {
            const list = await getFullCollaborators(session, ownPodUrl)
            setCollaborators(list)
        } catch (err) {
            console.error('SharingSettingsPage: failed to load collaborators', err)
        } finally {
            setIsLoadingCollaborators(false)
        }
    }, [session, ownPodUrl])

    useEffect(() => {
        if (ownPodUrl) loadCollaborators()
    }, [ownPodUrl, loadCollaborators])

    useEffect(() => {
        db.getSharedWithMe()
            .then(swm => setSharedContexts(swm.contexts))
            .catch(() => setSharedContexts([]))
    }, [db])

    useEffect(() => {
        if (!session || sharedContexts.length === 0) return
        const unlabeled = sharedContexts.filter(c => !c.label)
        if (unlabeled.length === 0) return
        Promise.all(unlabeled.map(c => getPodOwnerName(session, c.podUrl, c.webId).then(n => [c.podUrl, n] as const)))
            .then(results => {
                const names: Record<string, string> = {}
                for (const [podUrl, name] of results) {
                    if (name) names[podUrl] = name
                }
                setPodNames(names)
            })
    }, [sharedContexts, session])

    // Load "lists shared with me"
    useEffect(() => {
        db.getSharedListsWithMe()
            .then(slwm => setSharedLists(slwm.lists))
            .catch(() => setSharedLists([]))
    }, [db])

    // Load own lists + sharing status for section 4
    // Re-runs when sharedLists is loaded so we can exclude foreign lists
    useEffect(() => {
        if (!isLoggedIn || !ownPodUrl || !session) return
        const sharedListIds = new Set(sharedLists.map(l => l.listId))
        db.getAllPackingLists().then(lists => {
            const ownOnly = lists.filter(l => !sharedListIds.has(l.id))
            setOwnLists(ownOnly)
            const initialStatus: Record<string, ListSharingStatus> = {}
            for (const list of ownOnly) initialStatus[list.id] = 'loading'
            setSharingStatusByListId(initialStatus)

            for (const list of ownOnly) {
                const fileUrl = `${ownPodUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`
                Promise.all([
                    getCollaborators(session, fileUrl),
                    isPubliclyAccessible(session, fileUrl),
                ])
                    .then(([col, pub]) => {
                        setSharingStatusByListId(prev => ({
                            ...prev,
                            [list.id]: { collaborators: col, isPublic: pub },
                        }))
                    })
                    .catch(() => {
                        setSharingStatusByListId(prev => ({ ...prev, [list.id]: 'error' }))
                    })
            }
        }).catch(() => {})
    }, [isLoggedIn, ownPodUrl, session, db, sharedLists])

    const handleGrantAccess = async () => {
        if (!session || !ownPodUrl || !collaboratorWebId.trim()) return
        setIsGranting(true)
        setInviteLink(null)
        try {
            await grantFullCollaboratorAccess(session, ownPodUrl, collaboratorWebId.trim())
            const ownerWebId = session?.info.webId
            const ownerParam = ownerWebId ? `?owner=${encodeURIComponent(ownerWebId)}` : ''
            const link = `${window.location.origin}/#/pod/${encodeURIComponent(ownPodUrl)}/view-lists${ownerParam}`
            setInviteLink(link)
            setCollaboratorWebId('')
            await loadCollaborators()
            showToast('Access granted successfully', 'success')
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('SharingSettingsPage: failed to grant access', err)
            showToast(`Failed to grant access: ${msg}`, 'error')
        } finally {
            setIsGranting(false)
        }
    }

    const handleRemoveSharedContext = async (podUrl: string) => {
        setRemovingPodUrl(podUrl)
        try {
            const list = await db.getSharedWithMe()
            const updated = {
                contexts: list.contexts.filter(c => c.podUrl !== podUrl),
                lastModified: new Date().toISOString(),
            }
            await db.saveSharedWithMe(updated)
            setSharedContexts(updated.contexts)
            const ownPodUrl = await getPrimaryPodUrl(session!)
            if (ownPodUrl) {
                await saveRdfToPod({
                    session: session!,
                    fileUrl: `${ownPodUrl}${POD_CONTAINERS.SHARED_WITH_ME}`,
                    data: updated,
                    serializer: sharedWithMeToDataset,
                })
            }
            showToast('Removed', 'success')
        } catch (err) {
            console.error('SharingSettingsPage: failed to remove shared context', err)
            showToast('Failed to remove. Please try again.', 'error')
        } finally {
            setRemovingPodUrl(null)
        }
    }

    const handleRevoke = async (webId: string) => {
        if (!session || !ownPodUrl) return
        setRevokingWebId(webId)
        try {
            await revokeFullCollaboratorAccess(session, ownPodUrl, webId)
            await loadCollaborators()
            showToast('Access revoked', 'success')
        } catch (err) {
            console.error('SharingSettingsPage: failed to revoke access', err)
            showToast('Failed to revoke access. Please try again.', 'error')
        } finally {
            setRevokingWebId(null)
        }
    }

    const handleRemoveSharedList = async (listId: string) => {
        setRemovingListId(listId)
        try {
            let existing: SharedListsWithMe = { lists: [], lastModified: new Date().toISOString() }
            try { existing = await db.getSharedListsWithMe() } catch { /* not_found = ok */ }
            const updated: SharedListsWithMe = {
                lists: existing.lists.filter(l => l.listId !== listId),
                lastModified: new Date().toISOString(),
            }
            await db.saveSharedListsWithMe(updated)
            setSharedLists(updated.lists)
            if (session && ownPodUrl) {
                await saveRdfToPod({
                    session,
                    fileUrl: `${ownPodUrl}${POD_CONTAINERS.SHARED_LISTS_WITH_ME}`,
                    data: updated,
                    serializer: sharedListsWithMeToDataset,
                })
            }
            showToast('Removed', 'success')
        } catch (err) {
            console.error('SharingSettingsPage: failed to remove shared list', err)
            showToast('Failed to remove. Please try again.', 'error')
        } finally {
            setRemovingListId(null)
        }
    }

    if (!isLoggedIn) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4">
                <p className="text-gray-700">Please log in to manage sharing settings.</p>
            </div>
        )
    }

    const sharedOwnLists = ownLists.filter(list => {
        const status = sharingStatusByListId[list.id]
        if (typeof status !== 'object' || status === null) return false
        return status.isPublic || status.collaborators.length > 0
    })

    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-10">
            <div>
                <h1 className="text-3xl font-bold text-primary-900">Sharing Settings</h1>
            </div>

            {/* Section 1: Grant access to others */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">People who can access my data</h2>
                <p className="text-sm text-gray-600">
                    Grant someone access to all your packing lists and questions. They'll be able to view
                    and edit your data.
                </p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={collaboratorWebId}
                        onChange={e => setCollaboratorWebId(e.target.value)}
                        placeholder="Collaborator WebID (e.g. https://alice.solidcommunity.net/profile/card#me)"
                        aria-label="Collaborator WebID"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                        onClick={handleGrantAccess}
                        disabled={isGranting || !collaboratorWebId.trim()}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                        {isGranting ? 'Granting…' : 'Grant access'}
                    </button>
                </div>

                {inviteLink && (
                    <div className="mt-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Invite link</label>
                        <input
                            type="text"
                            readOnly
                            value={inviteLink}
                            aria-label="Invite link"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none"
                            onClick={e => (e.target as HTMLInputElement).select()}
                        />
                        <p className="text-xs text-gray-500 mt-1">Share this link with your collaborator.</p>
                    </div>
                )}

                {isLoadingCollaborators ? (
                    <p className="text-sm text-gray-500">Loading collaborators…</p>
                ) : collaborators.length > 0 ? (
                    <ul className="space-y-2 mt-2">
                        {collaborators.map(webId => (
                            <li key={webId} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                <span className="text-sm text-gray-800 truncate flex-1" title={webId}>{webId}</span>
                                <button
                                    onClick={() => handleRevoke(webId)}
                                    disabled={revokingWebId === webId}
                                    aria-label={`Revoke access for ${webId}`}
                                    className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                                >
                                    {revokingWebId === webId ? 'Revoking…' : 'Revoke'}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">No collaborators yet.</p>
                )}
            </section>

            {/* Section 2: Pods shared with me */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Data shared with me</h2>
                {sharedContexts.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No shared pods yet. Visit an invite link to add one.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {sharedContexts.map(ctx => (
                            <li key={ctx.podUrl} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                <span className="text-sm text-gray-800 truncate flex-1" title={ctx.podUrl}>
                                    {ctx.label ?? podNames[ctx.podUrl] ?? (ctx.webId ? friendlyPodName(ctx.webId) : undefined) ?? friendlyPodName(ctx.podUrl)}
                                </span>
                                <button
                                    onClick={() => navigate(`/pod/${encodeURIComponent(ctx.podUrl)}/view-lists`)}
                                    className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors"
                                >
                                    Open
                                </button>
                                <button
                                    onClick={() => handleRemoveSharedContext(ctx.podUrl)}
                                    disabled={removingPodUrl === ctx.podUrl}
                                    aria-label={`Remove shared pod`}
                                    className="ml-2 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                                >
                                    {removingPodUrl === ctx.podUrl ? 'Removing…' : 'Remove'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Section 3: Individual lists shared with me */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Individual lists shared with me</h2>
                {sharedLists.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No individual lists yet. When someone shares a list link with you and you save it, it will appear here.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {sharedLists.map(ctx => (
                            <li key={`${ctx.listId}-${ctx.podUrl}`} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-800 truncate">
                                        {ctx.label ?? ctx.listId}
                                    </span>
                                    <span className="text-xs text-gray-500 truncate" title={ctx.podUrl}>
                                        {friendlyPodName(ctx.podUrl)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => navigate(`/view-lists/${ctx.listId}?pod=${encodeURIComponent(ctx.podUrl)}`)}
                                    className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors"
                                >
                                    Open
                                </button>
                                <button
                                    onClick={() => handleRemoveSharedList(ctx.listId)}
                                    disabled={removingListId === ctx.listId}
                                    aria-label={`Remove shared list ${ctx.label ?? ctx.listId}`}
                                    className="ml-2 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                                >
                                    {removingListId === ctx.listId ? 'Removing…' : 'Remove'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Section 4: Individual lists I've shared */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Individual lists I've shared</h2>
                <p className="text-sm text-gray-600">
                    Lists you've shared with specific people or publicly. Use "Manage sharing" to update access.
                </p>
                {ownLists.length === 0 ? (
                    <p className="text-sm text-gray-500">No packing lists yet.</p>
                ) : sharedOwnLists.length === 0 && Object.values(sharingStatusByListId).every(s => s !== 'loading') ? (
                    <p className="text-sm text-gray-500">You haven't shared any individual lists yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {ownLists
                            .filter(list => {
                                const status = sharingStatusByListId[list.id]
                                if (status === 'loading') return true
                                if (typeof status !== 'object' || status === null) return false
                                return status.isPublic || status.collaborators.length > 0
                            })
                            .map(list => {
                                const status = sharingStatusByListId[list.id]
                                return (
                                    <li key={list.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="text-sm font-medium text-gray-800 truncate">✈️ {list.name}</span>
                                            <span className="text-xs text-gray-500">
                                                {status === 'loading' ? 'Loading sharing info…' :
                                                    status === 'error' ? 'Could not load sharing info' :
                                                    [
                                                        status.isPublic ? '🌐 Public' : null,
                                                        status.collaborators.length > 0 ? `👤 ${status.collaborators.length} person${status.collaborators.length > 1 ? 's' : ''}` : null,
                                                    ].filter(Boolean).join(' · ')}
                                            </span>
                                        </div>
                                        {ownPodUrl && session && (
                                            <button
                                                onClick={() => setManagingList({
                                                    fileUrl: `${ownPodUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`,
                                                    listId: list.id,
                                                })}
                                                className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors"
                                            >
                                                Manage sharing
                                            </button>
                                        )}
                                    </li>
                                )
                            })}
                    </ul>
                )}
            </section>

            {/* Manage sharing modal for section 4 */}
            {managingList && session && ownPodUrl && (
                <SharePackingListModal
                    isOpen={managingList !== null}
                    onClose={() => setManagingList(null)}
                    session={session}
                    fileUrl={managingList.fileUrl}
                    listId={managingList.listId}
                    sharerPodUrl={ownPodUrl}
                />
            )}
        </div>
    )
}
