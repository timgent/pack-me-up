import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { useToast } from '../components/ToastContext'
import { packingAppDb } from '../services/database'
import { createExampleData } from '../edit-questions/example-data'

interface WizardFormData {
    numPeople: number
    people: { name: string; age: string }[]
    activities: {
        swimming: boolean
        outdoorSwimming: boolean
        outdoorWatersports: boolean
        cycling: boolean
        climbing: boolean
    }
}

export const Wizard = () => {
    const navigate = useNavigate()
    const { showToast } = useToast()
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [hasExistingData, setHasExistingData] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const { register, control, handleSubmit, watch, formState: { errors } } = useForm<WizardFormData>({
        defaultValues: {
            numPeople: 1,
            people: [{ name: 'Me', age: '' }],
            activities: {
                swimming: false,
                outdoorSwimming: false,
                outdoorWatersports: false,
                cycling: false,
                climbing: false
            }
        }
    })

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'people'
    })

    const numPeople = watch('numPeople')

    // Check for existing data on mount
    useEffect(() => {
        const checkExistingData = async () => {
            try {
                await packingAppDb.getQuestionSet()
                setHasExistingData(true)
            } catch (err: any) {
                if (err.name !== 'not_found') {
                    console.error('Error checking for existing data:', err)
                }
                setHasExistingData(false)
            }
        }
        checkExistingData()
    }, [])

    // Adjust people array when numPeople changes
    useEffect(() => {
        const currentLength = fields.length
        if (numPeople > currentLength) {
            for (let i = currentLength; i < numPeople; i++) {
                append({ name: i === 0 ? 'Me' : `Person ${i + 1}`, age: '' })
            }
        } else if (numPeople < currentLength) {
            for (let i = currentLength - 1; i >= numPeople; i--) {
                remove(i)
            }
        }
    }, [numPeople, fields.length, append, remove])

    const onSubmit = async (data: WizardFormData) => {
        if (hasExistingData) {
            setShowConfirmDialog(true)
        } else {
            await generateAndSaveQuestionSet(data)
        }
    }

    const handleConfirmOverride = async () => {
        setShowConfirmDialog(false)
        const data = watch()
        await generateAndSaveQuestionSet(data)
    }

    const generateAndSaveQuestionSet = async (data: WizardFormData) => {
        setIsLoading(true)
        try {
            // Generate example data for the specified number of people
            const exampleQuestionSet = createExampleData(data.numPeople)

            // Update person names and ages if provided
            exampleQuestionSet.people = exampleQuestionSet.people.map((person, index) => ({
                ...person,
                name: data.people[index]?.name || person.name
            }))

            // Save to database
            await packingAppDb.saveQuestionSet({
                _id: '1',
                ...exampleQuestionSet
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

    return (
        <div className="max-w-3xl mx-auto">
            <div className="mb-8 text-center animate-slide-up">
                <h1 className="text-4xl font-bold mb-4 text-primary-900">
                    Welcome! Let's Get Started
                </h1>
                <p className="text-lg text-gray-700">
                    Answer a few quick questions to set up your personalized packing list
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {/* Number of People Section */}
                <div className="bg-white p-6 rounded-2xl shadow-soft border-2 border-primary-200">
                    <h2 className="text-2xl font-bold mb-4 text-primary-900">👥 Who's Packing?</h2>

                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            How many people are you packing for?
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            {...register('numPeople', {
                                required: true,
                                min: 1,
                                max: 10,
                                valueAsNumber: true
                            })}
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                        />
                        {errors.numPeople && (
                            <p className="text-danger-500 text-sm mt-1">Please enter a number between 1 and 10</p>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800">Tell us about each person:</h3>
                        {fields.map((field, index) => (
                            <div key={field.id} className="bg-primary-50 p-4 rounded-xl border border-primary-200">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Name
                                        </label>
                                        <input
                                            type="text"
                                            {...register(`people.${index}.name`, { required: true })}
                                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Age (optional)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., 5, 12, Adult"
                                            {...register(`people.${index}.age`)}
                                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activities Section */}
                <div className="bg-white p-6 rounded-2xl shadow-soft border-2 border-secondary-200">
                    <h2 className="text-2xl font-bold mb-4 text-secondary-900">🏖️ What Activities Are You Planning?</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Select all that apply (this will help us customize your packing list in future iterations)
                    </p>

                    <div className="space-y-3">
                        <label className="flex items-center space-x-3 p-3 rounded-xl hover:bg-secondary-50 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('activities.swimming')}
                                className="w-5 h-5 text-secondary-600 rounded focus:ring-2 focus:ring-secondary-500"
                            />
                            <span className="text-gray-800 font-medium">Swimming (pool)</span>
                        </label>

                        <label className="flex items-center space-x-3 p-3 rounded-xl hover:bg-secondary-50 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('activities.outdoorSwimming')}
                                className="w-5 h-5 text-secondary-600 rounded focus:ring-2 focus:ring-secondary-500"
                            />
                            <span className="text-gray-800 font-medium">Outdoor swimming (beach, lake, river)</span>
                        </label>

                        <label className="flex items-center space-x-3 p-3 rounded-xl hover:bg-secondary-50 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('activities.outdoorWatersports')}
                                className="w-5 h-5 text-secondary-600 rounded focus:ring-2 focus:ring-secondary-500"
                            />
                            <span className="text-gray-800 font-medium">Outdoor watersports (surfing, kayaking, etc.)</span>
                        </label>

                        <label className="flex items-center space-x-3 p-3 rounded-xl hover:bg-secondary-50 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('activities.cycling')}
                                className="w-5 h-5 text-secondary-600 rounded focus:ring-2 focus:ring-secondary-500"
                            />
                            <span className="text-gray-800 font-medium">Cycling</span>
                        </label>

                        <label className="flex items-center space-x-3 p-3 rounded-xl hover:bg-secondary-50 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                {...register('activities.climbing')}
                                className="w-5 h-5 text-secondary-600 rounded focus:ring-2 focus:ring-secondary-500"
                            />
                            <span className="text-gray-800 font-medium">Climbing</span>
                        </label>
                    </div>
                </div>

                {/* Submit Button */}
                <div className="flex justify-center">
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={isLoading}
                        className="px-8 py-4 text-lg"
                    >
                        {isLoading ? '🔄 Generating...' : '✨ Generate My Packing List Questions'}
                    </Button>
                </div>
            </form>

            {/* Confirmation Dialog */}
            <Modal
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                title="⚠️ Existing Data Found"
            >
                <div className="space-y-4">
                    <p className="text-gray-700">
                        You already have packing list questions set up. Generating a new set will override your current questions.
                    </p>
                    <p className="text-gray-700 font-semibold">
                        Are you sure you want to continue?
                    </p>
                    <div className="flex gap-3 justify-end mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => setShowConfirmDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleConfirmOverride}
                        >
                            Yes, Override
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
