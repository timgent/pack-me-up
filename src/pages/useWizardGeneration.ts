import { useState } from 'react'
import { useToast } from '../components/ToastContext'
import { useDatabase } from '../components/DatabaseContext'
import { createExampleData } from '../edit-questions/example-data'
import { QUESTION_SET_ID } from '../constants'
import { WizardFormData } from './wizard-types'
import { generateUUID } from '../utils/uuid'
import { Person } from '../edit-questions/types'

export function useWizardGeneration() {
    const { showToast } = useToast()
    const { db } = useDatabase()
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    const generateQuestionSet = (data: WizardFormData) => {
        const people: Person[] = data.people.map(p => ({
            id: generateUUID(),
            name: p.name,
            ageRange: p.ageRange
        }))
        return createExampleData(people, data.activities)
    }

    const generateAndSave = async (data: WizardFormData) => {
        setIsLoading(true)
        setIsSuccess(false)
        try {
            const questionSet = generateQuestionSet(data)

            await db.saveQuestionSet({
                _id: QUESTION_SET_ID,
                ...questionSet
            })

            showToast('Packing list questions generated successfully!', 'success')
            setIsSuccess(true)
        } catch (err) {
            console.error('Error generating question set:', err)
            showToast('Failed to generate question set', 'error')
        } finally {
            setIsLoading(false)
        }
    }

    return {
        isLoading,
        isSuccess,
        generateAndSave
    }
}
