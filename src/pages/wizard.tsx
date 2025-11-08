import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { packingAppDb } from '../services/database'
import { ACTIVITIES, wizardSchema, WizardFormData } from './wizard-types'
import { useWizardGeneration } from './useWizardGeneration'

export const Wizard = () => {
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [hasExistingData, setHasExistingData] = useState(false)
    const { isLoading, saveAndNavigate } = useWizardGeneration()

    const { register, control, handleSubmit, watch, formState: { errors } } = useForm<WizardFormData>({
        resolver: zodResolver(wizardSchema),
        defaultValues: {
            numPeople: 1,
            people: [{ name: 'Me', age: '' }],
            activities: []
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
            await saveAndNavigate(data)
        }
    }

    const handleConfirmOverride = async () => {
        setShowConfirmDialog(false)
        const data = watch()
        await saveAndNavigate(data)
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
                                valueAsNumber: true
                            })}
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                        />
                        {errors.numPeople && (
                            <p className="text-danger-500 text-sm mt-1">{errors.numPeople.message}</p>
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
                                            {...register(`people.${index}.name`)}
                                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                        />
                                        {errors.people?.[index]?.name && (
                                            <p className="text-danger-500 text-sm mt-1">{errors.people[index]?.name?.message}</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Age{' '}
                                            <span className="text-xs text-gray-500 font-normal">
                                                (Coming in future version)
                                            </span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., 5, 12, Adult"
                                            {...register(`people.${index}.age`)}
                                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all opacity-60"
                                            disabled
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
                    <div className="mb-4 p-3 bg-accent-50 border border-accent-200 rounded-xl">
                        <p className="text-sm text-accent-900 font-medium">
                            💡 Coming Soon: Activity-based customization will be available in a future update!
                        </p>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                        Select all that apply (this information will be used to customize your packing list in future iterations)
                    </p>

                    <div className="space-y-3 opacity-60">
                        {ACTIVITIES.map((activity) => (
                            <label
                                key={activity.id}
                                className="flex items-center space-x-3 p-3 rounded-xl hover:bg-secondary-50 transition-colors cursor-not-allowed"
                            >
                                <input
                                    type="checkbox"
                                    value={activity.id}
                                    {...register('activities')}
                                    className="w-5 h-5 text-secondary-600 rounded focus:ring-2 focus:ring-secondary-500"
                                    disabled
                                />
                                <span className="text-gray-800 font-medium">
                                    {activity.icon} {activity.label}
                                </span>
                            </label>
                        ))}
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
        </div>
    )
}
