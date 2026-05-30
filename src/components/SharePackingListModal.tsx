import { useState, useEffect } from 'react'
import { AppSession } from '../types/AppSession'
import {
    grantCollaboratorAccess,
    grantPublicAccess,
    revokeCollaboratorAccess,
    revokePublicAccess,
    getCollaborators,
    isPubliclyAccessible,
} from '../services/solidPod'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'

type ShareMode = 'person' | 'public'

interface SharePackingListModalProps {
    isOpen: boolean
    onClose: () => void
    session: AppSession
    fileUrl: string
    listId: string
    sharerPodUrl: string
    saveListToPod?: () => Promise<void>
}

export function SharePackingListModal({
    isOpen,
    onClose,
    session,
    fileUrl,
    listId,
    sharerPodUrl,
    saveListToPod,
}: SharePackingListModalProps) {
    const [shareMode, setShareMode] = useState<ShareMode>('person')
    const [collaboratorWebId, setCollaboratorWebId] = useState('')
    const [isGranting, setIsGranting] = useState(false)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [currentCollaborators, setCurrentCollaborators] = useState<string[]>([])
    const [isPublic, setIsPublic] = useState(false)
    const [isLoadingAccess, setIsLoadingAccess] = useState(false)
    const [revokingWebId, setRevokingWebId] = useState<string | null>(null)
    const [isRevokingPublic, setIsRevokingPublic] = useState(false)

    const buildLink = () => {
        const base = `${window.location.origin}/#/view-lists/${listId}?pod=${encodeURIComponent(sharerPodUrl)}`
        return session.info.webId
            ? `${base}&owner=${encodeURIComponent(session.info.webId)}`
            : base
    }

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
        if (!collaboratorWebId.trim()) return

        setIsGranting(true)
        setError(null)
        try {
            if (saveListToPod) await saveListToPod()
            await grantCollaboratorAccess(session, fileUrl, collaboratorWebId.trim())
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

    const handleCopy = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink)
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
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Current access</h3>
                    {isLoadingAccess ? (
                        <p className="text-sm text-gray-500">Loading…</p>
                    ) : !hasAnyAccess ? (
                        <p className="text-sm text-gray-500">No one else has access yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {isPublic && (
                                <li className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                    <span className="text-sm text-gray-800">🌐 Anyone with the link</span>
                                    <button
                                        type="button"
                                        onClick={handleRevokePublic}
                                        disabled={isRevokingPublic}
                                        aria-label="Revoke public access"
                                        className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                                    >
                                        {isRevokingPublic ? 'Revoking…' : 'Revoke'}
                                    </button>
                                </li>
                            )}
                            {currentCollaborators.map(webId => (
                                <li key={webId} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                    <span className="text-sm text-gray-800 truncate flex-1" title={webId}>{webId}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRevokeCollaborator(webId)}
                                        disabled={revokingWebId === webId}
                                        aria-label={`Revoke access for ${webId}`}
                                        className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                                    >
                                        {revokingWebId === webId ? 'Revoking…' : 'Revoke'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <hr className="border-gray-200" />

                {/* Add access section */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Add access</h3>

                    {/* Mode tabs */}
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
                        <button
                            type="button"
                            onClick={() => handleModeChange('person')}
                            className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                                shareMode === 'person'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
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
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            Anyone with the link
                        </button>
                    </div>

                    {shareMode === 'person' && (
                        <div>
                            <Input
                                label="Collaborator's WebID"
                                placeholder="https://friend.solidcommunity.net/profile/card#me"
                                value={collaboratorWebId}
                                onChange={e => {
                                    setCollaboratorWebId(e.target.value)
                                    setError(null)
                                }}
                                disabled={isGranting}
                            />
                        </div>
                    )}

                    {shareMode === 'public' && !generatedLink && (
                        <p className="text-sm text-gray-600">
                            Anyone who follows this link can view and edit this list — no sign-in required to view.
                        </p>
                    )}

                    {error && (
                        <p className="text-sm text-red-600 mt-2">{error}</p>
                    )}

                    {shareMode === 'person' && (
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleShare}
                            disabled={isGranting || !collaboratorWebId.trim()}
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
                            <label className="block text-sm font-medium text-gray-700">
                                Shareable link
                                <input
                                    aria-label="Shareable link"
                                    type="text"
                                    readOnly
                                    value={generatedLink}
                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-gray-50"
                                />
                            </label>
                            <Button type="button" variant="secondary" onClick={handleCopy}>
                                Copy link
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    )
}
