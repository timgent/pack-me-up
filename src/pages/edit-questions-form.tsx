import { useEffect, useState } from 'react'
import { useForm, SubmitHandler, useFieldArray } from "react-hook-form"
import { PackingListQuestionSet, newDraftQuestion } from '../edit-questions/types'
import { packingAppDb } from '../services/database'
import { DatabaseMigration } from '../services/migration'
import { QuestionSection } from '../edit-questions/question-section'
import { PeopleSection } from '../edit-questions/people-section'
import { Button } from '../components/Button'
import { useToast } from '../components/ToastContext'
import { AlwaysNeededItemsSection } from '../edit-questions/always-needed-items-section'
import { Modal } from '../components/Modal'
import { exampleData } from '../edit-questions/example-data'
import { Callout } from '../components/Callout'
import { exportFile } from '../utils/exportFile'
import { login } from "@inrupt/solid-client-authn-browser"

export function EditQuestionsForm() {

    const { register, control, handleSubmit, setValue, watch, reset, getValues } = useForm<PackingListQuestionSet>({
        defaultValues: { questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] }
    });
    const [rev, setRev] = useState<string | undefined>(undefined)
    const [isExampleModalOpen, setIsExampleModalOpen] = useState(false)
    const { fields: peopleFields, append: appendPeople, remove: removePeople } = useFieldArray({
        control,
        name: "people"
    });
    const { showToast } = useToast();

    const removePerson = (removedIndex: number) => {
        // We need this wrapper for removing people to correctly removed the check boxes for that person
        getValues("questions").forEach((_question, questionIndex) => {
            getValues(`questions.${questionIndex}.options`).forEach((_option, optionIndex) => {
                getValues(`questions.${questionIndex}.options.${optionIndex}.items`).forEach((_item, itemIndex) => {
                    const currentPersonSelections = getValues(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}.personSelections`)
                    currentPersonSelections.splice(removedIndex, 1)
                })
            })
        })
        removePeople(removedIndex)
    }

    const people = watch("people")

    useEffect(() => {
        const loadQuestionSet = async () => {
            console.log("Starting document load sequence")

            try {
                // Check if migration is needed
                const migrationCheck = await DatabaseMigration.checkMigrationNeeded()
                if (migrationCheck.needed) {
                    console.log('Migration needed, performing automatic migration')
                    const migrationResult = await DatabaseMigration.performMigration()
                    if (!migrationResult.success) {
                        console.error('Migration failed:', migrationResult.errors)
                        showToast('Database migration failed', 'error')
                        return
                    }
                    showToast('Database migrated successfully', 'success')
                }

                const doc = await packingAppDb.getQuestionSet()
                console.log("Document retrieved successfully:", {
                    _id: doc._id,
                    _rev: doc._rev,
                    timestamp: new Date().toISOString()
                })
                setRev(doc._rev)
                reset(doc)
            } catch (err: any) {
                console.log("Initial get error:", {
                    name: err.name,
                    message: err.message,
                    timestamp: new Date().toISOString()
                })
                if (err.name === 'not_found') {
                    console.log('No data yet, creating new doc')
                    const newDoc = {
                        _id: "1",
                        questions: [],
                        people: [{ id: crypto.randomUUID(), name: "Me" }],
                        alwaysNeededItems: []
                    }
                    console.log("Attempting to create new doc:", {
                        doc: newDoc,
                        timestamp: new Date().toISOString()
                    })
                    try {
                        const result = await packingAppDb.saveQuestionSet(newDoc)
                        console.log("Document created successfully:", {
                            rev: result.rev,
                            timestamp: new Date().toISOString()
                        })
                        setRev(result.rev)
                        reset(newDoc)
                    } catch (putErr: any) {
                        console.error('Error creating new doc:', {
                            name: putErr.name,
                            message: putErr.message,
                            timestamp: new Date().toISOString()
                        })
                        showToast('Failed to initialize database', 'error')
                    }
                } else {
                    console.error('Error loading doc:', err)
                    showToast('Failed to load data', 'error')
                }
            }
        }

        loadQuestionSet()
    }, [])

    const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
        control,
        name: "questions"
    });

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content) as PackingListQuestionSet;

                console.log("Importing with rev: ", rev)
                data._rev = rev;

                reset(data);
                showToast('Questions imported successfully!', 'success');
            } catch (error) {
                console.error('Error importing file:', error);
                showToast('Failed to import file. Please check the file format.', 'error');
            }
        };
        reader.readAsText(file);
    };

    const handleExport = async () => {
        const data = getValues();
        const json = JSON.stringify(data, null, 2);
        try {
            await exportFile({
                data: json,
                filename: 'packing-list-questions.json',
                mimeType: 'application/json',
            });
            showToast('Questions exported successfully!', 'success');
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                console.error('Error exporting file:', err);
                showToast('Failed to export file.', 'error');
            }
            // If user cancels, do nothing
        }
    };

    const onSubmit: SubmitHandler<PackingListQuestionSet> = async (data) => {
        try {
            const docToWrite = {
                _id: "1",
                ...data,
                _rev: rev,
            }
            const result = await packingAppDb.saveQuestionSet(docToWrite);
            setRev(result.rev)
            showToast('Changes saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving changes:', error);
            showToast('Failed to save changes. Please try again.', 'error');
        }
    };

    const handleLoadExample = (exampleName: string) => {
        const data = exampleData[exampleName as keyof typeof exampleData];
        if (data) {
            data._rev = rev;
            reset(data);
            setIsExampleModalOpen(false);
            showToast('Example loaded successfully!', 'success');
        }
    };

    const handleSolidLogin = () => {
        return login({
            oidcIssuer: "https://login.inrupt.com",
            redirectUrl: new URL("/pod-auth-callback.html", window.location.href).toString(),
            clientName: "Pack Me Up",
        });
    };

    const isFormEmpty = questionFields.length === 0 && people.length === 1 && getValues("alwaysNeededItems").length === 0;

    return (
        <div className="w-full flex flex-col items-center py-8 px-4">
            <div className="mb-8 w-full max-w-5xl">
                <h1 className="text-2xl font-bold text-gray-900">Packing List Questions</h1>
                <p className="mt-2 text-gray-600">Create and manage your packing list questions and options.</p>
            </div>
            {isFormEmpty && (
                <div className="w-full max-w-5xl mb-8">
                    <Callout
                        title="Get Started with Example Questions"
                        description="Your form is empty. Load an example to see how questions and options work, or start building your own from scratch."
                        action={{
                            label: "Load Example",
                            onClick: () => setIsExampleModalOpen(true)
                        }}
                    />
                </div>
            )}
            <div className="w-full max-w-5xl flex flex-col lg:flex-row lg:items-start lg:gap-8">
                {/* Main form content */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 flex-1 pb-32 lg:pb-8" id="edit-questions-form">
                    <PeopleSection
                        control={control}
                        register={register}
                        fields={peopleFields}
                        append={appendPeople}
                        remove={removePerson}
                    />
                    <AlwaysNeededItemsSection
                        control={control}
                        register={register}
                        watch={watch}
                        setValue={setValue}
                        people={people}
                    />
                    {questionFields.map((question, questionIndex) => (
                        <QuestionSection
                            key={question.id}
                            questionIndex={questionIndex}
                            control={control}
                            register={register}
                            watch={watch}
                            setValue={setValue}
                            removeQuestion={() => removeQuestion(questionIndex)}
                            people={people}
                        />
                    ))}
                    {/* Add Question button at bottom of form - only visible on large screens */}
                    <div className="hidden lg:block">
                        <Button
                            type="button"
                            onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
                            variant="secondary"
                        >
                            Add Question
                        </Button>
                    </div>
                    {/* Hidden import input for sticky bar/sidebar button */}
                    <input
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        className="hidden"
                        id="import-file"
                    />
                </form>
                {/* Sticky sidebar for large screens */}
                <div className="hidden lg:block lg:w-64 lg:sticky lg:top-24 flex-shrink-0">
                    <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-col items-stretch gap-4 py-6 px-4">
                        <Button
                            type="button"
                            onClick={handleSolidLogin}
                            variant="secondary"
                        >
                            Solid Pod Login
                        </Button>
                        <Button
                            type="button"
                            onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
                            variant="secondary"
                        >
                            Add Question
                        </Button>
                        <Button type="submit" form="edit-questions-form">
                            Save Changes
                        </Button>
                        <Button type="button" onClick={() => {
                            reset({ questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] });
                            showToast('Form has been reset to default state', 'success');
                        }}>Reset form</Button>
                        <Button
                            type="button"
                            onClick={() => setIsExampleModalOpen(true)}
                            variant="secondary"
                        >
                            Load Example
                        </Button>
                        <Button
                            type="button"
                            onClick={() => document.getElementById('import-file')?.click()}
                            variant="secondary"
                        >
                            Import
                        </Button>
                        <Button
                            type="button"
                            onClick={handleExport}
                            variant="secondary"
                        >
                            Export
                        </Button>
                    </div>
                </div>
            </div>
            {/* Sticky bottom bar for small/medium screens */}
            <div className="fixed bottom-0 left-0 w-full z-50 flex justify-center pointer-events-none lg:hidden">
                <div className="max-w-4xl w-full px-4 pb-4">
                    <div className="backdrop-blur-md bg-white/80 border border-gray-200 shadow-xl rounded-xl flex flex-wrap items-center gap-4 justify-center py-4 pointer-events-auto">
                        <Button
                            type="button"
                            onClick={handleSolidLogin}
                            variant="secondary"
                        >
                            Solid Pod Login
                        </Button>
                        <Button
                            type="button"
                            onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
                            variant="secondary"
                        >
                            Add Question
                        </Button>
                        <Button type="submit" form="edit-questions-form">
                            Save Changes
                        </Button>
                        <Button type="button" onClick={() => {
                            reset({ questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }], alwaysNeededItems: [] });
                            showToast('Form has been reset to default state', 'success');
                        }}>Reset form</Button>
                        <Button
                            type="button"
                            onClick={() => setIsExampleModalOpen(true)}
                            variant="secondary"
                        >
                            Load Example
                        </Button>
                        <Button
                            type="button"
                            onClick={() => document.getElementById('import-file')?.click()}
                            variant="secondary"
                        >
                            Import
                        </Button>
                        <Button
                            type="button"
                            onClick={handleExport}
                            variant="secondary"
                        >
                            Export
                        </Button>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={isExampleModalOpen}
                onClose={() => setIsExampleModalOpen(false)}
                title="Load Example"
            >
                <div className="space-y-2">
                    {Object.keys(exampleData).map((exampleName) => (
                        <button
                            key={exampleName}
                            onClick={() => handleLoadExample(exampleName)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            {exampleName}
                        </button>
                    ))}
                </div>
            </Modal>
        </div>
    )
} 