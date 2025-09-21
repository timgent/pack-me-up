export interface PackingList {
    id: string
    _rev?: string
    name: string
    createdAt: string
    items: PackingListItem[]
}

export interface PackingListItem {
    id: string
    itemText: string
    personId: string
    personName: string
    questionId: string
    optionId: string
    packed: boolean
}

export interface PackingListFormData {
    name: string
    questionAnswers: {
        questionId: string
        selectedOptionId: string
    }[]
} 