# Manual Items Suggestion Feature - Investigation Report

## Overview
This document outlines the design and implementation approach for adding a "suggested items" feature to the Edit Questions page. The feature will analyze the last 3 packing lists, identify manually added items, and suggest them to users as potential additions to their question items.

## 1. Identifying Manually Added Items

### Current Data Model
Based on code analysis of `src/pages/view-packing-list.tsx` (lines 245-263), manually added items have a distinct signature:

```typescript
type PackingListItem = {
  id: string;
  itemText: string;
  personId: string;      // Empty string for manual items
  personName: string;
  questionId: string;    // Empty string for manual items ⭐
  optionId: string;      // Empty string for manual items ⭐
  packed: boolean;
}
```

**Detection Logic:**
```typescript
function isManuallyAddedItem(item: PackingListItem): boolean {
  return item.questionId === '' && item.optionId === '';
}
```

### Comparison with Generated Items
- **Question-based items**: Have valid `questionId` and `optionId` pointing to source question/option
- **Always-needed items**: Have `questionId: 'always-needed'` and `optionId: 'always-needed'`
- **Manually added items**: Have empty strings `''` for both fields

## 2. Data Retrieval Strategy

### Getting Last 3 Packing Lists

The database service (`src/services/database.ts`) provides:
```typescript
public async getAllPackingLists(): Promise<PackingList[]>
```

**Implementation:**
```typescript
async function getRecentPackingLists(count: number = 3): Promise<PackingList[]> {
  const db = PackingAppDatabase.getInstance();
  const allLists = await db.getAllPackingLists();

  // Sort by creation date descending (most recent first)
  const sorted = allLists.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return sorted.slice(0, count);
}
```

### Extracting Unique Manual Items

```typescript
function extractManualItems(packingLists: PackingList[]): string[] {
  const manualItemsSet = new Set<string>();

  packingLists.forEach(list => {
    list.items.forEach(item => {
      if (isManuallyAddedItem(item)) {
        // Normalize text (trim, lowercase) for deduplication
        const normalizedText = item.itemText.trim().toLowerCase();
        manualItemsSet.add(normalizedText);
      }
    });
  });

  // Convert back to original casing (use first occurrence)
  const itemTextMap = new Map<string, string>();
  packingLists.forEach(list => {
    list.items.forEach(item => {
      if (isManuallyAddedItem(item)) {
        const normalized = item.itemText.trim().toLowerCase();
        if (!itemTextMap.has(normalized)) {
          itemTextMap.set(normalized, item.itemText.trim());
        }
      }
    });
  });

  return Array.from(manualItemsSet).map(normalized =>
    itemTextMap.get(normalized)!
  );
}
```

### Filtering Out Existing Items

Compare against current question set to avoid suggesting items already present:

```typescript
function filterExistingItems(
  suggestions: string[],
  questionSet: PackingListQuestionSet
): string[] {
  // Get all existing item texts (normalized)
  const existingItems = new Set<string>();

  // From always needed items
  questionSet.alwaysNeededItems.forEach(item => {
    existingItems.add(item.text.trim().toLowerCase());
  });

  // From all question options
  questionSet.questions.forEach(question => {
    question.options.forEach(option => {
      option.items.forEach(item => {
        existingItems.add(item.text.trim().toLowerCase());
      });
    });
  });

  // Filter suggestions
  return suggestions.filter(suggestion =>
    !existingItems.has(suggestion.toLowerCase())
  );
}
```

## 3. UI/UX Design Recommendations

### Location on Edit Questions Page

**Option A: Collapsible Sidebar Panel (Recommended)**
- Add a right sidebar that can be toggled open/closed
- Sticky positioning so it's always visible while scrolling
- Similar to the existing status sidebar but on the opposite side
- Benefits:
  - Always accessible without cluttering main content
  - Can be hidden when not needed
  - Follows existing design patterns

**Option B: Callout Banner at Top**
- Similar to the "Get Started with Example Questions" callout
- Show when suggestions are available
- Can be dismissed
- Benefits:
  - Highly visible
  - Simple to implement
  - Uses existing Callout component

**Option C: Modal/Popover**
- Button in toolbar to open suggestions modal
- Benefits:
  - Focused experience
  - Doesn't take up screen real estate

### Visual Design Concept (Option A - Recommended)

```
┌─────────────────────────────────────────────────┐
│  Edit Questions Page                  [Sidebar] │
├─────────────────────────────────┬───────────────┤
│                                 │               │
│  People Section                 │  💡 Suggested │
│  ├─ Me                          │     Items     │
│  └─ [Add Person]                │               │
│                                 │  From recent  │
│  Always Needed Items            │  packing lists│
│  ├─ Passport                    │               │
│  ├─ Phone charger               │  ✓ Add All    │
│  └─ [Add Item]                  │               │
│                                 │  □ Sunscreen  │
│  Questions                      │    [+ Add]    │
│  Q1: Beach or Mountain?         │               │
│    ○ Beach                      │  □ Hiking     │
│      - Swimsuit                 │     boots     │
│      - Beach towel              │    [+ Add]    │
│    ○ Mountain                   │               │
│      - Hiking boots             │  □ Insect     │
│      - Warm jacket              │     repellent │
│                                 │    [+ Add]    │
│  [+ Add Question]               │               │
│                                 │  [< Hide]     │
└─────────────────────────────────┴───────────────┘
```

