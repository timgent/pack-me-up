import { PackingListQuestionSet } from '../edit-questions/types'
import { activeQuestionSet } from '../edit-questions/tombstones'
import { PackingList, PackingListItem } from './types'
import { generateQuestionBasedItems, generateAlwaysNeededItems } from './generatePackingListItems'
// Identity and collapsing are shared with the creation flow, so an item arriving
// from two answers behaves the same whether the list is being created or
// updated — including taking the larger of the two suggested quantities.
import { deduplicateItems, itemIdentityKey as itemKey } from './deduplicate'
import { generateUUID } from '../utils/uuid'

// The sentinel questionId used for always-needed items; such items carry no real
// question/option ids to reconstruct answers from.
const ALWAYS_NEEDED_QUESTION_ID = 'always-needed'

interface GenerationInputs {
    questionAnswers: Array<{ questionId: string; selectedOptionIds: string[] }>
    selectedPeopleIds: string[]
}

/**
 * One thing the user can accept or decline in the "Update from questions"
 * preview. Every kind is described the same way — items to append, ids to drop,
 * replacements for items already on the list — so applying a selection is one
 * pass over the list whatever mix of kinds it contains (`applyQuestionSetChanges`).
 *
 * - `add`      an item your questions now produce that the list hasn't got
 * - `remove`   an item on the list your questions no longer produce
 * - `update`   the same item, renamed / moved to another section / re-quantified,
 *              keeping its id and whether it is packed
 * - `sharing`  an item that crossed the communal boundary: one shared copy in
 *              place of everybody's own, or the other way round
 */
export type QuestionSetChangeType = 'add' | 'remove' | 'update' | 'sharing'

export interface QuestionSetChange {
    /** Stable key for the checkbox, and for identifying a selection. */
    id: string
    type: QuestionSetChangeType
    /** What to call it in the preview — the *new* name where the name changed. */
    itemText: string
    /** Who it is for. '' for shared items. */
    personName: string
    /** One line saying what actually changes. Absent for a plain add/remove. */
    detail?: string
    /** Items to append to the list. */
    additions: PackingListItem[]
    /**
     * Ids of items to drop. Deliberately *not* tombstoned into `deletedItems`:
     * a tombstone means "I don't want this on this trip" and blocks the item
     * for good, whereas these come off because the questions changed. Put the
     * option back in your questions and the item comes back with it.
     */
    removedIds: string[]
    /** Replacements for items already on the list, matched by id. */
    replacements: PackingListItem[]
}

// Legacy lists (created before generation inputs were persisted) have neither
// `questionAnswers` nor `selectedPeopleIds`. Rebuild what we can from the items
// that were generated: the distinct (questionId → optionId) pairs become the
// answers, and the distinct non-empty personIds become the travellers. This is
// lossy — an option that generated no instances, or whose items were all
// deleted-and-purged, is invisible — but safe: at worst it misses some changes,
// it never invents wrong ones.
export function reconstructGenerationInputs(list: PackingList): GenerationInputs {
    const optionIdsByQuestion = new Map<string, Set<string>>()
    const peopleIds = new Set<string>()

    for (const item of [...list.items, ...(list.deletedItems ?? [])]) {
        if (item.personId) peopleIds.add(item.personId)
        if (!item.questionId || item.questionId === ALWAYS_NEEDED_QUESTION_ID) continue
        if (!item.optionId) continue
        if (!optionIdsByQuestion.has(item.questionId)) {
            optionIdsByQuestion.set(item.questionId, new Set())
        }
        optionIdsByQuestion.get(item.questionId)!.add(item.optionId)
    }

    const questionAnswers = [...optionIdsByQuestion.entries()].map(([questionId, optionIds]) => ({
        questionId,
        selectedOptionIds: [...optionIds],
    }))

    return { questionAnswers, selectedPeopleIds: [...peopleIds] }
}

function resolveGenerationInputs(list: PackingList): GenerationInputs {
    if (list.questionAnswers !== undefined || list.selectedPeopleIds !== undefined) {
        return {
            questionAnswers: list.questionAnswers ?? [],
            selectedPeopleIds: list.selectedPeopleIds ?? [],
        }
    }
    return reconstructGenerationInputs(list)
}

/**
 * Which answer an item came from, ignoring its name. Two items in the same
 * group are the same slot in the question set for the same person, which is
 * what makes a rename recognisable: the name changed, everything else didn't.
 */
