import { useState, useEffect, useMemo } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { Modal } from '../components/Modal'
import { useDatabase } from '../components/DatabaseContext'
import { wizardSchema, WizardFormData, WizardEntry } from './wizard-types'
import { useWizardGeneration } from './useWizardGeneration'
import { AGE_RANGE_OPTIONS, GENDER_OPTIONS, PET_SPECIES_OPTIONS } from '../edit-questions/types'
import { deriveAgeRange } from '../edit-questions/age-derivation'
import { buildRevealSteps, buildGenerationSummary, REVEAL_STEP_MS } from './wizard-reveal'
import { peopleToWizardEntries } from './wizard-prefill'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'

export const Wizard = () => {
    const navigate = useNavigate()
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [showSuccessModal, setShowSuccessModal] = useState(false)
    const [hasExistingData, setHasExistingData] = useState(false)
    const [isPrefilled, setIsPrefilled] = useState(false)
    const [revealedCount, setRevealedCount] = useState(0)
    const [isRevealComplete, setIsRevealComplete] = useState(false)
    const { db } = useDatabase()
    const { isLoading, isSuccess, generatedSet, generateAndSave } = useWizardGeneration()

    const revealSteps = useMemo(
        () => (generatedSet ? buildRevealSteps(generatedSet) : []),
        [generatedSet]
    )
    const summary = useMemo(
        () => (generatedSet ? buildGenerationSummary(generatedSet) : null),
        [generatedSet]
    )

    const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<WizardFormData>({
        resolver: zodResolver(wizardSchema),
        defaultValues: {
            people: [{ kind: 'person', name: 'Me', ageRange: undefined, gender: undefined }],
        }
    })

    const { fields, append, remove, update } = useFieldArray({
        control,
        name: 'people'
    })

    // Check for existing data on mount, and start someone re-running the wizard
    // from the group they already set up rather than from a blank 'Me' row.
    useEffect(() => {
        const checkExistingData = async () => {
            try {
                const existingSet = await db.getQuestionSet()
                setHasExistingData(true)
                const existingEntries = peopleToWizardEntries(existingSet.people ?? [])
                if (existingEntries.length > 0) {
                    reset({ people: existingEntries })
                    setIsPrefilled(true)
                }
            } catch (err: unknown) {
                const hasName = typeof err === 'object' && err !== null && 'name' in err
                if (!hasName || (err as { name: string }).name !== 'not_found') {
                    console.error('Error checking for existing data:', err)
                }
                setHasExistingData(false)
            }
        }
        checkExistingData()
    }, [db, reset])

    // Open success modal when generation completes, starting the reveal at the
    // first person. Users who prefer reduced motion get the whole thing at once.
    useEffect(() => {
        if (!isSuccess) return
        setShowSuccessModal(true)
        if (revealSteps.length === 0 || prefersReducedMotion()) {
            setRevealedCount(revealSteps.length)
            setIsRevealComplete(true)
        } else {
            setRevealedCount(1)
            setIsRevealComplete(false)
        }
    }, [isSuccess, revealSteps])

    // Reveal one person per tick, then hand over to the summary. Bounded by
    // MAX_REVEAL_STEPS, and the Skip button jumps to the end at any point.
    useEffect(() => {
        if (!showSuccessModal || isRevealComplete) return
        if (revealedCount >= revealSteps.length) {
            setIsRevealComplete(true)
            return
        }
        const timer = setTimeout(() => setRevealedCount(count => count + 1), REVEAL_STEP_MS)
        return () => clearTimeout(timer)
    }, [showSuccessModal, isRevealComplete, revealedCount, revealSteps.length])

    const handleSkipReveal = () => {
        setRevealedCount(revealSteps.length)
        setIsRevealComplete(true)
    }

    // Onboarding never asks for a sign-in: the ask belongs where it pays off
    // (sharing a list, syncing across devices), not before there is anything
    // worth saving.
    const handleSuccessAction = (route: string) => {
        setShowSuccessModal(false)
        navigate(route)
    }

    // Dismissing the one success screen must not drop the user back on the
    // wizard form they have just finished — the questions are saved, so show
    // them, rather than an unchanged form that would regenerate over the top.
    const handleDismissSuccess = () => handleSuccessAction('/manage-questions')

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

    // Cast through unknown: react-hook-form seeds rows with empty (undefined)
    // selects, which the strict discriminated union doesn't model.
    const handleAddPerson = () => {
        append({ kind: 'person', name: `Person ${fields.length + 1}`, ageRange: undefined, gender: undefined } as unknown as WizardEntry)
    }

    const handleAddPet = () => {
        append({ kind: 'pet', name: `Pet ${fields.length + 1}`, species: undefined } as unknown as WizardEntry)
    }

    const handleRemovePerson = (index: number) => {
        if (fields.length > 1) {
            remove(index)
        } else {
            update(0, { kind: 'person', name: '', ageRange: undefined, gender: undefined } as unknown as WizardEntry)
        }
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="mb-8 text-center animate-slide-up">
                <h1 className="text-4xl font-bold mb-4 text-primary-900 dark:text-primary-200">
                    Create Your Packing Questions
                </h1>
                <p className="text-lg text-gray-700 dark:text-gray-300">
                    Tell us who you travel with — we'll generate a starter set of packing questions tailored to your group.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">
                    Do this once to get started. Afterwards, fine-tune your questions and packing items from 'My Questions &amp; Items' to match exactly what you need.
                </p>
            </div>

            {hasExistingData && (
                <div className="mb-6 p-4 bg-warning-50 dark:bg-warning-950/40 border-2 border-warning-300 dark:border-warning-700 rounded-2xl">
                    <p className="text-warning-900 dark:text-warning-200 font-semibold">
                        ⚠️ You already have packing list questions set up. Completing this wizard will replace them.
                    </p>
                    <p className="text-sm text-warning-800 dark:text-warning-200 mt-1">
                        To keep your existing questions, go to{' '}
                        <Link to="/manage-questions" className="underline font-semibold">Edit Questions</Link> instead.
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {/* People Section */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-soft border-2 border-primary-200 dark:border-primary-800">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold text-primary-900 dark:text-primary-200">👥 Who's Packing?</h2>
                        <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                            {fields.length} in your group
                        </span>
                    </div>

                    {isPrefilled && (
                        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                            We've filled in the people from your current setup — add, remove or change anyone before generating.
                        </p>
                    )}

                    <div className="space-y-4">
                        {fields.map((field, index) => {
                            const dob = field.kind === 'person' ? watch(`people.${index}.dateOfBirth`) : undefined
                            const derivedAgeRange = dob ? deriveAgeRange(dob) : undefined
                            return (
                            <div key={field.id} className="bg-primary-50 dark:bg-primary-950/40 p-4 rounded-xl border border-primary-200 dark:border-primary-800">
                                <div className="flex items-start gap-4">
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label htmlFor={`person-name-${index}`} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                Name
                                            </label>
                                            <input
                                                id={`person-name-${index}`}
                                                type="text"
                                                {...register(`people.${index}.name`)}
                                                className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-primary-500 dark:focus:border-primary-600 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 transition-all"
                                            />
                                            {errors.people?.[index]?.name && (
                                                <p className="text-danger-500 dark:text-danger-400 text-sm mt-1">{errors.people[index]?.name?.message}</p>
                                            )}
                                        </div>
                                        {field.kind === 'pet' ? (
                                            <div>
                                                <label htmlFor={`person-species-${index}`} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                    Species
                                                </label>
                                                <select
                                                    id={`person-species-${index}`}
                                                    {...register(`people.${index}.species`)}
                                                    className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-primary-500 dark:focus:border-primary-600 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 transition-all"
                                                >
                                                    <option value="">Select species...</option>
                                                    {PET_SPECIES_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {errors.people?.[index] && 'species' in errors.people[index]! && (
                                                    <p className="text-danger-500 dark:text-danger-400 text-sm mt-1">Species is required</p>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <label htmlFor={`person-birthday-${index}`} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                        Birthday <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                                                    </label>
                                                    <input
                                                        id={`person-birthday-${index}`}
                                                        type="date"
                                                        {...register(`people.${index}.dateOfBirth`, {
                                                            onChange: (e) => {
                                                                const derived = deriveAgeRange(e.target.value)
                                                                if (derived) setValue(`people.${index}.ageRange`, derived)
                                                            },
                                                        })}
                                                        className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-primary-500 dark:focus:border-primary-600 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 transition-all"
                                                    />
                                                    {derivedAgeRange && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Age group filled in from birthday — adjust it if they're ahead or behind</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <label htmlFor={`person-age-range-${index}`} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                        Age Range
                                                    </label>
                                                    <select
                                                        id={`person-age-range-${index}`}
                                                        {...register(`people.${index}.ageRange`)}
                                                        className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-primary-500 dark:focus:border-primary-600 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 transition-all"
                                                    >
                                                        <option value="">Select age range...</option>
                                                        {AGE_RANGE_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {errors.people?.[index] && 'ageRange' in errors.people[index]! && (
                                                        <p className="text-danger-500 dark:text-danger-400 text-sm mt-1">{(errors.people[index] as { ageRange?: { message?: string } }).ageRange?.message}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <label htmlFor={`person-gender-${index}`} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                        Gender
                                                    </label>
                                                    <select
                                                        id={`person-gender-${index}`}
                                                        {...register(`people.${index}.gender`)}
                                                        className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-primary-500 dark:focus:border-primary-600 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 transition-all"
                                                    >
                                                        <option value="">Select gender...</option>
                                                        {GENDER_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemovePerson(index)}
                                        className="mt-8 p-2 text-danger-500 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950/40 rounded-lg transition-colors"
                                        title={field.kind === 'pet' ? 'Remove pet' : 'Remove person'}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            )
                        })}
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={handleAddPerson}
                            className="w-full py-3 px-4 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl text-primary-700 dark:text-primary-300 font-semibold hover:border-primary-500 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            Add Another Person
                        </button>
                        <button
                            type="button"
                            onClick={handleAddPet}
                            className="w-full py-3 px-4 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl text-primary-700 dark:text-primary-300 font-semibold hover:border-primary-500 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            <span className="text-lg leading-none">🐾</span>
                            Add a Pet
                        </button>
                    </div>

                    {errors.people && typeof errors.people.message === 'string' && (
                        <p className="text-danger-500 dark:text-danger-400 text-sm mt-2">{errors.people.message}</p>
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
                        {isLoading ? '🔄 Generating...' : '✅ Generate My Packing Questions'}
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
                onClose={handleDismissSuccess}
                title="🎉 Questions Generated Successfully!"
            >
                <div className="space-y-6">
                    {revealSteps.length > 0 && (
                        <ul aria-live="polite" className="space-y-2 text-left">
                            {revealSteps.slice(0, revealedCount).map(step => (
                                <li
                                    key={step.personId}
                                    className="reveal-line flex gap-2 text-gray-700 dark:text-gray-300 break-words"
                                >
                                    <span aria-hidden="true">✨</span>
                                    <span className="flex-1 min-w-0">{step.text}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!isRevealComplete && (
                        <div className="flex justify-center">
                            <button
                                onClick={handleSkipReveal}
                                className="text-sm font-semibold text-primary-700 dark:text-primary-300 underline hover:text-primary-900 dark:hover:text-primary-200"
                            >
                                Skip ›
                            </button>
                        </div>
                    )}

                    {isRevealComplete && (
                        <>
                            {summary && (
                                <p className="text-center font-bold text-primary-900 dark:text-primary-200 break-words">
                                    {summary.text}
                                </p>
                            )}

                            <p className="text-gray-700 dark:text-gray-300 text-center">
                                Your starter questions are ready! Head to 'My Questions &amp; Items' to add, remove, or tweak them to match how you travel — then create your first list.
                            </p>

                            <div className="space-y-3">
                                <button
                                    onClick={() => handleSuccessAction('/create-packing-list')}
                                    className="w-full bg-gradient-primary-button text-white px-4 sm:px-6 py-4 rounded-xl font-bold text-base sm:text-lg break-words motion-safe:hover:scale-105 transition-all duration-200 shadow-soft hover:shadow-glow-primary"
                                >
                                    🚀 Create My First Packing List
                                </button>

                                <button
                                    onClick={() => handleSuccessAction('/manage-questions')}
                                    className="w-full text-primary-700 dark:text-primary-300 border-2 border-primary-200 dark:border-primary-800 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 px-4 sm:px-6 py-3 rounded-xl font-semibold text-sm sm:text-base break-words transition-all duration-200"
                                >
                                    ✏️ Refine My Packing List Questions
                                </button>
                            </div>

                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-4">
                                You can always access these options from the navigation menu above
                            </p>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    )
}
