import { z } from 'zod'
import { PersonColorSchema } from './person-colors'

// Age Range Type
export const AgeRangeSchema = z.enum(['Baby', 'Toddler', 'Child', 'Teenager', 'Adult'])
export type AgeRange = z.infer<typeof AgeRangeSchema>

// Age range options for dropdowns with descriptions
export const AGE_RANGE_OPTIONS = [
  { value: 'Baby' as const, label: '👶 Baby (0-1) - nappies & wipes' },
  { value: 'Toddler' as const, label: '🧒 Toddler (1-3) - potty & pull-ups' },
  { value: 'Child' as const, label: '👧 Child (3-12)' },
  { value: 'Teenager' as const, label: '👦 Teenager (12-17)' },
  { value: 'Adult' as const, label: '🧑 Adult (18+)' }
] as const

// Gender Type
export const GenderSchema = z.enum(['male', 'female', 'other', 'prefer-not-to-say'])
export type Gender = z.infer<typeof GenderSchema>

export const GENDER_OPTIONS = [
  { value: 'male' as const, label: 'Male' },
  { value: 'female' as const, label: 'Female' },
  { value: 'other' as const, label: 'Non-binary / other' },
  { value: 'prefer-not-to-say' as const, label: 'Prefer not to say' },
] as const

// Pet Species Type
export const PetSpeciesSchema = z.enum(['dog', 'cat', 'other'])
export type PetSpecies = z.infer<typeof PetSpeciesSchema>

export const PET_SPECIES_OPTIONS = [
  { value: 'dog' as const, label: '🐕 Dog' },
  { value: 'cat' as const, label: '🐈 Cat' },
  { value: 'other' as const, label: '🐾 Other pet' },
] as const

// Zod Schemas
// `species` is optional and additive: a Person without it is a human (existing
// data loads unchanged); a Person with it is a pet, modelled as just another
// person once the question set is generated.
// `dateOfBirth` (ISO date, YYYY-MM-DD) is optional and additive: when present
// the person's bracket is derived from it and `ageRange` acts as the last
// bracket the user acknowledged, which is how age-up transitions are detected.
// `color` is optional and additive: absent means "whatever this person's
// position gives them", which is the colour they had before the picker
// existed. See `person-colors.ts`.
// `emoji` is optional and additive, and has three states rather than two:
// absent means "whatever my position gives me" (see `person-emoji.ts`), a
// character means that character, and the empty string means "none, show my
// initial". Absent and empty have to be told apart, because only the second is
// a decision the user made.
// `webId` is optional and additive: the person's Solid WebID, followed to their
// profile card to show their own photo on their avatar. Nothing else depends on
// it, so a wrong or unreachable one costs the initial and nothing more.
export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  ageRange: AgeRangeSchema.optional(),
  dateOfBirth: z.string().optional(),
  gender: GenderSchema.optional(),
  species: PetSpeciesSchema.optional(),
  color: PersonColorSchema.optional(),
  emoji: z.string().optional(),
  webId: z.string().optional(),
  lastModified: z.string().optional(),
  deletedAt: z.string().optional(),
})

export const PersonSelectionSchema = z.object({
  personId: z.string(),
  selected: z.boolean()
})

// `communal` is optional and additive: absent means the item fans out
// per-person as before. When true, the item is packed once for the whole
// group and `personSelections` become a trigger — the item is included when
// at least one selected person is on the trip.
// `ageRanges` is optional and additive: default items generated from an age
// filter record which brackets they apply to, so age-up transitions can
// suggest selecting/deselecting a person. User-created items have no tag and
// are never touched by those suggestions.
// `order` is optional and additive: items without it sort after ordered ones
// in their original position, so legacy data keeps its array order.
// `category` is optional and additive: it names the section this item belongs
// to on the generated packing list, letting one long item list (always-needed,
// or a single option's items) split into several groups. Stamped on every item
// in a section rather than marking a boundary, so it survives per-item LWW
// merges and old clients intact — see the note in generatePackingListItems.
// Absent means "fall back to the option/question text" exactly as before.
// Quantity-suggestion fields, all optional and additive: the item's rate is
// "pack `perNight` per `perNights` nights" (perNights defaults to 1, so
// perNight alone means a per-night amount, e.g. socks 1/night; perNights: 4
// means e.g. one jumper every 4 nights). When a trip's number of nights is
// known, the suggested quantity is ceil(nights × perNight / perNights),
// capped at maxQuantity. Items without a rate behave exactly as before.
export const ItemSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  personSelections: z.array(PersonSelectionSchema),
  communal: z.boolean().optional(),
  ageRanges: z.array(AgeRangeSchema).optional(),
  order: z.number().optional(),
  category: z.string().optional(),
  perNight: z.number().optional(),
  perNights: z.number().optional(),
  maxQuantity: z.number().optional(),
  lastModified: z.string().optional(),
  deletedAt: z.string().optional(),
})

