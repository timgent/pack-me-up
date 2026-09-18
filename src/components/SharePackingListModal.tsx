import { GlobeAltIcon } from '@heroicons/react/24/outline'
import { useState, useEffect } from 'react'
import { AppSession } from '../types/AppSession'
import {
    grantCollaboratorAccess,
    grantPublicAccess,
    revokeCollaboratorAccess,
    revokePublicAccess,
    getCollaborators,
    isPubliclyAccessible,
    buildSharedListUrl,
} from '../services/solidPod'
import { Modal } from './Modal'
import { Button } from './Button'
import { CollaboratorIdentity } from './CollaboratorIdentity'
import { PeopleSuggestions } from './PeopleSuggestions'
import { ShareableLink } from './ShareableLink'
import { WebIdField } from './WebIdField'
import type { KnownPerson } from '../hooks/useKnownPeople'
import { useWebIdLookup } from '../hooks/useWebIdLookup'

type ShareMode = 'person' | 'public'

interface SharePackingListModalProps {
    isOpen: boolean
    onClose: () => void
    session: AppSession
    fileUrl: string
    listId: string
    sharerPodUrl: string
    /** Named in the share-sheet message, so "what is this link?" is answered. */
    listName?: string
    saveListToPod?: () => Promise<void>
    /**
     * Addresses this device already holds, offered as one tap each.
     *
     * Passed in rather than read here: this component talks to the Pod, and
     * the local database is the caller's business (see the Data Access rules
     * in CLAUDE.md).
     */
    knownPeople?: readonly KnownPerson[]
}

