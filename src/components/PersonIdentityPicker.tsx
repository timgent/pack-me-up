import { PERSON_COLORS, type PersonColor, type PersonColorId } from '../edit-questions/person-colors'
import { EXTRA_PERSON_EMOJI, PERSON_EMOJI } from '../edit-questions/person-emoji'

/**
 * How one person looks, all in one place: their colour, their emoji, and the
 * WebID that puts their own face on their avatar.
 *
 * It opens from the avatar itself rather than sitting as three fields under the
 * name, because the avatar is the thing being changed and every choice here
 * shows up on it the moment it is made. Three collapsed rows behind one tap
 * also keeps the People editor a list of names, which is what it is for.
 *
 * The palette and the emoji are shown in full rather than behind a dropdown:
 * twelve swatches and two dozen creatures are quicker to scan than any list of
 * their names, and the names are there for screen readers.
 */
export function PersonIdentityPicker({ personName, selectedColor, selectedEmoji, webId, onSelectColor, onSelectEmoji, onChangeWebId }: {
    personName: string
    selectedColor: PersonColor
    /** The emoji actually shown, or undefined when they are wearing their initial. */
    selectedEmoji: string | undefined
    webId: string
    onSelectColor: (id: PersonColorId) => void
    /** `''` clears the emoji, which is a choice — see the note on `Person.emoji`. */
    onSelectEmoji: (emoji: string) => void
    onChangeWebId: (webId: string) => void
}) {
    const emojiChoices = [...PERSON_EMOJI, ...EXTRA_PERSON_EMOJI]
    return (
        <div className="mt-2 ml-9 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Colour</p>
                <div role="group" aria-label={`Colour for ${personName}`} className="grid grid-cols-6 gap-1.5">
                    {PERSON_COLORS.map(color => {
                        const isSelected = color.id === selectedColor.id
                        return (
                            <button
                                key={color.id}
                                type="button"
                                onClick={() => onSelectColor(color.id)}
                                aria-label={color.label}
                                aria-pressed={isSelected}
                                title={color.label}
                                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 ${color.avatar} ${isSelected ? `ring-2 ring-offset-1 ${color.ring}` : ''}`}
                            >
                                {isSelected ? '✓' : ''}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Emoji</p>
                <div role="group" aria-label={`Emoji for ${personName}`} className="grid grid-cols-6 gap-1.5">
                    {/* First, so the way back to a plain initial is where the eye
                        lands rather than at the end of two dozen creatures. */}
                    <button
                        type="button"
                        onClick={() => onSelectEmoji('')}
                        aria-label="No emoji, use their initial"
                        aria-pressed={selectedEmoji === undefined}
                        title="No emoji"
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 ${selectedColor.avatar} ${selectedEmoji === undefined ? `ring-2 ring-offset-1 ${selectedColor.ring}` : ''}`}
                    >
                        {personName.charAt(0).toUpperCase() || '?'}
                    </button>
                    {emojiChoices.map(choice => {
                        const isSelected = choice.emoji === selectedEmoji
                        return (
                            <button
                                key={choice.emoji}
                                type="button"
                                onClick={() => onSelectEmoji(choice.emoji)}
                                aria-label={choice.label}
                                aria-pressed={isSelected}
                                title={choice.label}
                                className={`h-7 w-7 rounded-full flex items-center justify-center text-sm bg-white border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 ${isSelected ? `border-transparent ring-2 ring-offset-1 ${selectedColor.ring}` : 'border-gray-200'}`}
                            >
                                {choice.emoji}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Solid WebID
                    <input
                        type="url"
                        inputMode="url"
                        value={webId}
                        onChange={event => onChangeWebId(event.target.value)}
                        placeholder="https://example.org/profile/card#me"
                        aria-label={`Solid WebID for ${personName}`}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </label>
                <p className="text-[11px] text-gray-400">
                    Has their own pod? Paste their WebID and their profile photo becomes their avatar.
                </p>
            </div>
        </div>
    )
}