function groupKey(item: Pick<PackingListItem, 'questionId' | 'optionId' | 'personId'>): string {
    return `${item.questionId}|${item.optionId}|${item.personId}`
}

function normalise(text: string): string {
    return text.trim().toLowerCase()
}

/** A generated item is shared when it belongs to nobody in particular. */
function isShared(item: PackingListItem): boolean {
    return item.personId === ''
}

/** Items the user typed themselves are theirs alone; this flow never touches them. */
function isCustom(item: PackingListItem): boolean {
    return item.questionId === ''
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
    const existing = map.get(key)
    if (existing) existing.push(value)
    else map.set(key, [value])
}

function quantityLabel(quantity: number | undefined): string {
    return quantity === undefined ? 'no set amount' : `×${quantity}`
}

/**
 * The replacement for `existing` if the question set now describes it
 * differently, or `null` if it doesn't — including when the only differences
 * are ones the user has since made their own.
 *
 * **Hand edits win.** A generated item the user has renamed or re-quantified on
 * the list carries `textEdited` / `quantityEdited`, and this leaves that field
 * exactly as they left it. Without that flag the two cases are indistinguishable
 * — "the question set was renamed" and "the list item was renamed" both end as
 * "these two strings differ" — and the update would offer to undo the user's
 * own edit every time they opened it. The rest of the item still updates: a
 * renamed item can still follow its section, an item with a hand-set amount can
 * still be renamed.
 */
function buildUpdate(existing: PackingListItem, regenerated: PackingListItem): QuestionSetChange | null {
    if (isCustom(existing)) return null

    const reasons: string[] = []
    const replacement: PackingListItem = { ...existing }

    if (!existing.textEdited && normalise(existing.itemText) !== normalise(regenerated.itemText)) {
        reasons.push(`Renamed from “${existing.itemText}”`)
        replacement.itemText = regenerated.itemText
    }
    // An item with no section of its own has never had an opinion about where it
    // lives — every item on a list made before sections existed is like this —
    // and filling one in is not a move the user needs to approve. Only an item
    // that names a section can be moved out of it.
    if (existing.category !== undefined && regenerated.category !== undefined
        && existing.category !== regenerated.category) {
        reasons.push(`Moved to ${regenerated.category}`)
        replacement.category = regenerated.category
    }
    if (!existing.quantityEdited && existing.quantity !== regenerated.quantity) {
        reasons.push(`Now ${quantityLabel(regenerated.quantity)} (was ${quantityLabel(existing.quantity)})`)
        if (regenerated.quantity === undefined) delete replacement.quantity
        else replacement.quantity = regenerated.quantity
    }

    if (reasons.length === 0) return null

    // Keep the item pointing at wherever it now comes from, and wearing the
    // traveller's current name. Neither is worth a line in the preview on its
    // own, but both would otherwise go stale on an item that is being rewritten
    // anyway.
    replacement.questionId = regenerated.questionId
    replacement.optionId = regenerated.optionId
    replacement.personName = regenerated.personName
    replacement.lastModified = new Date().toISOString()

    return {
        id: `update:${existing.id}`,
        type: 'update',
        itemText: replacement.itemText,
        personName: replacement.personName,
        detail: reasons.join(' · '),
        additions: [],
        removedIds: [],
        replacements: [replacement],
    }
}

function asAddition(item: PackingListItem, now: string): PackingListItem {
    return { ...item, id: generateUUID(), packed: false, lastModified: now }
}

/**
 * What the current question set would change about `list`, as a list of choices
 * to put to the user.
 *
 * Matching runs in four passes, most certain first, so that the cheap and
 * unambiguous answers are settled before anything is guessed:
 *
 * 1. **Same name, same person** — the item is already there. Nothing to do
 *    unless its section or suggested amount moved.
 * 2. **Same name, different owner** — the item crossed the communal boundary.
 * 3. **Same slot, different name** — one item left in an answer on each side is
 *    a rename, not a coincidence.
 * 4. **Leftovers** — a regenerated item nobody claimed is new; a list item
 *    nobody claimed is gone from the questions.
 *
 * Nothing here mutates `list`; see `applyQuestionSetChanges`.
 */
