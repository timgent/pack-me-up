export interface PackingListQuestionSet {
    questions: Question[]
}

export type Question = DraftQuestion | SavedQuestion

export function newDraftQuestion(order: number): DraftQuestion {
    return { type: "draft", text: "", options: [], order }
}

interface CommonQuestion {
    text: string
    options: Option[]
    order: number
}

export type DraftQuestion = CommonQuestion & { type: "draft" }

export type SavedQuestion = CommonQuestion & { type: "saved" }

export function newOption(order: number) {
    return {
        text: "",
        items: [],
        order
    }
}

export interface Option {
    text: string
    items: string[]
    order: number
} 