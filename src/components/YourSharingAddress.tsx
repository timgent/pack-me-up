import { ClipboardDocumentIcon, QrCodeIcon, ShareIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { reportError } from '../errorReporting'
import { successToast } from '../utils/successToastCopy'
import { Button } from './Button'
import { QrCode } from './QrCode'
import { useToast } from './ToastContext'

/**
 * The signed-in person's own WebID, in a form they can actually hand to
 * somebody.
 *
 * Sharing in Solid starts with an address only the *recipient* can produce, and
 * until this existed the app never helped them produce it: their WebID appeared
 * once, as unselectable grey text inside the account dropdown. So the first
 * step of every share — "send me your address" — was a step the app did not
 * support, and pairs of friends stalled there without ever reaching the part
 * that works.
 *
 * Three ways out, because the three situations are different: copy (they are in
 * a chat with them), the system share sheet (they are on a phone, and it puts
 * the address into WhatsApp in one tap), and a QR code (they are in the same
 * room, which is when reading a URL aloud is at its worst).
 */
export function YourSharingAddress({
    webId,
    title = 'Your sharing address',
    description = 'This is how other people share with you. Send it to anyone who wants to share their questions or packing lists with you — they paste it into their own Sharing page.',
    className = '',
}: {
    webId: string
    title?: string
    description?: string
    className?: string
}) {
    const { showToast } = useToast()
    const [showQr, setShowQr] = useState(false)

    // Feature-detected per render rather than at module load: the native shell
    // and the browser build run the same code, and only one of them has it.
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(webId)
            showToast(successToast('addressCopied'), 'success')
        } catch (err) {
            // Clipboard access gets refused often enough to plan for (insecure
            // origin, permissions, an embedded webview). The address is on
            // screen and selectable, so say that rather than fail silently.
            const details = reportError(err, 'YourSharingAddress: failed to copy address')
            showToast('Could not copy — select the address and copy it manually.', 'error', details)
        }
    }

    const handleShare = async () => {
        try {
            await navigator.share?.({
                title: 'My Pack Me Up sharing address',
                text: `Here's my Pack Me Up sharing address, so you can share packing lists with me: ${webId}`,
            })
        } catch (err) {
            // Dismissing the sheet rejects with AbortError. That is a person
            // changing their mind, not a fault, and toasting at them for it
            // would be rude.
            if (err instanceof Error && err.name === 'AbortError') return
            const details = reportError(err, 'YourSharingAddress: failed to open the share sheet')
            showToast('Could not open the share sheet — copy the address instead.', 'error', details)
        }
    }

    return (
        <div className={`rounded-xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/40 p-4 space-y-3 ${className}`}>
            <div className="space-y-1">
                <h3 className="text-sm font-bold text-primary-900 dark:text-primary-200">{title}</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{description}</p>
            </div>

            {/* Selectable, wrapping, and whole: someone whose clipboard is
                blocked still has to be able to get at it. */}
            <p
                data-testid="sharing-address"
                className="select-all break-all rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-100"
            >
                {webId}
            </p>

            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="primary" onClick={handleCopy}>
                    <ClipboardDocumentIcon aria-hidden="true" className="h-4 w-4" />
                    Copy my address
                </Button>
                {canShare && (
                    <Button type="button" variant="secondary" onClick={handleShare}>
                        <ShareIcon aria-hidden="true" className="h-4 w-4" />
                        Send my address
                    </Button>
                )}
                <Button type="button" variant="subtle" onClick={() => setShowQr(open => !open)} aria-expanded={showQr}>
                    <QrCodeIcon aria-hidden="true" className="h-4 w-4" />
                    {showQr ? 'Hide QR code' : 'Show QR code'}
                </Button>
            </div>

            {showQr && (
                <div className="space-y-1">
                    <QrCode
                        value={webId}
                        label="Your sharing address as a QR code"
                        className="h-44 w-44 rounded-lg border border-gray-300 dark:border-gray-600 p-2"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                        They can point a camera at this instead of typing it.
                    </p>
                </div>
            )}
        </div>
    )
}
