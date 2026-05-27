import { useState } from 'react'
import { AppSession } from '../types/AppSession'
import { grantCollaboratorAccess, grantPublicAccess } from '../services/solidPod'
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
}

export function SharePackingListModal({
    isOpen,
    onClose,
    session,
    fileUrl,
    listId,
    sharerPodUrl,
}: SharePackingListModalProps) {
    const [shareMode, setShareMode] = useState<ShareMode>('person')
    const [collaboratorWebId, setCollaboratorWebId] = useState('')
    const [isGranting, setIsGranting] = useState(false)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const buildLink = () =>
        `${window.location.origin}/#/view-lists/${listId}?pod=${encodeURIComponent(sharerPodUrl)}`

    const handleShare = async () => {
        if (!collaboratorWebId.trim()) return

        setIsGranting(true)
        setError(null)
        try {
            await grantCollaboratorAccess(session, fileUrl, collaboratorWebId.trim())
            setGeneratedLink(buildLink())
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
            await grantPublicAccess(session, fileUrl)
            setGeneratedLink(buildLink())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to share. Please try again.')
        } finally {
            setIsGranting(false)
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

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Share packing list">
            <div className="space-y-4">
                {/* Mode tabs */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
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
                    <p className="text-sm text-red-600">{error}</p>
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
                    <div className="space-y-2">
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
        </Modal>
    )
}
