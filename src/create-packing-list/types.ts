export interface PackingList {
    id: string
    name: string
    created_at: string
    items: PackingListItem[]
}

export interface PackingListItem {
    text: string
    personId: string
    questionId: string
    optionId: string
    packed?: boolean
}

export interface PackingListFormData {
    name: string
    questionAnswers: {
        questionId: string
        selectedOptionId: string
    }[]
} 