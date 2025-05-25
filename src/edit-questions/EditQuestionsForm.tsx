import { useEffect, useState } from 'react'
import { useForm, SubmitHandler, useFieldArray, ChangeHandler } from "react-hook-form"
import PouchDB from 'pouchdb'
import { PackingListQuestionSet, newDraftQuestion } from './types'
import { QuestionSection } from './QuestionSection'
import { PeopleSection } from './PeopleSection'
import { Button } from '../components/Button'
import { useToast } from '../components/ToastContext'

export function EditQuestionsForm() {
    const db = new PouchDB('packing-list-question-set');
    const { register, control, handleSubmit, setValue, watch, reset, getValues } = useForm<PackingListQuestionSet>({
        defaultValues: { questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }] }
    });
    const [rev, setRev] = useState<string | undefined>(undefined)
    const { fields: peopleFields, append: appendPeople, remove: removePeople } = useFieldArray({
        control,
        name: "people"
    });
    const { showToast } = useToast();

    const removePerson = (removedIndex: number) => {
        // We need this wrapper for removing people to correctly removed the check boxes for that person
        getValues("questions").forEach((question, questionIndex) => {
            getValues(`questions.${questionIndex}.options`).forEach((option, optionIndex) => {
                getValues(`questions.${questionIndex}.options.${optionIndex}.items`).forEach((item, itemIndex) => {
                    const currentPersonSelections = getValues(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}.personSelections`)
                    currentPersonSelections.splice(removedIndex, 1)
                })
            })
        })
        removePeople(removedIndex)
    }

    const people = watch("people")

    useEffect(() => {
        console.log("Loading doc")
        const retrieved = db.get<PackingListQuestionSet>("1")
        retrieved.then(doc => {
            setRev(doc._rev)
            reset(doc)
            console.log("Loaded doc: ", doc)
        }).catch(err => {
            if (err.name === 'not_found') {
                console.log('No data yet, creating new doc')
                const newDoc = {
                    _id: "1",
                    questions: [],
                    people: [{ id: crypto.randomUUID(), name: "Me" }]
                }
                db.put(newDoc).then(result => {
                    setRev(result.rev)
                    reset(newDoc)
                    console.log("Created new doc: ", newDoc)
                }).catch(putErr => {
                    console.error('Error creating new doc:', putErr)
                    showToast('Failed to initialize database', 'error')
                })
            } else {
                console.error('Error loading doc:', err)
                showToast('Failed to load data', 'error')
            }
        })
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

    const handleExport = () => {
        const data = getValues();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'packing-list-questions.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Questions exported successfully!', 'success');
    };

    const onSubmit: SubmitHandler<PackingListQuestionSet> = async (data) => {
        try {
            const docToWrite = {
                _id: "1",
                ...data,
                _rev: rev,
            }
            const updated = await db.put(docToWrite);
            setRev(updated.rev)
            showToast('Changes saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving changes:', error);
            showToast('Failed to save changes. Please try again.', 'error');
        }
    };

    return (
        <div className="w-full flex flex-col items-center py-8 px-4">
            <div className="mb-8 w-full max-w-5xl">
                <h1 className="text-2xl font-bold text-gray-900">Packing List Questions</h1>
                <p className="mt-2 text-gray-600">Create and manage your packing list questions and options.</p>
            </div>
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
                            onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
                            variant="secondary"
                        >
                            Add Question
                        </Button>
                        <Button type="submit" form="edit-questions-form">
                            Save Changes
                        </Button>
                        <Button type="button" onClick={() => {
                            reset({ questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }] });
                            showToast('Form has been reset to default state', 'success');
                        }}>Reset form</Button>
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
                            onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
                            variant="secondary"
                        >
                            Add Question
                        </Button>
                        <Button type="submit" form="edit-questions-form">
                            Save Changes
                        </Button>
                        <Button type="button" onClick={() => {
                            reset({ questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }] });
                            showToast('Form has been reset to default state', 'success');
                        }}>Reset form</Button>
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
        </div>
    )
} 