### Interactive Elements

**Suggestion Card:**
```tsx
<div className="suggestion-item">
  <label className="flex items-center gap-2">
    <input type="checkbox" checked={selected} onChange={...} />
    <span className="text-sm">{itemText}</span>
  </label>
  <button
    onClick={() => handleQuickAdd(itemText)}
    className="text-blue-600 hover:text-blue-800"
  >
    + Add
  </button>
</div>
```

**Features:**
1. **Quick Add Button**: Instantly adds item to "Always Needed Items"
2. **Batch Selection**: Checkboxes to select multiple items
3. **Add All Selected**: Bulk add checked items
4. **Dismiss Individual**: Remove suggestions you don't want to see
5. **Empty State**: Show helpful message when no suggestions available

### Empty State Message
```
No recent manual items found

You haven't added any custom items to your last 3 packing lists.
Manual items you add will appear here as suggestions.
```

## 4. Technical Implementation Plan

### A. Create Suggestion Service

**File**: `src/services/suggestions.ts`

```typescript
import { PackingList, PackingListItem } from '../create-packing-list/types'
import { PackingListQuestionSet } from '../edit-questions/types'
import { PackingAppDatabase } from './database'

export class SuggestionService {
  private db: PackingAppDatabase

  constructor() {
    this.db = PackingAppDatabase.getInstance()
  }

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

  private async getRecentPackingLists(count: number): Promise<PackingList[]> {
    const allLists = await this.db.getAllPackingLists()
    return allLists
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, count)
  }

  private extractManualItems(lists: PackingList[]): string[] {
    const itemMap = new Map<string, string>()

    lists.forEach(list => {
      list.items.forEach(item => {
        if (this.isManuallyAddedItem(item)) {
          const normalized = item.itemText.trim().toLowerCase()
          if (!itemMap.has(normalized)) {
            itemMap.set(normalized, item.itemText.trim())
          }
        }
      })
    })

    return Array.from(itemMap.values())
  }

  private isManuallyAddedItem(item: PackingListItem): boolean {
    return item.questionId === '' && item.optionId === ''
  }

  private filterExistingItems(
    suggestions: string[],
    questionSet: PackingListQuestionSet
  ): string[] {
    const existing = new Set<string>()

    // Add always needed items
    questionSet.alwaysNeededItems.forEach(item => {
      existing.add(item.text.trim().toLowerCase())
    })

    // Add all items from questions
    questionSet.questions.forEach(q => {
      q.options.forEach(opt => {
        opt.items.forEach(item => {
          existing.add(item.text.trim().toLowerCase())
        })
      })
    })

    return suggestions.filter(s => !existing.has(s.toLowerCase()))
  }
}

export const suggestionService = new SuggestionService()
```

### B. Create Suggestions Panel Component

**File**: `src/edit-questions/suggestions-panel.tsx`

```typescript
import { useState, useEffect } from 'react'
import { PackingListQuestionSet, Item } from './types'
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
        className="fixed right-0 top-32 bg-blue-600 text-white px-3 py-6 rounded-l-lg shadow-lg hover:bg-blue-700 transition-colors z-40"
        title="Show suggestions"
      >
        <span className="writing-mode-vertical">💡 Suggestions</span>
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
            className="text-gray-500 hover:text-gray-700"
            title="Hide panel"
          >
            ✕
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
            Loading suggestions...
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
                    size="sm"
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
                      className="flex-1 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      + Add to Always Needed
                    </button>
                    <button
                      onClick={() => handleDismiss(item)}
                      className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
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
```

### C. Integrate into Edit Questions Form

**File**: `src/pages/edit-questions-form.tsx` (modifications needed)

```typescript
// Add state for suggestions panel
const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false)

// Add handler to add item to always needed items
const handleAddSuggestedItem = useCallback((itemText: string) => {
  const currentData = getValues()
  const people = currentData.people || []

  const newItem: Item = {
    text: itemText,
    personSelections: people.map(person => ({
      personId: person.id,
      selected: true // Default to selected for all people
    }))
  }

  const updatedItems = [...(currentData.alwaysNeededItems || []), newItem]
  setValue('alwaysNeededItems', updatedItems)
}, [getValues, setValue])

// Add handler for multiple items
const handleAddMultipleSuggestedItems = useCallback((itemTexts: string[]) => {
  itemTexts.forEach(text => handleAddSuggestedItem(text))
}, [handleAddSuggestedItem])

// In JSX, add the suggestions panel
return (
  <div className="relative">
    {/* Existing content */}
    <div className={showSuggestionsPanel ? 'pr-80' : ''}>
      {/* All existing edit questions form content */}
    </div>

    {/* Suggestions Panel */}
    <SuggestionsPanel
      questionSet={currentQuestionSet}
      onAddItem={handleAddSuggestedItem}
      onAddMultipleItems={handleAddMultipleSuggestedItems}
      isOpen={showSuggestionsPanel}
      onToggle={() => setShowSuggestionsPanel(!showSuggestionsPanel)}
    />
  </div>
)
```

