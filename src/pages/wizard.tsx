import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { Modal } from '../components/Modal'
import { SolidPodPrompt } from '../components/SolidPodPrompt'
import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { wizardSchema, WizardFormData } from './wizard-types'
import { useWizardGeneration } from './useWizardGeneration'
import { AGE_RANGE_OPTIONS } from '../edit-questions/types'

const SOLID_POD_UPSELL_SHOWN_KEY = 'solid-pod-upsell-shown'

export const Wizard = () => {
    const navigate = useNavigate()
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [showPodPrompt, setShowPodPrompt] = useState(false)
    const [showSuccessModal, setShowSuccessModal] = useState(false)
    const [pendingNavRoute, setPendingNavRoute] = useState<string | null>(null)
    const [hasExistingData, setHasExistingData] = useState(false)
    const { isLoggedIn } = useSolidPod()
    const { db } = useDatabase()
    const { isLoading, isSuccess, generateAndSave } = useWizardGeneration()

    const { register, control, handleSubmit, watch, formState: { errors } } = useForm<WizardFormData>({
        resolver: zodResolver(wizardSchema),
        defaultValues: {
            people: [{ name: 'Me', ageRange: undefined }],
        }
    })

    const { fields, append, remove, update } = useFieldArray({
        control,
        name: 'people'
    })

    // Check for existing data on mount
    useEffect(() => {
        const checkExistingData = async () => {
            try {
                await db.getQuestionSet()
                setHasExistingData(true)
            } catch (err: unknown) {
                const hasName = typeof err === 'object' && err !== null && 'name' in err
                if (!hasName || (err as { name: string }).name !== 'not_found') {
                    console.error('Error checking for existing data:', err)
                }
                setHasExistingData(false)
            }
        }
        checkExistingData()
    }, [db])

    // Open success modal when generation completes
    useEffect(() => {
        if (isSuccess) setShowSuccessModal(true)
    }, [isSuccess])

    const handleSuccessAction = (route: string) => {
        setShowSuccessModal(false)
        if (!isLoggedIn) {
            const dismissed = localStorage.getItem(SOLID_POD_UPSELL_SHOWN_KEY) === 'true'
            if (!dismissed) {
                setPendingNavRoute(route)
                setShowPodPrompt(true)
                return
            }
        }
        navigate(route)
    }

    const handlePodPromptClose = () => {
        setShowPodPrompt(false)
        if (pendingNavRoute) {
            navigate(pendingNavRoute)
            setPendingNavRoute(null)
        }
    }

    const onSubmit = async (data: WizardFormData) => {
        if (hasExistingData) {
            setShowConfirmDialog(true)
        } else {
            await generateAndSave(data)
        }
    }

    const handleConfirmOverride = async () => {
        setShowConfirmDialog(false)
        const data = watch()
        await generateAndSave(data)
    }

    const handleAddPerson = () => {
        append({ name: `Person ${fields.length + 1}`, ageRange: undefined })
    }

    const handleRemovePerson = (index: number) => {
        if (fields.length > 1) {
            remove(index)
        } else {
            update(0, { name: '', ageRange: undefined })
        }
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="mb-8 text-center animate-slide-up">
                <h1 className="text-4xl font-bold mb-4 text-primary-900">
                    Set Up Your Family Profile
                </h1>
                <p className="text-lg text-gray-700">
                    Tell us who you travel with — we'll use this to personalise your packing lists every time
                </p>
                <p className="text-sm text-gray-500 mt-2 italic">
                    You only need to do this once. You can always update your family profile later.
                </p>
            </div>

            {hasExistingData && (
                <div className="mb-6 p-4 bg-warning-50 border-2 border-warning-300 rounded-2xl">
                    <p className="text-warning-900 font-semibold">
                        ⚠️ You already have packing list questions set up. Completing this wizard will replace them.
                    </p>
                    <p className="text-sm text-warning-800 mt-1">
                        To keep your existing questions, go to{' '}
                        <Link to="/manage-questions" className="underline font-semibold">Edit Questions</Link> instead.
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {/* People Section */}
                <div className="bg-white p-6 rounded-2xl shadow-soft border-2 border-primary-200">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold text-primary-900">👥 Who's Packing?</h2>
                        <span className="text-sm text-gray-600 font-medium">
                            {fields.length} {fields.length === 1 ? 'person' : 'people'}
                        </span>
                    </div>

                    <div className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="bg-primary-50 p-4 rounded-xl border border-primary-200">
                                <div className="flex items-start gap-4">
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Name
                                            </label>
                                            <input
                                                type="text"
                                                {...register(`people.${index}.name`)}
                                                className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                            />
                                            {errors.people?.[index]?.name && (
                                                <p className="text-danger-500 text-sm mt-1">{errors.people[index]?.name?.message}</p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Age Range{' '}
                                                <span className="text-xs text-gray-500 font-normal">
                                                    (optional)
                                                </span>
                                            </label>
                                            <select
                                                {...register(`people.${index}.ageRange`)}
                                                className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                            >
                                                <option value="">Select age range...</option>
                                                {AGE_RANGE_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {errors.people?.[index]?.ageRange && (
                                                <p className="text-danger-500 text-sm mt-1">{errors.people[index]?.ageRange?.message}</p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemovePerson(index)}
                                        className="mt-8 p-2 text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
                                        title="Remove person"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {fields.length < 10 && (
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={handleAddPerson}
                                className="w-full py-3 px-4 border-2 border-dashed border-primary-300 rounded-xl text-primary-700 font-semibold hover:border-primary-500 hover:bg-primary-50 transition-all duration-200 flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                Add Another Person
                            </button>
                        </div>
                    )}

                    {fields.length >= 10 && (
                        <p className="mt-4 text-sm text-gray-600 text-center">
                            Maximum of 10 people reached
                        </p>
                    )}

                    {errors.people && typeof errors.people.message === 'string' && (
                        <p className="text-danger-500 text-sm mt-2">{errors.people.message}</p>
                    )}
                </div>

                {/* Submit Button */}
                <div className="flex justify-center">
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={isLoading}
                        className="px-8 py-4 text-lg"
                    >
                        {isLoading ? '🔄 Saving...' : '✅ Save My Family Profile'}
                    </Button>
                </div>
            </form>

            {/* Confirmation Dialog */}
            <ConfirmationDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={handleConfirmOverride}
                title="⚠️ Existing Data Found"
                message="You already have packing list questions set up. Generating a new set will override your current questions.

Are you sure you want to continue?"
                confirmText="Yes, Override"
                cancelText="Cancel"
                confirmVariant="danger"
            />

            {/* Success Modal */}
            <Modal
                isOpen={showSuccessModal}
                onClose={() => {}}
                title="🎉 Questions Generated Successfully!"
            >
                <div className="space-y-6">
                    <p className="text-gray-700 text-center">
                        Your packing list questions are ready! What would you like to do next?
                    </p>

                    <div className="space-y-4">
                        <button
                            onClick={() => handleSuccessAction('/create-packing-list')}
                            className="w-full bg-gradient-primary text-white px-6 py-4 rounded-xl font-bold text-lg hover:scale-105 transition-all duration-200 shadow-soft hover:shadow-glow-primary"
                        >
                            🚀 Create My First Packing List
                        </button>

                        <button
                            onClick={() => handleSuccessAction('/manage-questions')}
                            className="w-full bg-gradient-secondary text-white px-6 py-4 rounded-xl font-bold text-lg hover:scale-105 transition-all duration-200 shadow-soft hover:shadow-glow-secondary"
                        >
                            ✏️ Refine My Packing List Questions
                        </button>
                    </div>

                    <p className="text-sm text-gray-500 text-center mt-4">
                        You can always access these options from the navigation menu above
                    </p>
                </div>
            </Modal>

            {/* Solid Pod Onboarding Prompt */}
            <SolidPodPrompt
                isOpen={showPodPrompt}
                onClose={handlePodPromptClose}
                title="🎉 Great! Your Questions Are Ready"
                message="Want to keep your personalized packing questions safe and accessible from any device? Set up a Solid Pod to store your data securely in personal storage that you control."
                dismissalKey={SOLID_POD_UPSELL_SHOWN_KEY}
            />
        </div>
    )
}
