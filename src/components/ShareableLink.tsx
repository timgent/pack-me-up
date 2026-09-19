import { successToast } from '../utils/successToastCopy'
import { ShareActions } from './ShareActions'

/**
 * The link produced by a successful share, with the same three ways out as the
 * address that started it (`YourSharingAddress`).
 *
 * Granting access is only half of a share: the other person still has to be
 * *told*, and until this the app stopped at a read-only input and a Copy
 * button. Copy is the wrong shape for the commonest case — somebody on a phone
 * who is about to paste this into the chat they are already having — which is
 * what the share sheet is for, and the QR code covers the two-people-on-a-sofa
 * case the same way it does for addresses.
 */
export function ShareableLink({ link, label, subject }: {
    link: string
    /** Names the field, for screen readers and for tests. */
    label: string
    /** What is on the other end of the link, when there is a name for it. */
    subject?: string
}) {
    const what = subject ? `“${subject}”` : 'a packing list'

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {label}
                <input
                    aria-label={label}
                    type="text"
                    readOnly
                    value={link}
                    // Clicking selects the lot, so copying by hand is one
                    // gesture rather than a careful drag across a long URL.
                    onClick={event => (event.target as HTMLInputElement).select()}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800"
                />
            </label>

            <ShareActions
                value={link}
                copyLabel="Copy link"
                copiedMessage={() => successToast('inviteLinkCopied')}
                shareLabel="Send link"
                shareTitle="A Pack Me Up packing list"
                shareText={`I've shared ${what} with you on Pack Me Up: ${link}`}
                qrLabel="This link as a QR code"
                qrHint="They can point a camera at this to open it."
                errorContext="ShareableLink"
            />
        </div>
    )
}
