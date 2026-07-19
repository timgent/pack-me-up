import { z } from 'zod'

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
export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  ageRange: AgeRangeSchema.optional(),
  dateOfBirth: z.string().optional(),
  gender: GenderSchema.optional(),
  species: PetSpeciesSchema.optional(),
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
  perNight: z.number().optional(),
  perNights: z.number().optional(),
  maxQuantity: z.number().optional(),
  lastModified: z.string().optional(),
  deletedAt: z.string().optional(),
})

export const QuestionTypeSchema = z.enum(['single-choice', 'multiple-choice'])

export const OptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  items: z.array(ItemSchema),
  order: z.number()
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
  questions: z.array(QuestionSchema),
  lastModified: z.string().optional() // ISO timestamp for sync conflict resolution
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

export function newOption(order: number): Option {
  return {
    id: crypto.randomUUID(),
    text: "",
    items: [],
    order
  }
}
