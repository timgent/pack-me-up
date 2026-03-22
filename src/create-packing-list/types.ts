export interface PackingList {
    id: string
    _rev?: string
    name: string
    createdAt: string
    lastModified?: string // ISO timestamp for conflict resolution
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
    category?: string
}

export interface PackingListFormData {
    name: string
    questionAnswers: {
        questionId: string
        selectedOptionIds: string[]
    }[]
} 