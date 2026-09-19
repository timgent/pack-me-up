import { ClipboardDocumentIcon, QrCodeIcon, ShareIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { reportError } from '../errorReporting'
import { Button } from './Button'
import { QrCode } from './QrCode'
import { useToast } from './ToastContext'

/**
 * The three ways to get a string out of this app and into somebody else's
 * hands: the clipboard, the system share sheet, and a QR code.
 *
 * Sharing has two of these moments, and they used to be treated very
 * differently. Handing over your own address got all three; handing over the
 * link that was just generated got a read-only input and a Copy button — even
 * though that link is the half that has to travel, usually into a chat on the
 * same phone. Same job, so: same component.
 *
 * The share sheet is feature-detected per render, because the native shell and
 * the browser build run the same code and only one of them has it. A sheet the
 * person dismisses rejects with `AbortError`, which is somebody changing their
 * mind rather than a fault, and is passed over in silence.
 */
export function ShareActions({
    value,
    copyLabel,
    copiedMessage,
    shareLabel,
    shareTitle,
    shareText,
    qrLabel,
    qrHint,
    errorContext,
}: {
    /** What lands on the clipboard and inside the QR code. */
    value: string
    copyLabel: string
    /** A function when the wording should vary between copies. */
    copiedMessage: string | (() => string)
    shareLabel: string
    shareTitle: string
    /** The message body — include `value`, since not every target keeps a URL. */
    shareText: string
    qrLabel: string
    qrHint: string
    /** Names this call site in anything reported. */
    errorContext: string
}) {
    const { showToast } = useToast()
    const [showQr, setShowQr] = useState(false)

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            showToast(typeof copiedMessage === 'function' ? copiedMessage() : copiedMessage, 'success')
        } catch (err) {
            // Clipboard access gets refused often enough to plan for (insecure
            // origin, permissions, an embedded webview). Callers keep the value
            // on screen and selectable, so say that rather than fail silently.
            const details = reportError(err, `${errorContext}: failed to copy`)
            showToast('Could not copy — select it and copy it manually.', 'error', details)
        }
    }

    const handleShare = async () => {
        try {
            await navigator.share?.({ title: shareTitle, text: shareText })
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return
            const details = reportError(err, `${errorContext}: failed to open the share sheet`)
            showToast('Could not open the share sheet — copy it instead.', 'error', details)
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="primary" onClick={handleCopy}>
                    <ClipboardDocumentIcon aria-hidden="true" className="h-4 w-4" />
                    {copyLabel}
                </Button>
                {canShare && (
                    <Button type="button" variant="secondary" onClick={handleShare}>
                        <ShareIcon aria-hidden="true" className="h-4 w-4" />
                        {shareLabel}
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
                        value={value}
                        label={qrLabel}
                        className="h-44 w-44 rounded-lg border border-gray-300 dark:border-gray-600 p-2"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400">{qrHint}</p>
                </div>
            )}
        </div>
    )
}
