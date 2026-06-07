export interface PackingList {
    id: string
    _rev?: string
    name: string
    createdAt: string
    lastModified?: string // ISO timestamp for conflict resolution
    sharedFromPodUrl?: string // set when this list was cached from a foreign pod; local-only, not serialized to RDF
    ownerWebId?: string       // WebID of the foreign pod owner; local-only, not serialized to RDF
    items: PackingListItem[]
    deletedItems?: PackingListItem[]
    guests?: Array<{ id: string; name: string }>
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
    lastModified?: string // ISO timestamp; absent on legacy items
}

export interface PackingListFormData {
    name: string
    questionAnswers: {
        questionId: string
        selectedOptionIds: string[]
    }[]
} 