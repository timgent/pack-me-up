/**
 * Colours for the section headings in the questions editor.
 *
 * Sections used to be a line of 11px grey capitals with a hairline beside it,
 * which is roughly how you'd style a caption you wanted people to skip. A
 * section is the thing that decides how the packing list is grouped, so it gets
 * a card of its own with a coloured heading strip instead.
 *
 * The colour is derived from the section *name*, not its position, so
 * "Toiletries" is the same colour under every option and in every list. That's
 * what makes the grouping legible at a glance across a long page — you learn a
 * section by its colour and can then follow it without reading. A fixed palette
 * means two names can collide; that costs nothing, because colour here is a
 * grouping cue on top of a heading that already says the name.
 *
 * Every class is written out in full: Tailwind scans source text, so a class
 * assembled from a colour variable would simply not exist at runtime.
 */

export interface SectionAccent {
    /** Card outline. */
    border: string
    /** Heading strip fill. */
    header: string
    /** Heading text on that fill. */
    text: string
    /** Secondary text on that fill — the item count. */
    muted: string
    /** Solid marker, used where a heading stands alone rather than atop a card. */
    rail: string
}

/**
 * Deliberately avoids blue and emerald: those already mean "shared" and "per
 * night" on the item badges inside these very lists, and a section heading in
 * the same colour would suggest a link that isn't there.
 */
export const SECTION_ACCENTS: readonly SectionAccent[] = [
    { border: 'border-violet-200 dark:border-violet-800', header: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-900 dark:text-violet-200', muted: 'text-violet-500 dark:text-violet-400', rail: 'bg-violet-400' },
    { border: 'border-amber-200 dark:border-amber-800', header: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-900 dark:text-amber-200', muted: 'text-amber-600 dark:text-amber-400', rail: 'bg-amber-400' },
    { border: 'border-rose-200 dark:border-rose-800', header: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-900 dark:text-rose-200', muted: 'text-rose-500 dark:text-rose-400', rail: 'bg-rose-400' },
    { border: 'border-cyan-200 dark:border-cyan-800', header: 'bg-cyan-50 dark:bg-cyan-950/40', text: 'text-cyan-900 dark:text-cyan-200', muted: 'text-cyan-600 dark:text-cyan-400', rail: 'bg-cyan-400' },
    { border: 'border-lime-200 dark:border-lime-800', header: 'bg-lime-50 dark:bg-lime-950/40', text: 'text-lime-900 dark:text-lime-200', muted: 'text-lime-600 dark:text-lime-400', rail: 'bg-lime-500' },
    { border: 'border-fuchsia-200 dark:border-fuchsia-800', header: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', text: 'text-fuchsia-900 dark:text-fuchsia-200', muted: 'text-fuchsia-500 dark:text-fuchsia-400', rail: 'bg-fuchsia-400' },
    { border: 'border-indigo-200 dark:border-indigo-800', header: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-900 dark:text-indigo-200', muted: 'text-indigo-500 dark:text-indigo-400', rail: 'bg-indigo-400' },
    { border: 'border-orange-200 dark:border-orange-800', header: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-900 dark:text-orange-200', muted: 'text-orange-600 dark:text-orange-400', rail: 'bg-orange-400' },
]

/**
 * The default section — the option's or question's own name — is the main pile
 * rather than something the user chose to separate out, so it stays neutral.
 * That way colour on this page always means "someone named this group".
 */
export const DEFAULT_SECTION_ACCENT: SectionAccent = {
    border: 'border-gray-200 dark:border-gray-700',
    header: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    muted: 'text-gray-400 dark:text-gray-500',
    rail: 'bg-gray-300',
}

/** Plain string hash — stable across reloads, machines and stored data. */
function hashLabel(label: string): number {
    let hash = 0
    for (let i = 0; i < label.length; i++) {
        hash = (hash * 31 + label.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
}

export function sectionAccent(label: string, isDefault: boolean): SectionAccent {
    if (isDefault) return DEFAULT_SECTION_ACCENT
    return SECTION_ACCENTS[hashLabel(label) % SECTION_ACCENTS.length]
}
