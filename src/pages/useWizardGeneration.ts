import { useState } from 'react'
import { useToast } from '../components/ToastContext'
import { reportError } from '../errorReporting'
import { useDatabase } from '../components/DatabaseContext'
import { createExampleData } from '../edit-questions/example-data'
import { QUESTION_SET_ID } from '../constants'
import { WizardFormData } from './wizard-types'
import { generateUUID } from '../utils/uuid'
import { Person, PackingListQuestionSet } from '../edit-questions/types'
import { usePodSync } from '../hooks/usePodSync'
import { useSyncCoordinator } from '../hooks/useSyncCoordinator'
import { POD_CONTAINERS } from '../services/solidPod'
import { questionSetToDataset, datasetToQuestionSet } from '../services/rdfSerialization'

export function useWizardGeneration() {
    const { showToast } = useToast()
    const { db } = useDatabase()
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    const { saveToPod } = usePodSync<PackingListQuestionSet>({
        pathConfig: {
            container: POD_CONTAINERS.ROOT,
            filename: 'packing-list-questions.ttl'
        },
        rdf: { serialize: questionSetToDataset, deserialize: datasetToQuestionSet },
    })

    const { saveWithSyncPrevention } = useSyncCoordinator<PackingListQuestionSet>({
        currentData: null,
        saveToLocalDb: (data) => db.saveQuestionSet(data),
        updateFormAndState: () => {},
    })

    const generateQuestionSet = (data: WizardFormData) => {
        const people: Person[] = data.people.map(entry =>
            entry.kind === 'pet'
                ? { id: generateUUID(), name: entry.name, species: entry.species }
                : { id: generateUUID(), name: entry.name, ageRange: entry.ageRange, gender: entry.gender }
        )
        return createExampleData(people, [])
    }

    const generateAndSave = async (data: WizardFormData) => {
        setIsLoading(true)
        setIsSuccess(false)
        try {
            const questionSet = generateQuestionSet(data)

            await saveWithSyncPrevention(
                { _id: QUESTION_SET_ID, ...questionSet },
                saveToPod
            )

            showToast('Packing list questions generated successfully!', 'success')
            setIsSuccess(true)
        } catch (err) {
            reportError(err, 'Error generating question set')
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
