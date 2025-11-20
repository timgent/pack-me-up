import { PackingList, PackingListItem } from '../create-packing-list/types'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingAppDatabase } from './database'

/**
 * Service for generating item suggestions based on manually added items
 * from recent packing lists.
 */
export class SuggestionService {
  private db: PackingAppDatabase

  constructor() {
    this.db = PackingAppDatabase.getInstance()
  }

  /**
   * Get suggestions for items to add to the question set based on
   * manually added items from recent packing lists.
   *
   * @param currentQuestionSet - The current question set to filter against
   * @param maxLists - Maximum number of recent lists to analyze (default: 3)
   * @returns Array of suggested item texts, sorted alphabetically
   */
  async getManualItemSuggestions(
    currentQuestionSet: PackingListQuestionSet,
    maxLists: number = 3
  ): Promise<string[]> {
    // 1. Get recent packing lists
    const recentLists = await this.getRecentPackingLists(maxLists)

    // 2. Extract manual items
    const manualItems = this.extractManualItems(recentLists)

    // 3. Filter out items already in question set
    const suggestions = this.filterExistingItems(manualItems, currentQuestionSet)

    return suggestions.sort()
  }

  /**
   * Get the N most recent packing lists, sorted by creation date descending.
   */
  private async getRecentPackingLists(count: number): Promise<PackingList[]> {
    const allLists = await this.db.getAllPackingLists()
    return allLists
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, count)
  }

  /**
   * Extract unique manual item texts from a list of packing lists.
   * Deduplicates items case-insensitively while preserving original casing.
   */
  private extractManualItems(lists: PackingList[]): string[] {
    const itemMap = new Map<string, string>()

    lists.forEach(list => {
      list.items.forEach(item => {
        if (this.isManuallyAddedItem(item)) {
          const normalized = item.itemText.trim().toLowerCase()
          // Keep the first occurrence's casing
          if (!itemMap.has(normalized)) {
            itemMap.set(normalized, item.itemText.trim())
          }
        }
      })
    })

    return Array.from(itemMap.values())
  }

  /**
   * Determine if an item was manually added (not from questions/options).
   * Manual items have empty strings for questionId and optionId.
   */
  private isManuallyAddedItem(item: PackingListItem): boolean {
    return item.questionId === '' && item.optionId === ''
  }

  /**
   * Filter out items that already exist in the question set.
   * Checks against always needed items and all question option items.
   */
  private filterExistingItems(
    suggestions: string[],
    questionSet: PackingListQuestionSet
  ): string[] {
    const existing = new Set<string>()

    // Add always needed items
    questionSet.alwaysNeededItems.forEach((item) => {
      existing.add(item.text.trim().toLowerCase())
    })

    // Add all items from questions
    questionSet.questions.forEach((q) => {
      q.options.forEach((opt) => {
        opt.items.forEach((item) => {
          existing.add(item.text.trim().toLowerCase())
        })
      })
    })

    return suggestions.filter((s) => !existing.has(s.toLowerCase()))
  }
}

// Singleton instance
export const suggestionService = new SuggestionService()
