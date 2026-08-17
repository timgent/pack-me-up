import { DCTERMS, RDF } from '@inrupt/vocab-common-rdf'

export { DCTERMS, RDF }

export const PMU_NS = 'https://pack-me-up.app/vocab#'

export const PMU = {
    // Classes
    PackingList: `${PMU_NS}PackingList`,
    PackingListItem: `${PMU_NS}PackingListItem`,
    QuestionSet: `${PMU_NS}QuestionSet`,
    Question: `${PMU_NS}Question`,
    QuestionOption: `${PMU_NS}QuestionOption`,
    QuestionItem: `${PMU_NS}QuestionItem`,
    Person: `${PMU_NS}Person`,
    PersonSelection: `${PMU_NS}PersonSelection`,
    SectionOrderEntry: `${PMU_NS}SectionOrderEntry`,

    // PackingList predicates
    hasItem: `${PMU_NS}hasItem`,
    hasDeletedItem: `${PMU_NS}hasDeletedItem`,
    hasGuest: `${PMU_NS}hasGuest`,
    // Generation inputs remembered on the list so it can be re-run against an
    // updated question set. One hasAnswer Thing per answered question; the
    // selected traveller ids are repeated strings on the root Thing.
    hasAnswer: `${PMU_NS}hasAnswer`,
    selectedOptionId: `${PMU_NS}selectedOptionId`,
    selectedPersonId: `${PMU_NS}selectedPersonId`,
    itemText: `${PMU_NS}itemText`,
    personId: `${PMU_NS}personId`,
    personName: `${PMU_NS}personName`,
    questionId: `${PMU_NS}questionId`,
    optionId: `${PMU_NS}optionId`,
    packed: `${PMU_NS}packed`,
    quantity: `${PMU_NS}quantity`,
    nights: `${PMU_NS}nights`,
    // Trip context. Dates are stored as plain YYYY-MM-DD strings (not datetimes)
    // to avoid timezone drift, matching how a person's date of birth is stored.
    destination: `${PMU_NS}destination`,
    tripStartDate: `${PMU_NS}tripStartDate`,
    tripEndDate: `${PMU_NS}tripEndDate`,
    category: `${PMU_NS}category`,
    reviewed: `${PMU_NS}reviewed`,
    itemLastModified: `${PMU_NS}itemLastModified`,
    // Shared by PackingListItem and QuestionItem: item is packed once for the
    // whole group rather than per person
    communal: `${PMU_NS}communal`,

    // QuestionSet predicates
    hasPerson: `${PMU_NS}hasPerson`,
    hasQuestion: `${PMU_NS}hasQuestion`,
    hasAlwaysNeededItem: `${PMU_NS}hasAlwaysNeededItem`,
    // One value per always-needed section that has no items in it yet. A section
    // is otherwise only its items' categories, so an empty one would vanish.
    alwaysNeededEmptySection: `${PMU_NS}alwaysNeededEmptySection`,
    // The order a generated list's sections are shown in. One Thing per section
    // name carrying its position, because a repeated string on the root Thing
    // comes back as an unordered set and an order is precisely what this is.
    hasSectionOrderEntry: `${PMU_NS}hasSectionOrderEntry`,
    // Wizard template version this set was last reconciled against
    templateVersion: `${PMU_NS}templateVersion`,

    // Person predicates
    ageRange: `${PMU_NS}ageRange`,
    gender: `${PMU_NS}gender`,
    species: `${PMU_NS}species`,
    // Stored as a plain YYYY-MM-DD string (not a datetime) to avoid timezone drift
    dateOfBirth: 'https://schema.org/birthDate',
    // Palette id (see person-colors.ts), not a CSS colour — the app owns what
    // 'rose' looks like, and an older client that doesn't know an id just falls
    // back to the person's position.
    personColor: `${PMU_NS}personColor`,
    personLastModified: `${PMU_NS}personLastModified`,
    personDeletedAt: `${PMU_NS}personDeletedAt`,

    // Question predicates
    hasOption: `${PMU_NS}hasOption`,
    questionType: `${PMU_NS}questionType`,
    questionStatus: `${PMU_NS}questionStatus`,
    order: `${PMU_NS}order`,
    text: `${PMU_NS}text`,
    questionLastModified: `${PMU_NS}questionLastModified`,
    questionDeletedAt: `${PMU_NS}questionDeletedAt`,

    // Option predicates
    hasQuestionItem: `${PMU_NS}hasQuestionItem`,
    // One value per section of this option's items that has no items in it yet
    emptySection: `${PMU_NS}emptySection`,

    // Item predicates (on option items and always-needed items)
    hasPersonSelection: `${PMU_NS}hasPersonSelection`,
    // One value per bracket the item applies to
    hasAgeRange: `${PMU_NS}hasAgeRange`,
    questionItemId: `${PMU_NS}questionItemId`,
    // Suggested-quantity rate: pack perNight per perNights nights (perNights
    // defaults to 1) — ceil(nights × perNight / perNights), capped at maxQuantity
    perNight: `${PMU_NS}perNight`,
    perNights: `${PMU_NS}perNights`,
    maxQuantity: `${PMU_NS}maxQuantity`,
    questionItemLastModified: `${PMU_NS}questionItemLastModified`,
    questionItemDeletedAt: `${PMU_NS}questionItemDeletedAt`,

    // PersonSelection predicates
    selectionPersonId: `${PMU_NS}selectionPersonId`,
    selected: `${PMU_NS}selected`,

    // SharedWithMe classes
    SharedContext: `${PMU_NS}SharedContext`,
    SharedWithMeList: `${PMU_NS}SharedWithMeList`,

    // SharedWithMe predicates
    hasSharedContext: `${PMU_NS}hasSharedContext`,
    sharedPodUrl: `${PMU_NS}sharedPodUrl`,
    sharedWebId: `${PMU_NS}sharedWebId`,
    sharedLabel: `${PMU_NS}sharedLabel`,
    sharedAddedAt: `${PMU_NS}sharedAddedAt`,

    // DeletedPackingLists classes. A deleted list leaves a tombstone rather than
    // simply vanishing: a device that still holds a copy has no other way to
    // tell "deleted elsewhere" from "not uploaded yet", and would re-upload it.
    DeletedPackingLists: `${PMU_NS}DeletedPackingLists`,
    PackingListDeletion: `${PMU_NS}PackingListDeletion`,

    // DeletedPackingLists predicates
    hasPackingListDeletion: `${PMU_NS}hasPackingListDeletion`,
    deletedListId: `${PMU_NS}deletedListId`,
    listDeletedAt: `${PMU_NS}listDeletedAt`,

    // SharedListsWithMe classes
    SharedListContext: `${PMU_NS}SharedListContext`,
    SharedListsWithMe: `${PMU_NS}SharedListsWithMe`,

    // SharedListsWithMe predicates
    hasSharedList: `${PMU_NS}hasSharedList`,
    sharedListId: `${PMU_NS}sharedListId`,
    sharedListUrl: `${PMU_NS}sharedListUrl`,
    sharedListLabel: `${PMU_NS}sharedListLabel`,

    // Shared
    name: 'https://schema.org/name',
} as const
