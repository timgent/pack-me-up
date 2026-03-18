import { z } from 'zod'
import { AgeRangeSchema } from '../edit-questions/types'
import { ACTIVITY_OPTION_IDS } from '../edit-questions/example-data'

export const ACTIVITIES = [
    { id: ACTIVITY_OPTION_IDS.swimming, label: 'Swimming (pool)', icon: '🏊' },
    { id: ACTIVITY_OPTION_IDS.watersports, label: 'Watersports (surfing, kayaking, beach & lake swimming)', icon: '🏄' },
    { id: ACTIVITY_OPTION_IDS.cycling, label: 'Cycling', icon: '🚴' },
    { id: ACTIVITY_OPTION_IDS.climbing, label: 'Climbing', icon: '🧗' },
    { id: ACTIVITY_OPTION_IDS.hiking, label: 'Hiking', icon: '🥾' },
] as const

export type ActivityId = typeof ACTIVITIES[number]['id']

export const wizardSchema = z.object({
    people: z.array(z.object({
        name: z.string().min(1, 'Name is required'),
        ageRange: AgeRangeSchema.optional()
    })).min(1, 'At least 1 person required').max(10, 'Maximum 10 people allowed'),
    activities: z.array(z.string())
})

export type WizardFormData = z.infer<typeof wizardSchema>
