export interface PackingList {
    id: string
    _rev?: string
    name: string
    createdAt: string
    lastModified?: string // ISO timestamp for conflict resolution
    sharedFromPodUrl?: string // set when this list was cached from a foreign pod; local-only, not serialized to RDF
    ownerWebId?: string       // WebID of the foreign pod owner; local-only, not serialized to RDF
    nights?: number    // how many nights away; drives suggested quantities
    items: PackingListItem[]
    deletedItems?: PackingListItem[]
    guests?: Array<{ id: string; name: string }>
}

export interface PackingListItem {
    id: string
    itemText: string
    personId: string   // '' for communal and custom items
    personName: string // '' for communal items
    questionId: string
    optionId: string
    packed: boolean
    communal?: boolean // packed once for the whole group; absent = per-person
    quantity?: number  // how many to pack; absent = unspecified (1)
    category?: string
    reviewed?: boolean
    lastModified?: string // ISO timestamp; absent on legacy items
}

export interface PackingListFormData {
    name: string
    // react-hook-form's valueAsNumber yields NaN for an empty input
    nights?: number
    questionAnswers: {
        questionId: string
        selectedOptionIds: string[]
    }[]
} 