import { z } from 'zod'

// Zod Schemas
export const PersonSchema = z.object({
  id: z.string(),
  name: z.string()
})

export const PersonSelectionSchema = z.object({
  personId: z.string(),
  selected: z.boolean()
})

export const ItemSchema = z.object({
  text: z.string(),
  personSelections: z.array(PersonSelectionSchema)
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
  questionType: QuestionTypeSchema.optional() // Optional for backward compatibility
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