export function SharePackingListModal({
    isOpen,
    onClose,
    session,
    fileUrl,
    listId,
    sharerPodUrl,
    listName,
    saveListToPod,
    knownPeople = [],
}: SharePackingListModalProps) {
    const [shareMode, setShareMode] = useState<ShareMode>('person')
    const [collaboratorWebId, setCollaboratorWebId] = useState('')
    const [isGranting, setIsGranting] = useState(false)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // What we will actually grant to, and who is behind it — see WebIdField
    // for why an address is never taken on trust any more.
    const collaboratorLookup = useWebIdLookup(collaboratorWebId, session)

    const [currentCollaborators, setCurrentCollaborators] = useState<string[]>([])
    const [isPublic, setIsPublic] = useState(false)
    const [isLoadingAccess, setIsLoadingAccess] = useState(false)
    const [revokingWebId, setRevokingWebId] = useState<string | null>(null)
    const [isRevokingPublic, setIsRevokingPublic] = useState(false)

    const buildLink = () => buildSharedListUrl(listId, sharerPodUrl, session.info.webId ?? undefined)

    const loadCurrentAccess = async () => {
        setIsLoadingAccess(true)
        try {
            const [collaborators, publicAccess] = await Promise.all([
                getCollaborators(session, fileUrl),
                isPubliclyAccessible(session, fileUrl),
            ])
            setCurrentCollaborators(collaborators)
            setIsPublic(publicAccess)
        } catch {
            // silently ignore — ACL may not be available for all servers
        } finally {
            setIsLoadingAccess(false)
        }
    }

    useEffect(() => {
        if (isOpen) {
            loadCurrentAccess()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const handleShare = async () => {
        const webId = collaboratorLookup.webId
        if (!webId) return

        setIsGranting(true)
        setError(null)
        try {
            if (saveListToPod) await saveListToPod()
            await grantCollaboratorAccess(session, fileUrl, webId)
            setGeneratedLink(buildLink())
            setCollaboratorWebId('')
            await loadCurrentAccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to share. Please try again.')
        } finally {
            setIsGranting(false)
        }
    }

    const handleSharePublicly = async () => {
        setIsGranting(true)
        setError(null)
        try {
            if (saveListToPod) await saveListToPod()
            await grantPublicAccess(session, fileUrl)
            setGeneratedLink(buildLink())
            await loadCurrentAccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to share. Please try again.')
        } finally {
            setIsGranting(false)
        }
    }

    const handleRevokeCollaborator = async (webId: string) => {
        setRevokingWebId(webId)
        try {
            await revokeCollaboratorAccess(session, fileUrl, webId)
            await loadCurrentAccess()
        } catch {
            // silently ignore — user can retry by reopening modal
        } finally {
            setRevokingWebId(null)
        }
    }

    const handleRevokePublic = async () => {
        setIsRevokingPublic(true)
        try {
            await revokePublicAccess(session, fileUrl)
            await loadCurrentAccess()
        } catch {
            // silently ignore
        } finally {
            setIsRevokingPublic(false)
        }
    }

    const handleModeChange = (mode: ShareMode) => {
        setShareMode(mode)
        setError(null)
        setGeneratedLink(null)
    }

    const hasAnyAccess = isPublic || currentCollaborators.length > 0

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage sharing">
            <div className="space-y-5">
                {/* Current access section */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Current access</h3>
                    {isLoadingAccess ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
                    ) : !hasAnyAccess ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No one else has access yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {isPublic && (
                                <li className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-800 dark:text-gray-100">
                                        <GlobeAltIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                                        Anyone with the link
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleRevokePublic}
                                        disabled={isRevokingPublic}
                                        aria-label="Revoke public access"
                                        className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                    >
                                        {isRevokingPublic ? 'Revoking…' : 'Revoke'}
                                    </button>
                                </li>
                            )}
                            {currentCollaborators.map(webId => (
                                <li key={webId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                    <CollaboratorIdentity webId={webId} session={session} />
                                    <button
                                        type="button"
                                        onClick={() => handleRevokeCollaborator(webId)}
                                        disabled={revokingWebId === webId}
                                        aria-label={`Revoke access for ${webId}`}
                                        className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                    >
                                        {revokingWebId === webId ? 'Revoking…' : 'Revoke'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                {/* Add access section */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add access</h3>

                    {/* Mode tabs */}
                    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
                        <button
                            type="button"
                            onClick={() => handleModeChange('person')}
                            className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                                shareMode === 'person'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                        >
                            With a person
                        </button>
                        <button
                            type="button"
                            onClick={() => handleModeChange('public')}
                            className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                                shareMode === 'public'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                        >
                            Anyone with the link
                        </button>
                    </div>

                    {shareMode === 'person' && (
                        <PeopleSuggestions
                            people={knownPeople}
                            alreadyShared={currentCollaborators}
                            onPick={webId => {
                                setCollaboratorWebId(webId)
                                setError(null)
                            }}
                        />
                    )}

                    {shareMode === 'person' && (
                        <WebIdField
                            label="Their sharing address (WebID)"
                            placeholder="https://friend.solidcommunity.net/profile/card#me"
                            value={collaboratorWebId}
                            onChange={value => {
                                setCollaboratorWebId(value)
                                setError(null)
                            }}
                            lookup={collaboratorLookup}
                            disabled={isGranting}
                        />
                    )}

                    {shareMode === 'public' && !generatedLink && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Anyone who follows this link can view and edit this list — no sign-in required to view.
                        </p>
                    )}

                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
                    )}

                    {shareMode === 'person' && (
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleShare}
                            disabled={isGranting || !collaboratorLookup.webId}
                        >
                            {isGranting ? 'Sharing...' : 'Share'}
                        </Button>
                    )}

                    {shareMode === 'public' && !generatedLink && (
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleSharePublicly}
                            disabled={isGranting}
                        >
                            {isGranting ? 'Sharing...' : 'Share publicly'}
                        </Button>
                    )}

                    {generatedLink && (
                        <div className="space-y-2 mt-3">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                Access is granted. Send them this link so they can open the list:
                            </p>
                            <ShareableLink link={generatedLink} label="Shareable link" subject={listName} />
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    )
}
