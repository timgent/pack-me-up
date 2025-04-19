import PouchDB from 'pouchdb'
import './App.css'
import { useForm, SubmitHandler, useFieldArray } from "react-hook-form"
import { useEffect } from 'react'

interface PackingListQuestionSet {
  questions: Question[]
}

type Question = DraftQuestion | SavedQuestion

function newDraftQuestion(order: number): DraftQuestion {
  return { type: "draft", text: "", options: [], order }
}

interface CommonQuestion {
  text: string
  options: Option[]
  order: number
}

type DraftQuestion = CommonQuestion & { type: "draft" }

type SavedQuestion = CommonQuestion & { type: "saved" }

function newOption(order: number) {
  return {
    text: "",
    items: [],
    order
  }
}

interface Option {
  text: string
  items: string[]
  order: number
}

function App() {
  const db = new PouchDB('packing-list-question-set');
  const retrieved = db.get("1")
  useEffect(() => {
    retrieved.then(doc => {
      console.log({ doc })
    }).catch(err => {
      console.error('Error retrieving doc:', err)
    })
  }, [])
  const { register, control, handleSubmit, setValue, watch } = useForm<PackingListQuestionSet>({
    defaultValues: {
      questions: []
    }
  });

  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
    control,
    name: "questions"
  });

  const onSubmit: SubmitHandler<PackingListQuestionSet> = (data) => {
    db.put({ _id: "1", ...data })
    console.log("Form data:", data);
  };

  return (
    <>
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
    </>
  )
}

interface QuestionSectionProps {
  questionIndex: number;
  control: any;
  register: any;
  watch: any;
  setValue: any;
  removeQuestion: () => void;
}

function QuestionSection({ questionIndex, control, register, watch, setValue, removeQuestion }: QuestionSectionProps) {
  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
    control,
    name: `questions.${questionIndex}.options` as const
  });

  return (
    <div className="border p-4 rounded-lg space-y-4">
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Question text"
          {...register(`questions.${questionIndex}.text`)}
        />
        <Button
          type="button"
          onClick={removeQuestion}
          className="bg-red-500"
        >
          Remove Question
        </Button>
      </div>

      <div className="pl-4 space-y-4">
        {optionFields.map((option, optionIndex) => (
          <OptionSection
            key={option.id}
            questionIndex={questionIndex}
            optionIndex={optionIndex}
            register={register}
            watch={watch}
            setValue={setValue}
            removeOption={() => removeOption(optionIndex)}
          />
        ))}
        <Button
          type="button"
          onClick={() => appendOption(newOption(optionFields.length))}
        >
          Add Option
        </Button>
      </div>
    </div>
  );
}

interface OptionSectionProps {
  questionIndex: number;
  optionIndex: number;
  register: any;
  watch: any;
  setValue: any;
  removeOption: () => void;
}

function OptionSection({ questionIndex, optionIndex, register, watch, setValue, removeOption }: OptionSectionProps) {
  const items = watch(`questions.${questionIndex}.options.${optionIndex}.items`) || [];

  return (
    <div className="border p-4 rounded-lg space-y-4">
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Option text"
          {...register(`questions.${questionIndex}.options.${optionIndex}.text`)}
        />
        <Button
          type="button"
          onClick={removeOption}
          className="bg-red-500"
        >
          Remove Option
        </Button>
      </div>

      <div className="pl-4 space-y-2">
        {items.map((_: string, itemIndex: number) => (
          <div key={itemIndex} className="flex items-center space-x-2">
            <Input
              placeholder="Item"
              {...register(`questions.${questionIndex}.options.${optionIndex}.items.${itemIndex}`)}
            />
            <Button
              type="button"
              onClick={() => {
                const newItems = items.filter((_: string, i: number) => i !== itemIndex);
                setValue(`questions.${questionIndex}.options.${optionIndex}.items`, newItems);
              }}
              className="bg-red-500"
            >
              Remove Item
            </Button>
          </div>
        ))}
        <Button
          type="button"
          onClick={() => {
            setValue(
              `questions.${questionIndex}.options.${optionIndex}.items`,
              [...items, ""]
            );
          }}
        >
          Add Item
        </Button>
      </div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className={`border-gray-400 mx-2 p-2 border-solid border-2 ${props.className || ''}`} />
  )
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`text-white hover:cursor-pointer bg-blue-500 rounded p-2 ${props.className || ''}`}>
      {props.children}
    </button>
  )
}

export default App
