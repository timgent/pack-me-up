import { useState } from 'react'
import { AppSession } from '../types/AppSession'
import { grantCollaboratorAccess, deriveWebIdFromPodUrl } from '../services/solidPod'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'

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
    const [collaboratorPodUrl, setCollaboratorPodUrl] = useState('')
    const [isGranting, setIsGranting] = useState(false)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleShare = async () => {
        if (!collaboratorPodUrl.trim()) return

        setIsGranting(true)
        setError(null)
        try {
            const webId = deriveWebIdFromPodUrl(collaboratorPodUrl)
            await grantCollaboratorAccess(session, fileUrl, webId)
            const link = `${window.location.origin}/#/view-lists/${listId}?pod=${encodeURIComponent(sharerPodUrl)}`
            setGeneratedLink(link)
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

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Share packing list">
            <div className="space-y-4">
                <div>
                    <Input
                        label="Collaborator's pod URL"
                        placeholder="Pod URL (e.g. https://friend.solidcommunity.net/)"
                        value={collaboratorPodUrl}
                        onChange={e => {
                            setCollaboratorPodUrl(e.target.value)
                            setError(null)
                        }}
                        disabled={isGranting}
                    />
                </div>

                {error && (
                    <p className="text-sm text-red-600">{error}</p>
                )}

                <Button
                    type="button"
                    variant="primary"
                    onClick={handleShare}
                    disabled={isGranting || !collaboratorPodUrl.trim()}
                >
                    {isGranting ? 'Sharing...' : 'Share'}
                </Button>

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
