import { useState } from 'react'
import type { PersonIdentity } from '../edit-questions/person-identity'

/**
 * One person, drawn as one mark: their photo if their Solid profile has one,
 * otherwise their emoji, otherwise the first letter of their name — always in
 * their colour, which is the same mark the questions page puts beside every
 * item, so a packing list can be read the same way: find your colour, that's
 * your pile.
 *
 * The colour never drops out. A photo is *ringed* in it rather than replacing
 * it, because the colour is the part that has to keep working across the whole
 * app, and a face nobody has seen before says less at 20px than a blue disc
 * does on a list where blue is Alice.
 *
 * Decorative, always: everywhere it appears the person's name is written
 * beside it, so announcing the initial as well would only make a screen
 * reader say "A, Alice's Items".
 */
export function PersonAvatar({ name, identity, size = 'md', initial }: {
    name: string
    identity: PersonIdentity
    size?: 'sm' | 'md'
    /**
     * Overrides the letter, for the places that have already worked out what
     * tells this person apart from everyone else on the list — Alice and Amy
     * are both "A". See `buildGridColumns`. It only reaches the disc when there
     * is no photo and no emoji to show instead.
     */
    initial?: string
}) {
    const { color, emoji, photoUrl } = identity
    // Reset by keying the state to the URL: a person whose photo 404s must go
    // back to their initial, but must also pick up a *later* photo — the one
    // they just typed a working WebID for — rather than staying broken because
    // the first one was.
    const [failed, setFailed] = useState<string | null>(null)
    const showPhoto = photoUrl !== undefined && failed !== photoUrl

    const dimensions = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'
    const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

    if (showPhoto) {
        return (
            <img
                data-testid="person-avatar"
                src={photoUrl}
                alt=""
                title={name}
                aria-hidden="true"
                onError={() => setFailed(photoUrl)}
                className={`inline-block rounded-full object-cover select-none shrink-0 ring-2 ring-offset-1 ${dimensions} ${color.ring}`}
            />
        )
    }

    return (
        <span
            data-testid="person-avatar"
            title={name}
            aria-hidden="true"
            className={`inline-flex items-center justify-center rounded-full font-bold select-none shrink-0 ${dimensions} ${textSize} ${color.avatar}`}
        >
            {emoji ?? initial ?? (name.charAt(0).toUpperCase() || '?')}
        </span>
    )
}
