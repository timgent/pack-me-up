/**
 * Confirmation copy for things that went right, in more than one wording each.
 *
 * Packing for a family is a chore, and the tool for a chore shouldn't sound
 * like a receipt printer. More practically: a sentence you have already read
 * is a sentence you stop reading, so backing up twice in a row saying
 * "Backup created successfully!" twice trains people to ignore the toast that
 * eventually tells them something they need.
 *
 * Only success copy lives here, deliberately. When something has failed a
 * person needs plain and precise — a wry line there reads as the app not
 * taking the problem seriously, and it is the message they may have to quote
 * to get help. Error toasts stay literal and keep their copyable details.
 */

export const SUCCESS_TOAST_VARIANTS = {
    questionsGenerated: [
        'Your questions and items are ready 🎉',
        'All set — your questions are ready',
        'Done! Have a look at what we came up with',
    ],
    backupCreated: [
        'Backed up — safely tucked away',
        'Backup saved. Nothing to worry about',
        'All copied. Sleep easy',
    ],
    backupRestored: [
        'Restored — welcome back',
        'Everything is back where it was',
        'Backup restored. Carry on where you left off',
    ],
    inviteLinkCopied: [
        'Link copied — go and share it',
        'Copied! Paste it wherever suits',
        'Invite link is on your clipboard',
    ],
    setupShared: [
        'Your full setup is shared 🎉',
        'Shared — they can see your setup now',
        'Done. Your setup is theirs to see too',
    ],
} as const satisfies Record<string, readonly [string, string, ...string[]]>

export type SuccessToastKey = keyof typeof SUCCESS_TOAST_VARIANTS

/** What each action said last, so it can say something else this time. */
const lastShown = new Map<SuccessToastKey, string>()

/**
 * A confirmation for `key`, different from the one this action gave last time.
 * Random rather than round-robin so a run of them doesn't turn into a
 * recognisable cycle of its own.
 */
export function successToast(key: SuccessToastKey): string {
    const variants: readonly string[] = SUCCESS_TOAST_VARIANTS[key]
    const previous = lastShown.get(key)
    const choices = variants.filter(variant => variant !== previous)
    const chosen = choices[Math.floor(Math.random() * choices.length)] ?? variants[0]
    lastShown.set(key, chosen)
    return chosen
}

/** Test seam: forget what was last said, so cases don't lean on each other. */
export function resetSuccessToastVariety(): void {
    lastShown.clear()
}
