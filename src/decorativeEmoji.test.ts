import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The guard for #335: decorative emoji stay out of the app.
 *
 * The complaint that started it (design feedback, 26/08/2026) was that the emoji
 * on buttons and cards "bring a lot of colors and don't contrast very well on
 * their backgrounds" — an emoji is a full-colour bitmap the theme cannot touch,
 * so it looks wrong in dark mode, wrong on a gradient, and different on every
 * platform. Icons are `currentColor`, so they are always the colour of the text
 * they sit beside.
 *
 * That pass is worth nothing if the next screen quietly adds a ✨ back, and a
 * reviewer will not spot one glyph in a diff. So this test asserts the *exact*
 * set of emoji left in the app, file by file. It fails two ways on purpose:
 *
 * - a new decorative emoji anywhere → an unexpected file, or an unexpected
 *   glyph in a listed one
 * - a semantic emoji deleted by accident → a missing glyph
 *
 * If you are here because you added an emoji: it belongs in the list below only
 * if it is the content — the thing the user is looking at — rather than an
 * ornament on a control or a heading whose label already says the same thing.
 * Otherwise reach for `@heroicons/react/24/outline`, `aria-hidden="true"`, and
 * a real accessible name on the control.
 */

/** Everything a font would render as a picture rather than as text. */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u

/**
 * The emoji that are the content, and why each file keeps them. Values are the
 * distinct glyphs in that file, sorted by code point.
 */
const SEMANTIC_EMOJI: Record<string, string[]> = {
    // Per-person avatars (#248). The emoji IS the person's identity here — it
    // is what distinguishes Alice's row from Bob's at a glance.
    'src/edit-questions/person-emoji.ts': [
        '⚽', '⭐', '🌈', '🍄', '🎸', '🐈', '🐕', '🐙', '🐝', '🐢', '🐧', '🐨',
        '🐬', '🐰', '🐳', '🐸', '🐼', '🐾', '🚀', '🦁', '🦄', '🦉', '🦊', '🦋',
        '🦖',
    ],
    // 🐾 marks a pet, which is a genuinely different kind of traveller from a
    // person; the age glyphs distinguish an adult, a child and a baby, which is
    // what the packing questions branch on.
    'src/edit-questions/types.ts': ['🐈', '🐕', '🐾', '👦', '👧', '👶', '🧑', '🧒'],
    // The "Add a Pet" button, matching the 🐾 the pet then carries everywhere
    // else. Not an ornament: it is the same mark as the thing being created.
    'src/pages/wizard.tsx': ['🐾'],
    // Deliberate celebration copy — a milestone message where the single emoji
    // is the point of the message.
    'src/pages/packing-milestones.ts': ['🌱', '💪', '🔥'],
    'src/utils/successToastCopy.ts': ['🎉'],
    // The all-packed banner: the one moment in the app that is *about* being
    // colourful. Confetti falls (`celebration-emoji`) and the suitcase pops
    // (`celebration-suitcase-pop`); both are `aria-hidden` and both are
    // switched off under `prefers-reduced-motion` in `index.css`.
    'src/pages/view-packing-list.tsx': ['✈️', '✨', '🌍', '🎈', '🎉', '🎊', '🧳'],
    // Fixture data: a fully populated person carries a person emoji.
    'src/test-utils/fullyPopulatedFixtures.ts': ['🦄'],
}

const SRC = join(import.meta.dirname, '..', 'src')

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return sourceFiles(path)
        if (!/\.tsx?$/.test(entry.name)) return []
        if (/\.(test|spec)\.tsx?$/.test(entry.name)) return []
        return [path]
    })
}

/** Distinct pictographic characters in `content`, sorted, variation selectors kept. */
function emojiIn(content: string): string[] {
    const found = new Set<string>()
    // Segment by grapheme so "✈️" (aircraft + variation selector) is counted as
    // the one glyph a reader sees rather than as two code points.
    for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(content)) {
        if (PICTOGRAPHIC.test(segment)) found.add(segment)
    }
    return [...found].sort()
}

describe('decorative emoji (#335)', () => {
    const actual: Record<string, string[]> = {}
    for (const file of sourceFiles(SRC)) {
        const emoji = emojiIn(readFileSync(file, 'utf8'))
        if (emoji.length > 0) actual[relative(join(SRC, '..'), file).split(sep).join('/')] = emoji
    }

    it('leaves emoji only where they carry meaning', () => {
        expect(actual).toEqual(SEMANTIC_EMOJI)
    })

    it('lists every allowlisted file, so a stale entry is caught too', () => {
        expect(Object.keys(actual).sort()).toEqual(Object.keys(SEMANTIC_EMOJI).sort())
    })
})
