/**
 * Default name for a duplicated packing list.
 *
 * "Copy of Cornwall" is accurate and joyless, and it describes the wrong thing:
 * people duplicate a list because they are going to Cornwall *again*, not
 * because they want a photocopy. The name is only a default — it stays
 * editable from the list's Rename action.
 */

const FALLBACK_BASE = 'Packing list'

/** "(again!)" or "(again! ×3)" on the end of a name we produced earlier. */
const AGAIN_SUFFIX = /\s*\(again!(?:\s*×\s*\d+)?\)$/i

const normalise = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * `originalName` with an "(again!)" suffix, counting up past any name in
 * `existingNames` — compared the way a person reads their list of trips, so
 * case and stray padding don't let two identical-looking names through.
 */
export function duplicateListName(originalName: string, existingNames: readonly string[]): string {
    // Duplicating a duplicate counts up from the trip, not from the last copy:
    // otherwise the fourth Cornwall is "Cornwall (again!) (again!) (again!)".
    const base = originalName.trim().replace(AGAIN_SUFFIX, '').trim() || FALLBACK_BASE

    const taken = new Set(existingNames.map(normalise))
    const candidateFor = (repeat: number) => repeat === 1 ? `${base} (again!)` : `${base} (again! ×${repeat})`

    let repeat = 1
    while (taken.has(normalise(candidateFor(repeat)))) repeat++
    return candidateFor(repeat)
}