export const QuestionTypeSchema = z.enum(['single-choice', 'multiple-choice'])

// `emptySections` is optional and additive: the names of sections here that have
// no items in them yet.
//
// A section is otherwise only its items' `category` stamps, so one with nothing
// in it cannot be described at all — it existed solely as React state inside the
// reorder view and evaporated the moment you looked away. That made "make a
// Toiletries section, then fill it" unbuildable, and pushed section creation
// into the per-item Section field, where typing a new name is indistinguishable
// from renaming the section the item is already in.
//
// So the names are stored, and only while they are empty: whatever fills a
// section takes its name off this list, because from then on its items describe
// it. `sectionsOf` is what puts the two halves back together.
export const OptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  items: z.array(ItemSchema),
  order: z.number(),
  emptySections: z.array(z.string()).optional(),
})

const CommonQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(OptionSchema),
  order: z.number(),
  questionType: QuestionTypeSchema.optional(),
  lastModified: z.string().optional(),
  deletedAt: z.string().optional(),
})

export const DraftQuestionSchema = CommonQuestionSchema.extend({
  type: z.literal('draft')
})

export const SavedQuestionSchema = CommonQuestionSchema.extend({
  type: z.literal('saved')
})

export const QuestionSchema = z.union([DraftQuestionSchema, SavedQuestionSchema])

export const PackingListQuestionSetSchema = z.object({
  _id: z.string().optional(),
  _rev: z.string().optional(),
  people: z.array(PersonSchema),
  alwaysNeededItems: z.array(ItemSchema),
  // The always-needed list's own empty sections — same role as an option's
  // `emptySections`, for the one item list that doesn't belong to an option.
  alwaysNeededEmptySections: z.array(z.string()).optional(),
  questions: z.array(QuestionSchema),
  // The order the sections of a generated packing list come in — see
  // `section-order.ts`. Optional and additive: absent means the built-in
  // `CATEGORY_ORDER` default, which is what every set had before this existed.
  sectionOrder: z.array(z.string()).optional(),
  lastModified: z.string().optional(), // ISO timestamp for sync conflict resolution
  // Version of the wizard template this set was generated from / last
  // reconciled against. Absent means pre-versioning (treated as 0), so the
  // first template update is offered to every existing user. See
  // WIZARD_TEMPLATE_VERSION in example-data.ts.
  templateVersion: z.number().optional(),
})

// TypeScript Types (inferred from schemas)
export type Person = z.infer<typeof PersonSchema>
export type PersonSelection = z.infer<typeof PersonSelectionSchema>
export type Item = z.infer<typeof ItemSchema>
export type QuestionType = z.infer<typeof QuestionTypeSchema>
export type Option = z.infer<typeof OptionSchema>
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>
export type SavedQuestion = z.infer<typeof SavedQuestionSchema>
export type Question = z.infer<typeof QuestionSchema>
export type PackingListQuestionSet = z.infer<typeof PackingListQuestionSetSchema>

// Helper functions (unchanged)
export function newDraftQuestion(order: number): DraftQuestion {
  return {
    id: crypto.randomUUID(),
    type: "draft",
    text: "",
    options: [],
    order,
    questionType: "single-choice"
  }
}

// Renumber items to match their array position after an edit or reorder.
// Only moved items get a fresh lastModified, so sync's per-item LWW carries
// the new positions without phantom edits on untouched items.
export function renumberItemOrder(items: Item[], now: string): Item[] {
  return items.map((item, i) =>
    item.order === i ? item : { ...item, order: i, lastModified: now }
  )
}

export function newOption(order: number): Option {
  return {
    id: crypto.randomUUID(),
    text: "",
    items: [],
    order
  }
}
