import { useState } from 'react'
import { useToast } from '../hooks/useToast'
import { packingAppDb } from '../services/database'
import { createExampleData } from '../edit-questions/example-data'
import { QUESTION_SET_ID } from '../constants'
import { WizardFormData } from './wizard-types'

export function useWizardGeneration() {
    const { showToast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    const generateQuestionSet = (data: WizardFormData) => {
        const names = data.people.map(p => p.name)
        return createExampleData(data.people.length, names)
    }

    const generateAndSave = async (data: WizardFormData) => {
        setIsLoading(true)
        setIsSuccess(false)
        try {
            const questionSet = generateQuestionSet(data)

            await packingAppDb.saveQuestionSet({
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