export function computeQuestionSetChanges(
    list: PackingList,
    storedQuestionSet: PackingListQuestionSet | null | undefined,
): QuestionSetChange[] {
    // No question set at all (a list restored on a device that has never run
    // the wizard) means nothing to compare against — not a crash inside the
    // generator on `questionSet.people`.
    if (!storedQuestionSet) return []

    // Deletions in the question set are tombstones, so read past them: a
    // question, item or person the user has deleted must never come back as an
    // addition. See `activeQuestionSet`.
    const questionSet = activeQuestionSet(storedQuestionSet)
    const { questionAnswers, selectedPeopleIds } = resolveGenerationInputs(list)

    // A person removed from the question set must not be regenerated; this also
    // guards the non-null people.find(...)! inside the generator.
    const currentPeopleIds = new Set(questionSet.people.map(p => p.id))
    const validPeopleIds = selectedPeopleIds.filter(id => currentPeopleIds.has(id))

    const regenerated = deduplicateItems([
        ...generateQuestionBasedItems(
            questionSet.questions,
            questionAnswers,
            questionSet.people,
            validPeopleIds,
            list.nights,
        ),
        ...generateAlwaysNeededItems(
            questionSet.alwaysNeededItems,
            questionSet.people,
            validPeopleIds,
            list.nights,
        ),
    ])

    // What the user has thrown off this list. Recognised by name and owner and
    // by nothing else: guessing that a differently-named item is "really" one
    // they deleted would silently withhold a genuine addition, and a withheld
    // addition is invisible, where an unwanted one is one untick away.
    const deletedKeys = new Set(
        (list.deletedItems ?? []).map(item => itemKey(item.personId, item.itemText)),
    )

    const changes: QuestionSetChange[] = []
    const now = new Date().toISOString()
    const claimedListIds = new Set<string>()

    // ── Pass 1: the same item, still called the same thing ──────────────────
    const liveByIdentity = new Map<string, PackingListItem[]>()
    for (const item of list.items) pushTo(liveByIdentity, itemKey(item.personId, item.itemText), item)

    let unclaimed: PackingListItem[] = []
    for (const item of regenerated) {
        const match = (liveByIdentity.get(itemKey(item.personId, item.itemText)) ?? [])
            .find(candidate => !claimedListIds.has(candidate.id))
        if (!match) {
            unclaimed.push(item)
            continue
        }
        claimedListIds.add(match.id)
        const update = buildUpdate(match, item)
        if (update) changes.push(update)
    }

    const stillOnList = () => list.items.filter(item => !claimedListIds.has(item.id))

    // ── Pass 2: an item that crossed the communal boundary ──────────────────
    const liveByText = new Map<string, PackingListItem[]>()
    for (const item of stillOnList()) {
        if (isCustom(item)) continue
        pushTo(liveByText, normalise(item.itemText), item)
    }
    const regeneratedByText = new Map<string, PackingListItem[]>()
    for (const item of unclaimed) pushTo(regeneratedByText, normalise(item.itemText), item)

    const sharingClaimed = new Set<PackingListItem>()
    for (const [text, incoming] of regeneratedByText) {
        const existing = liveByText.get(text) ?? []
        if (existing.length === 0) continue

        const incomingShared = incoming.filter(isShared)
        const incomingPersonal = incoming.filter(item => !isShared(item))
        const existingShared = existing.filter(isShared)
        const existingPersonal = existing.filter(item => !isShared(item))

        // Everybody's own copies replaced by one for the group.
        if (incomingShared.length === 1 && incomingPersonal.length === 0
            && existingPersonal.length > 0 && existingShared.length === 0) {
            const [shared] = incomingShared
            for (const item of existingPersonal) claimedListIds.add(item.id)
            sharingClaimed.add(shared)
            // The user deleted the shared copy already; honour that rather than
            // bringing it back through the side door.
            if (deletedKeys.has(itemKey(shared.personId, shared.itemText))) continue
            changes.push({
                id: `sharing:${shared.questionId}:${shared.optionId}:${text}`,
                type: 'sharing',
                itemText: shared.itemText,
                personName: '',
                detail: `Now shared for everyone, instead of one each for ${existingPersonal.map(item => item.personName || 'Unassigned').join(', ')}`,
                additions: [{
                    ...asAddition(shared, now),
                    // Already in the bag for everyone is already in the bag.
                    packed: existingPersonal.every(item => item.packed),
                    ...(existingPersonal.some(item => item.lastMinute) ? { lastMinute: true } : {}),
                }],
                removedIds: existingPersonal.map(item => item.id),
                replacements: [],
            })
            continue
        }

        // One for the group replaced by everybody's own copy.
        if (incomingPersonal.length > 0 && incomingShared.length === 0
            && existingShared.length === 1 && existingPersonal.length === 0) {
            const [shared] = existingShared
            claimedListIds.add(shared.id)
            for (const item of incomingPersonal) sharingClaimed.add(item)
            const wanted = incomingPersonal.filter(
                item => !deletedKeys.has(itemKey(item.personId, item.itemText)),
            )
            if (wanted.length === 0) continue
            changes.push({
                id: `sharing:${shared.id}`,
                type: 'sharing',
                itemText: shared.itemText,
                personName: '',
                detail: `Now one each for ${wanted.map(item => item.personName || 'Unassigned').join(', ')}, instead of one shared`,
                additions: wanted.map(item => ({
                    ...asAddition(item, now),
                    packed: shared.packed,
                    ...(shared.lastMinute ? { lastMinute: true } : {}),
                })),
                removedIds: [shared.id],
                replacements: [],
            })
        }
    }
    unclaimed = unclaimed.filter(item => !sharingClaimed.has(item))

    // ── Pass 3: the same slot in the questions, under a new name ────────────
    const liveByGroup = new Map<string, PackingListItem[]>()
    for (const item of stillOnList()) {
        if (isCustom(item)) continue
        pushTo(liveByGroup, groupKey(item), item)
    }
    const regeneratedByGroup = new Map<string, PackingListItem[]>()
    for (const item of unclaimed) pushTo(regeneratedByGroup, groupKey(item), item)

    const renameClaimed = new Set<PackingListItem>()
    for (const [key, incoming] of regeneratedByGroup) {
        // More than one candidate on either side and there is no telling which
        // renamed which, so leave them to be an add and a removal.
        if (incoming.length !== 1) continue
        const existing = liveByGroup.get(key) ?? []
        if (existing.length > 1) continue

        if (existing.length === 0) continue

        claimedListIds.add(existing[0].id)
        renameClaimed.add(incoming[0])
        const update = buildUpdate(existing[0], incoming[0])
        if (update) changes.push(update)
    }
    unclaimed = unclaimed.filter(item => !renameClaimed.has(item))

    // ── Pass 4: whatever nobody claimed ─────────────────────────────────────
    for (const item of unclaimed) {
        if (deletedKeys.has(itemKey(item.personId, item.itemText))) continue
        const addition = asAddition(item, now)
        changes.push({
            id: `add:${addition.id}`,
            type: 'add',
            itemText: addition.itemText,
            personName: addition.personName,
            additions: [addition],
            removedIds: [],
            replacements: [],
        })
    }

    // Whether an item's absence from the regenerated set actually means
    // anything. It doesn't if the generator was never in a position to produce
    // it: an answer the list no longer remembers giving, or an always-needed
    // item with nobody left to need it. Without this a list whose generation
    // inputs went missing (#260) would offer to strip itself bare.
    const answeredQuestionIds = new Set(
        questionAnswers.filter(a => a.selectedOptionIds.length > 0).map(a => a.questionId),
    )
    const couldHaveBeenGenerated = (item: PackingListItem) =>
        item.questionId === ALWAYS_NEEDED_QUESTION_ID
            ? validPeopleIds.length > 0
            : answeredQuestionIds.has(item.questionId)

    for (const item of stillOnList()) {
        if (isCustom(item)) continue
        if (!couldHaveBeenGenerated(item)) continue
        changes.push({
            id: `remove:${item.id}`,
            type: 'remove',
            itemText: item.itemText,
            personName: item.personName,
            additions: [],
            removedIds: [item.id],
            replacements: [],
        })
    }

    return changes
}

/**
 * The list with `changes` applied, in one pass so a mixed selection lands
 * atomically rather than each handler starting from its own snapshot.
 */
export function applyQuestionSetChanges(
    list: PackingList,
    changes: readonly QuestionSetChange[],
): PackingList {
    const removedIds = new Set(changes.flatMap(change => change.removedIds))
    const replacements = new Map(
        changes.flatMap(change => change.replacements.map(item => [item.id, item] as const)),
    )
    const additions = changes.flatMap(change => change.additions)

    return {
        ...list,
        items: [
            ...list.items
                .filter(item => !removedIds.has(item.id))
                .map(item => replacements.get(item.id) ?? item),
            ...additions,
        ],
    }
}
