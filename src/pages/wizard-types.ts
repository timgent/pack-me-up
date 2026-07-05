import { z } from 'zod'
import { AgeRangeSchema, GenderSchema, PetSpeciesSchema } from '../edit-questions/types'

// A person entry keeps age range + gender.
export const wizardPersonSchema = z.object({
    kind: z.literal('person'),
    name: z.string().min(1, 'Name is required'),
    ageRange: AgeRangeSchema,
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
})

export type WizardPersonEntry = z.infer<typeof wizardPersonSchema>
export type WizardPetEntry = z.infer<typeof wizardPetSchema>
export type WizardEntry = z.infer<typeof wizardEntrySchema>
export type WizardFormData = z.infer<typeof wizardSchema>
