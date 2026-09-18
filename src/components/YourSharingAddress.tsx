import { successToast } from '../utils/successToastCopy'
import { ShareActions } from './ShareActions'

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

            <ShareActions
                value={webId}
                copyLabel="Copy my address"
                copiedMessage={() => successToast('addressCopied')}
                shareLabel="Send my address"
                shareTitle="My Pack Me Up sharing address"
                shareText={`Here's my Pack Me Up sharing address, so you can share packing lists with me: ${webId}`}
                qrLabel="Your sharing address as a QR code"
                qrHint="They can point a camera at this instead of typing it."
                errorContext="YourSharingAddress"
            />
        </div>
    )
}
