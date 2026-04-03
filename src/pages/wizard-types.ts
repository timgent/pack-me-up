import { z } from 'zod'
import { AgeRangeSchema, GenderSchema } from '../edit-questions/types'

export const wizardSchema = z.object({
    people: z.array(z.object({
        name: z.string().min(1, 'Name is required'),
        ageRange: AgeRangeSchema.optional(),
        gender: GenderSchema.optional()
    })).min(1, 'At least 1 person required').max(10, 'Maximum 10 people allowed'),
})

export type WizardFormData = z.infer<typeof wizardSchema>
