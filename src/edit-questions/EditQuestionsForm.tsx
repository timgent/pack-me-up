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
        <main className="p-4">
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

                <div className="space-x-4">
                    <Button
                        type="button"
                        onClick={() => appendQuestion(newDraftQuestion(questionFields.length))}
                    >
                        Add Question
                    </Button>
                    <Button type="submit">Save</Button>
                </div>
            </form>
        </main>
    )
} 