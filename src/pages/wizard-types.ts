import { z } from 'zod'

export const ACTIVITIES = [
    { id: 'swimming', label: 'Swimming (pool)', icon: '🏊' },
    { id: 'outdoor-swimming', label: 'Outdoor swimming (beach, lake, river)', icon: '🏖️' },
    { id: 'outdoor-watersports', label: 'Outdoor watersports (surfing, kayaking, etc.)', icon: '🏄' },
    { id: 'cycling', label: 'Cycling', icon: '🚴' },
    { id: 'climbing', label: 'Climbing', icon: '🧗' },
] as const

export type ActivityId = typeof ACTIVITIES[number]['id']

export const wizardSchema = z.object({
    people: z.array(z.object({
        name: z.string().min(1, 'Name is required'),
        age: z.string().optional()
    })).min(1, 'At least 1 person required').max(10, 'Maximum 10 people allowed'),
    activities: z.array(z.string())
})

export type WizardFormData = z.infer<typeof wizardSchema>
