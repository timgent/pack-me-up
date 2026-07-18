import { z } from 'zod'
import { AgeRangeSchema, GenderSchema, PetSpeciesSchema } from '../edit-questions/types'

// A person entry keeps age range + gender, and optionally a date of birth.
// The age-range select submits '' when untouched, so '' is allowed here and
// treated as "not set"; requiring either an age range or a birthday is
// enforced at the form level below (discriminated unions can't carry
// refinements, and transforms would break react-hook-form's resolver types).
export const wizardPersonSchema = z.object({
    kind: z.literal('person'),
    name: z.string().min(1, 'Name is required'),
    dateOfBirth: z.string().optional(),
    ageRange: AgeRangeSchema.or(z.literal('')).optional(),
    gender: GenderSchema,
})

// A pet entry captures a species instead of age/gender.
export const wizardPetSchema = z.object({
    kind: z.literal('pet'),
    name: z.string().min(1, 'Name is required'),
    species: PetSpeciesSchema,
})

export const wizardEntrySchema = z.discriminatedUnion('kind', [wizardPersonSchema, wizardPetSchema])

export const wizardSchema = z.object({
    people: z.array(wizardEntrySchema)
        .min(1, 'At least 1 person or pet required')
        .max(10, 'Maximum of 10 reached'),
}).superRefine((data, ctx) => {
    data.people.forEach((entry, index) => {
        if (entry.kind === 'person' && !entry.ageRange && !entry.dateOfBirth) {
            ctx.addIssue({
                code: 'custom',
                path: ['people', index, 'ageRange'],
                message: 'Pick an age range or enter a birthday',
            })
        }
    })
})

export type WizardPersonEntry = z.infer<typeof wizardPersonSchema>
export type WizardPetEntry = z.infer<typeof wizardPetSchema>
export type WizardEntry = z.infer<typeof wizardEntrySchema>
export type WizardFormData = z.infer<typeof wizardSchema>
