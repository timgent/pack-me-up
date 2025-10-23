export interface PackingListQuestionSet {
    _id?: string
    _rev?: string
    people: Person[]
    alwaysNeededItems: Item[]
    questions: Question[]
}

export interface Person {
    id: string
    name: string
}

export type Question = DraftQuestion | SavedQuestion

export type QuestionType = "single-choice" | "multiple-choice"

export function newDraftQuestion(order: number): DraftQuestion {
    return {
        id: crypto.randomUUID(),
        type: "draft",
        text: "",
        options: [],
        order,
        questionType: "single-choice"
    }
}

interface CommonQuestion {
    id: string
    text: string
    options: Option[]
    order: number
    questionType?: QuestionType  // Optional for backward compatibility
}

export type DraftQuestion = CommonQuestion & { type: "draft" }

export type SavedQuestion = CommonQuestion & { type: "saved" }

export function newOption(order: number) {
    return {
        id: crypto.randomUUID(),
        text: "",
        items: [],
        order
    }
}

export interface Option {
    id: string
    text: string
    items: Item[]
    order: number
}

export interface Item {
    text: string
    personSelections: { personId: string, selected: boolean }[]
}