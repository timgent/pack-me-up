import React, { useEffect, useState } from 'react'
import { useForm, SubmitHandler, useFieldArray } from "react-hook-form"
import PouchDB from 'pouchdb'
import { PackingListQuestionSet, newDraftQuestion } from './types'
import { QuestionSection } from './QuestionSection'
import { Button } from '../components/Button'

export function EditQuestionsForm() {
    const db = new PouchDB('packing-list-question-set');
    const retrieved = db.get<PackingListQuestionSet>("1")
    const [savedQuestionSet, setSavedQuestions] = useState<PackingListQuestionSet>({ questions: [] })
    const { register, control, handleSubmit, setValue, watch, reset } = useForm<PackingListQuestionSet>({
        defaultValues: { questions: [] }
    });

    useEffect(() => {
        retrieved.then(doc => {
            setSavedQuestions(doc)
            reset(doc)
        }).catch(err => {
            console.error('Error retrieving doc:', err)
        })
    }, [reset])

    const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
        control,
        name: "questions"
    });

    const onSubmit: SubmitHandler<PackingListQuestionSet> = (data) => {
        db.put({ _id: "1", ...data })
        console.log("Form data:", data);
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Packing List Questions</h1>
                <p className="mt-2 text-gray-600">Create and manage your packing list questions and options.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {questionFields.map((question, questionIndex) => (
                    <QuestionSection
                        key={question.id}
                        questionIndex={questionIndex}
                        control={control}
                        register={register}
                        watch={watch}
                        setValue={setValue}
                        removeQuestion={() => removeQuestion(questionIndex)}
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
                </div>
            </form>
        </div>
    )
} 