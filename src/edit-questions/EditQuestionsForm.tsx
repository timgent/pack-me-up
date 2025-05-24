import { useEffect } from 'react'
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
        const retrieved = db.get<PackingListQuestionSet>("1")
        retrieved.then(doc => {
            reset(doc)
        }).catch(err => {
            console.error('Error retrieving doc:', err)
        })
    }, [reset])

    const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
        control,
        name: "questions"
    });

    const onSubmit: SubmitHandler<PackingListQuestionSet> = async (data) => {
        try {
            // First try to get the existing document
            const existingDoc = await db.get("1").catch(err => {
                if (err.name === 'not_found') {
                    return null;
                }
                throw err;
            });

            // If document exists, update it with the new data
            if (existingDoc) {
                await db.put({
                    _id: "1",
                    _rev: existingDoc._rev,
                    ...data
                });
            } else {
                // If no document exists, create a new one
                await db.put({
                    _id: "1",
                    ...data
                });
            }
            showToast('Changes saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving changes:', error);
            showToast('Failed to save changes. Please try again.', 'error');
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Packing List Questions</h1>
                <p className="mt-2 text-gray-600">Create and manage your packing list questions and options.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

                <div className="flex items-center gap-4 pt-4">
                    <Button
                        type="button"
                        onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
                        variant="secondary"
                    >
                        Add Question
                    </Button>
                    <Button type="submit">
                        Save Changes
                    </Button>
                    <Button type="button" onClick={() => {
                        reset({ questions: [], people: [{ id: crypto.randomUUID(), name: "Me" }] });
                        showToast('Form has been reset to default state', 'success');
                    }}>Reset form</Button>
                </div>
            </form>
        </div>
    )
} 