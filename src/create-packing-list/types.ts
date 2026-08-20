export interface PackingList {
    id: string
    _rev?: string
    name: string
    createdAt: string
    lastModified?: string // ISO timestamp for conflict resolution
    sharedFromPodUrl?: string // set when this list was cached from a foreign pod; local-only, not serialized to RDF
    ownerWebId?: string       // WebID of the foreign pod owner; local-only, not serialized to RDF
    nights?: number    // how many nights away; drives suggested quantities
    // Trip context, all optional so the quick-create flow still works without
    // them. Dates are plain YYYY-MM-DD calendar days, not timestamps.
    destination?: string
    startDate?: string
    endDate?: string
    items: PackingListItem[]
    deletedItems?: PackingListItem[]
    guests?: Array<{ id: string; name: string }>
    // How this list was generated, remembered so it can later be re-run against
    // an updated question set ("Update from questions"). Both optional and
    // additive: legacy lists created before this existed have neither, and fall
    // back to reconstructing the inputs from their items' question/option ids.
    questionAnswers?: Array<{ questionId: string; selectedOptionIds: string[] }>
    selectedPeopleIds?: string[]
    // A list deliberately carries no section order of its own: the order lives
    // on the question set and is read live when the list is shown, so that
    // changing it reaches every list at once. See `useSectionOrder`.
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
    order?: number     // position in the question set at generation time; absent on legacy items (sorted alphabetically)
    reviewed?: boolean
    // Can't go in the bag until you're walking out of the door — phone charger,
    // toothbrush, passport in a pocket. Shown in a section of its own at the
    // end of the list rather than among the items that can be packed now.
    lastMinute?: boolean
    lastModified?: string // ISO timestamp; absent on legacy items
}

export interface PackingListFormData {
    name: string
    // react-hook-form's valueAsNumber yields NaN for an empty input
    nights?: number
    destination?: string
    startDate?: string
    endDate?: string
    questionAnswers: {
        questionId: string
        selectedOptionIds: string[]
    }[]
} 