import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/ToastContext'
import { packingAppDb } from '../services/database'
import { createExampleData } from '../edit-questions/example-data'
import { QUESTION_SET_ID } from '../constants'
import { WizardFormData } from './wizard-types'

export function useWizardGeneration() {
    const navigate = useNavigate()
    const { showToast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    const generateQuestionSet = (data: WizardFormData) => {
        const names = data.people.map(p => p.name)
        return createExampleData(data.numPeople, names)
    }

    const saveAndNavigate = async (data: WizardFormData) => {
        setIsLoading(true)
        try {
            const questionSet = generateQuestionSet(data)

            await packingAppDb.saveQuestionSet({
                _id: QUESTION_SET_ID,
                ...questionSet
            })

            showToast('Packing list questions generated successfully!', 'success')
            navigate('/manage-questions')
        } catch (err) {
            console.error('Error generating question set:', err)
            showToast('Failed to generate question set', 'error')
        } finally {
            setIsLoading(false)
        }
    }

    return {
        isLoading,
        saveAndNavigate
    }
}
