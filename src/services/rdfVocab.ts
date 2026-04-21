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

    // PackingList predicates
    hasItem: `${PMU_NS}hasItem`,
    hasDeletedItem: `${PMU_NS}hasDeletedItem`,
    itemText: `${PMU_NS}itemText`,
    personId: `${PMU_NS}personId`,
    personName: `${PMU_NS}personName`,
    questionId: `${PMU_NS}questionId`,
    optionId: `${PMU_NS}optionId`,
    packed: `${PMU_NS}packed`,
    category: `${PMU_NS}category`,
    reviewed: `${PMU_NS}reviewed`,

    // QuestionSet predicates
    hasPerson: `${PMU_NS}hasPerson`,
    hasQuestion: `${PMU_NS}hasQuestion`,
    hasAlwaysNeededItem: `${PMU_NS}hasAlwaysNeededItem`,

    // Person predicates
    ageRange: `${PMU_NS}ageRange`,
    gender: `${PMU_NS}gender`,

    // Question predicates
    hasOption: `${PMU_NS}hasOption`,
    questionType: `${PMU_NS}questionType`,
    questionStatus: `${PMU_NS}questionStatus`,
    order: `${PMU_NS}order`,
    text: `${PMU_NS}text`,

    // Option predicates
    hasQuestionItem: `${PMU_NS}hasQuestionItem`,

    // Item predicates (on option items and always-needed items)
    hasPersonSelection: `${PMU_NS}hasPersonSelection`,

    // PersonSelection predicates
    selectionPersonId: `${PMU_NS}selectionPersonId`,
    selected: `${PMU_NS}selected`,

    // Shared
    name: 'https://schema.org/name',
} as const
