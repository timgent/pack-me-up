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
    reviewed?: boolean
}

export interface PackingListFormData {
    name: string
    questionAnswers: {
        questionId: string
        selectedOptionIds: string[]
    }[]
} 