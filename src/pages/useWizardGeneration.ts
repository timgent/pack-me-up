import { useState } from 'react'
import { useToast } from '../components/ToastContext'
import { reportError } from '../errorReporting'
import { useDatabase } from '../components/DatabaseContext'
import { createExampleData, WIZARD_TEMPLATE_VERSION } from '../edit-questions/example-data'
import { QUESTION_SET_ID } from '../constants'
import { WizardFormData } from './wizard-types'
import { generateUUID } from '../utils/uuid'
import { Person, PackingListQuestionSet } from '../edit-questions/types'
import { deriveAgeRange } from '../edit-questions/age-derivation'
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
                : {
                    id: generateUUID(),
                    name: entry.name,
                    // The select is auto-filled from the birthday but stays
                    // editable, so the (possibly overridden) selection wins;
                    // '' is the untouched select
                    ageRange: (entry.ageRange || undefined) ?? (entry.dateOfBirth ? deriveAgeRange(entry.dateOfBirth) : undefined),
                    gender: entry.gender,
                    ...(entry.dateOfBirth ? { dateOfBirth: entry.dateOfBirth } : {}),
                }
        )
        return { ...createExampleData(people, []), templateVersion: WIZARD_TEMPLATE_VERSION }
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
            const details = reportError(err, 'Error generating question set')
            showToast('Failed to generate question set', 'error', details)
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