## 5. Advanced Features (Future Enhancements)

### A. Frequency Tracking
Track how often items appear across packing lists:

```typescript
interface SuggestionWithMetadata {
  text: string
  frequency: number        // How many lists contained this
  lastUsed: string        // ISO date of most recent list
  totalLists: number      // Out of how many lists checked
}
```

Show most common items first, with visual indicators:
```
★★★ Sunscreen (3/3 lists)
★★☆ Hiking boots (2/3 lists)
★☆☆ Travel adapter (1/3 lists)
```

### B. Smart Categorization
Group suggestions by likely category based on pattern matching:
- Beach items (sunscreen, swimsuit, etc.)
- Hiking items (boots, water bottle, etc.)
- Baby items (diapers, wipes, etc.)

### C. Contextual Suggestions
When user adds a new question about "Beach or Mountain", prioritize showing:
- Beach-related manual items from past trips
- Mountain-related manual items

### D. Persistence
Store dismissed items in localStorage to avoid showing them again:

```typescript
const DISMISSED_ITEMS_KEY = 'packing-app-dismissed-suggestions'

function loadDismissedItems(): Set<string> {
  const stored = localStorage.getItem(DISMISSED_ITEMS_KEY)
  return stored ? new Set(JSON.parse(stored)) : new Set()
}

function saveDismissedItems(items: Set<string>) {
  localStorage.setItem(DISMISSED_ITEMS_KEY, JSON.stringify(Array.from(items)))
}
```

### E. Undo Dismiss
Add a "Show dismissed items" toggle to bring back items user previously dismissed.

## 6. Testing Considerations

### Unit Tests
- `SuggestionService.isManuallyAddedItem()`
- `SuggestionService.extractManualItems()`
- `SuggestionService.filterExistingItems()`
- Deduplication logic (case-insensitive)

### Integration Tests
- Load suggestions with empty database
- Load suggestions with 1-2 lists (less than 3)
- Load suggestions with 5+ lists (should only use 3 most recent)
- Add suggested item to always needed items
- Dismiss and re-load suggestions

### Edge Cases
- No packing lists exist yet
- Packing lists have no manual items
- All manual items already exist in question set
- Very long item text (UI overflow)
- Special characters in item names
- Duplicate items with different casing

## 7. Performance Considerations

### Caching
- Cache suggestions until question set changes
- Debounce re-loading suggestions when form updates
- Only reload when `alwaysNeededItems` or question items change

### Optimization
```typescript
const debouncedReload = useDebouncedCallback(() => {
  loadSuggestions()
}, 1000)

useEffect(() => {
  // Watch for changes to items that would affect suggestions
  debouncedReload()
}, [questionSet.alwaysNeededItems, questionSet.questions])
```

### Database Query Efficiency
- Current `getAllPackingLists()` is fine for small datasets
- For large datasets (100+ lists), consider adding index or pagination
- Could add `getRecentPackingLists(limit: number)` method to database service

## 8. Accessibility

### Keyboard Navigation
- Tab through suggestion items
- Space to toggle checkbox
- Enter to quick-add item
- Escape to close panel

### Screen Readers
- Proper ARIA labels
- Announce when items are added
- Count of available suggestions

### Visual
- High contrast for text
- Clear focus indicators
- Sufficient touch targets (44x44px minimum)

## 9. Recommended Implementation Order

### Phase 1: Core Functionality (MVP)
1. ✅ Create `SuggestionService` class
2. ✅ Create `SuggestionsPanel` component (basic)
3. ✅ Integrate into edit questions form
4. ✅ Add "quick add to always needed" functionality
5. ✅ Add empty state handling

### Phase 2: Enhanced UX
6. Add batch selection and "Add All Selected"
7. Add dismiss functionality
8. Add visual polish (animations, hover states)
9. Add loading states
10. Persist dismissed items to localStorage

### Phase 3: Advanced Features
11. Add frequency tracking
12. Add contextual suggestions
13. Add undo dismiss
14. Add suggestion categories

## 10. Files to Create/Modify

### New Files
- `src/services/suggestions.ts` - Suggestion service logic
- `src/edit-questions/suggestions-panel.tsx` - UI component
- `src/services/__tests__/suggestions.test.ts` - Unit tests

### Modified Files
- `src/pages/edit-questions-form.tsx` - Integrate panel
- `src/services/database.ts` - (Optional) Add optimized query method

### Estimated Lines of Code
- Service: ~120 lines
- Component: ~200 lines
- Integration: ~30 lines
- Tests: ~150 lines
- **Total: ~500 lines**

## Conclusion

This feature provides significant value by:
1. **Reducing repetitive work**: Users don't need to re-type commonly used items
2. **Learning from history**: App becomes smarter based on user behavior
3. **Discovery**: Users might remember items they forgot
4. **Onboarding**: Helps new users see what kinds of items others (or they) have needed

The implementation is straightforward, leveraging existing data structures and UI patterns. The recommended approach (collapsible sidebar) is non-intrusive and follows the app's existing design language.
