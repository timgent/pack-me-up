/**
 * How a section's name is written when it is used as a heading.
 *
 * A section's name is often a question's text — that is what `defaultCategoryFor`
 * falls back to when a question's items carry no category of their own — so a
 * card ends up headed "Will you be staying overnight?". Every other heading on
 * the list is a noun phrase naming a pile of things, and a question mark among
 * them reads as if the card were asking rather than labelling.
 *
 * It is a display transform and nothing else: the stored category keeps its
 * question mark, so items typed into the card still join the section they were
 * typed into and nothing has to be migrated. Which also means it applies to
 * questions the user wrote themselves, and to sections they named, without
 * anyone having to fill in a second "short name" field.
 */
export function sectionHeading(label: string): string {
    const stripped = label.replace(/\s*\?+\s*$/, '')
    // A label that was only punctuation would vanish entirely — better an odd
    // heading than a card with no name on it at all.
    return stripped === '' ? label : stripped
}
