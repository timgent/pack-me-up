import { useState, useEffect } from 'react'
import { PackingListQuestionSet } from './types'
import { suggestionService } from '../services/suggestions'
import { Button } from '../components/Button'

interface SuggestionsPanelProps {
  questionSet: PackingListQuestionSet
  onAddItem: (itemText: string) => void
  onAddMultipleItems: (itemTexts: string[]) => void
  isOpen: boolean
  onToggle: () => void
}

export function SuggestionsPanel({
  questionSet,
  onAddItem,
  onAddMultipleItems,
  isOpen,
  onToggle
}: SuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [dismissedItems, setDismissedItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadSuggestions()
  }, [questionSet])

  async function loadSuggestions() {
    setIsLoading(true)
    try {
      const items = await suggestionService.getManualItemSuggestions(questionSet)
      setSuggestions(items)
    } catch (error) {
      console.error('Failed to load suggestions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const visibleSuggestions = suggestions.filter(s => !dismissedItems.has(s))

  const handleToggleSelection = (item: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(item)) {
      newSelected.delete(item)
    } else {
      newSelected.add(item)
    }
    setSelectedItems(newSelected)
  }

  const handleQuickAdd = (item: string) => {
    onAddItem(item)
    setDismissedItems(prev => new Set(prev).add(item))
  }

  const handleAddSelected = () => {
    onAddMultipleItems(Array.from(selectedItems))
    setDismissedItems(prev => {
      const newSet = new Set(prev)
      selectedItems.forEach(item => newSet.add(item))
      return newSet
    })
    setSelectedItems(new Set())
  }

  const handleDismiss = (item: string) => {
    setDismissedItems(prev => new Set(prev).add(item))
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(item)
      return newSet
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-32 bg-blue-600 text-white px-2 py-4 rounded-l-lg shadow-lg hover:bg-blue-700 transition-colors z-40 flex flex-col items-center gap-1 text-sm font-medium"
        title="Show suggestions"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        <span>💡</span>
        <span>Suggestions</span>
      </button>
    )
  }

  return (
    <div className="fixed right-0 top-24 h-[calc(100vh-6rem)] w-80 bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-40">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            💡 Suggested Items
          </h3>
          <button
            onClick={onToggle}
            className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded p-1 transition-colors"
            title="Hide panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-600">
          From your last 3 packing lists
        </p>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">
            <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-sm">Loading suggestions...</p>
          </div>
        ) : visibleSuggestions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-3xl mb-2">📝</div>
            <p className="text-sm font-medium mb-1">No suggestions available</p>
            <p className="text-xs">
              Add custom items to packing lists and they'll appear here
            </p>
          </div>
        ) : (
          <>
            {/* Batch Actions */}
            {selectedItems.size > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-900">
                    {selectedItems.size} selected
                  </span>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleAddSelected}
                  >
                    Add Selected
                  </Button>
                </div>
              </div>
            )}

            {/* Suggestion List */}
            <div className="space-y-2">
              {visibleSuggestions.map((item) => (
                <div
                  key={item}
                  className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item)}
                      onChange={() => handleToggleSelection(item)}
                      className="mt-0.5 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 break-words">
                        {item}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleQuickAdd(item)}
                      className="flex-1 text-xs px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
                    >
                      + Add
                    </button>
                    <button
                      onClick={() => handleDismiss(item)}
                      className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
