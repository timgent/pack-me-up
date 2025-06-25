export interface PackingList {
    _id: string
    _rev: string
    id: string
    name: string
    createdAt: string
    items: PackingListItem[]
}

export interface PackingListItem {
    id: string
    itemText: string
    personName: string
    packed: boolean
    personId: string
    questionId: string
    optionId: string
}

export interface PackingListFormData {
    name: string
    questionAnswers: {
        questionId: string
        selectedOptionId: string
    }[]
} 