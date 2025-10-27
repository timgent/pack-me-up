import { useRef, useCallback, useState } from 'react'

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  error: string | null
  originalValue: string
  onSave: () => void
  hasUnsavedChanges: boolean
}

/**
 * JSON editor component for advanced users to edit question data directly.
 * Provides a textarea with monospace font, line numbers, error display, LLM prompt generation,
 * save button, and scroll to top functionality.
 */
export function JsonEditor({ value, onChange, error, originalValue, onSave, hasUnsavedChanges }: JsonEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const [userPrompt, setUserPrompt] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [diffTab, setDiffTab] = useState<'summary' | 'questions' | 'items'>('summary')

  // Count lines in the value
  const lineCount = value.split('\n').length

  // Sync scroll between line numbers and textarea
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
      // Show scroll to top button when scrolled down
      setShowScrollTop(textareaRef.current.scrollTop > 200)
    }
  }, [])

  // Scroll to top of JSON editor
  const scrollToTop = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0
    }
  }, [])

  // Generate comprehensive prompt for LLM
  const generatePrompt = useCallback(() => {
    return `You are helping to modify a packing list question set JSON. Please read the specifications below, review the current JSON, and make the requested changes.

# JSON Structure Specification

The JSON represents a packing list question set with the following structure:

## Top-Level Fields:
- **people**: Array of people who will be packing
  - Each person has: { id: string, name: string }

- **alwaysNeededItems**: Array of items always needed regardless of answers
  - Each item has: { text: string, personSelections: Array<{ personId: string, selected: boolean }> }

- **questions**: Array of questions that determine what to pack
  - Each question has:
    - id: string (UUID)
    - type: "draft" | "saved"
    - text: string (the question text)
    - order: number (display order)
    - questionType: "single-choice" | "multiple-choice" (optional, defaults to single-choice)
    - options: Array of answer options
      - Each option has:
        - id: string (UUID)
        - text: string (the answer text)
        - order: number (display order)
        - items: Array of items needed if this option is selected
          - Each item: { text: string, personSelections: Array<{ personId: string, selected: boolean }> }

## Important Rules:
1. All IDs should be valid UUIDs (use crypto.randomUUID() format if creating new items)
2. questionType can be "single-choice" (user picks one option) or "multiple-choice" (user can pick multiple)
3. personSelections tracks which people need each item
4. The order field determines display order (lower numbers appear first)

# Current JSON:

\`\`\`json
${value}
\`\`\`

# Instructions:

Please make the following changes to the JSON and return ONLY the complete updated JSON (no explanations, just the JSON):

${userPrompt}`
  }, [value, userPrompt])

  // Copy prompt to clipboard
  const handleCopyPrompt = useCallback(async () => {
    const prompt = generatePrompt()
    try {
      await navigator.clipboard.writeText(prompt)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      alert('Failed to copy to clipboard')
    }
  }, [generatePrompt])

  // Compute summary statistics
  const computeSummary = useCallback(() => {
    try {
      const original = JSON.parse(originalValue || '{}')
      const current = JSON.parse(value || '{}')

      const originalQuestions = original.questions || []
      const currentQuestions = current.questions || []
      const originalPeople = original.people || []
      const currentPeople = current.people || []

      // Collect all items
      const originalItems = new Set<string>()
      const currentItems = new Set<string>()

      originalQuestions.forEach((q: any) => {
        q.options?.forEach((opt: any) => {
          opt.items?.forEach((item: any) => originalItems.add(item.text))
        })
      })
      original.alwaysNeededItems?.forEach((item: any) => originalItems.add(item.text))

      currentQuestions.forEach((q: any) => {
        q.options?.forEach((opt: any) => {
          opt.items?.forEach((item: any) => currentItems.add(item.text))
        })
      })
      current.alwaysNeededItems?.forEach((item: any) => currentItems.add(item.text))

      return {
        questionsAdded: currentQuestions.filter((q: any) => !originalQuestions.find((oq: any) => oq.text === q.text)).length,
        questionsRemoved: originalQuestions.filter((q: any) => !currentQuestions.find((cq: any) => cq.text === q.text)).length,
        questionsModified: currentQuestions.filter((q: any) => {
          const orig = originalQuestions.find((oq: any) => oq.text === q.text)
          return orig && orig.questionType !== q.questionType
        }).length,
        itemsAdded: Array.from(currentItems).filter(item => !originalItems.has(item)).length,
        itemsRemoved: Array.from(originalItems).filter(item => !currentItems.has(item)).length,
        peopleAdded: currentPeople.filter((p: any) => !originalPeople.find((op: any) => op.name === p.name)).length,
        peopleRemoved: originalPeople.filter((p: any) => !currentPeople.find((cp: any) => cp.name === p.name)).length
      }
    } catch {
      return { questionsAdded: 0, questionsRemoved: 0, questionsModified: 0, itemsAdded: 0, itemsRemoved: 0, peopleAdded: 0, peopleRemoved: 0 }
    }
  }, [originalValue, value])

  // Compute questions diff
  const computeQuestionsDiff = useCallback(() => {
    try {
      const original = JSON.parse(originalValue || '{}')
      const current = JSON.parse(value || '{}')

      const originalQuestions = original.questions || []
      const currentQuestions = current.questions || []

      const added = currentQuestions.filter((q: any) => !originalQuestions.find((oq: any) => oq.text === q.text))
      const removed = originalQuestions.filter((q: any) => !currentQuestions.find((cq: any) => cq.text === q.text))
      const modified = currentQuestions.filter((q: any) => {
        const orig = originalQuestions.find((oq: any) => oq.text === q.text)
        return orig && orig.questionType !== q.questionType
      }).map((q: any) => {
        const orig = originalQuestions.find((oq: any) => oq.text === q.text)
        return { text: q.text, oldType: orig.questionType || 'single-choice', newType: q.questionType || 'single-choice' }
      })

      return { added, removed, modified }
    } catch {
      return { added: [], removed: [], modified: [] }
    }
  }, [originalValue, value])

  // Compute items diff (deduplicated)
  const computeItemsDiff = useCallback(() => {
    try {
      const original = JSON.parse(originalValue || '{}')
      const current = JSON.parse(value || '{}')

      const originalQuestions = original.questions || []
      const currentQuestions = current.questions || []

      // Map of item text -> locations
      const originalItemLocations = new Map<string, string[]>()
      const currentItemLocations = new Map<string, string[]>()

      // Collect original item locations
      originalQuestions.forEach((q: any) => {
        q.options?.forEach((opt: any) => {
          opt.items?.forEach((item: any) => {
            const location = `${q.text} > ${opt.text}`
            const locs = originalItemLocations.get(item.text) || []
            locs.push(location)
            originalItemLocations.set(item.text, locs)
          })
        })
      })
      original.alwaysNeededItems?.forEach((item: any) => {
        const locs = originalItemLocations.get(item.text) || []
        locs.push('Always Needed')
        originalItemLocations.set(item.text, locs)
      })

      // Collect current item locations
      currentQuestions.forEach((q: any) => {
        q.options?.forEach((opt: any) => {
          opt.items?.forEach((item: any) => {
            const location = `${q.text} > ${opt.text}`
            const locs = currentItemLocations.get(item.text) || []
            locs.push(location)
            currentItemLocations.set(item.text, locs)
          })
        })
      })
      current.alwaysNeededItems?.forEach((item: any) => {
        const locs = currentItemLocations.get(item.text) || []
        locs.push('Always Needed')
        currentItemLocations.set(item.text, locs)
      })

      // Categorize items
      const added: Array<{ text: string, locations: string[] }> = []
      const removed: Array<{ text: string, locations: string[] }> = []
      const modified: Array<{ text: string, oldLocations: string[], newLocations: string[] }> = []

      // Find added and modified
      currentItemLocations.forEach((locs, itemText) => {
        const oldLocs = originalItemLocations.get(itemText)
        if (!oldLocs) {
          added.push({ text: itemText, locations: locs })
        } else if (JSON.stringify(locs.sort()) !== JSON.stringify(oldLocs.sort())) {
          modified.push({ text: itemText, oldLocations: oldLocs, newLocations: locs })
        }
      })

      // Find removed
      originalItemLocations.forEach((locs, itemText) => {
        if (!currentItemLocations.has(itemText)) {
          removed.push({ text: itemText, locations: locs })
        }
      })

      return { added, removed, modified }
    } catch {
      return { added: [], removed: [], modified: [] }
    }
  }, [originalValue, value])

  return (
    <div className="json-editor-container">
      <div className="json-editor-header">
        <h3>Raw JSON Editor</h3>
        <p className="json-editor-help">
          Edit the question set JSON directly. Changes will be applied when you switch back to Visual Editor mode.
        </p>
      </div>

      {/* LLM Prompt Generator */}
      <div className="llm-prompt-section">
        <div className="llm-prompt-header">
          <h4>🤖 AI Assistant Prompt Generator</h4>
          <p className="llm-prompt-help">
            Describe what changes you want to make, then click the button to generate a prompt for your favorite LLM (ChatGPT, Claude, etc.)
          </p>
        </div>
        <div className="llm-prompt-input-group">
          <textarea
            className="llm-prompt-textarea"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Example: Add a new question about the weather with options for sunny, rainy, and snowy. For rainy, add umbrella and raincoat items."
            rows={3}
          />
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="llm-prompt-button"
            disabled={!userPrompt.trim()}
          >
            {copySuccess ? (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Generate and Copy Prompt
              </>
            )}
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="json-editor-save-section">
        <button
          type="button"
          onClick={onSave}
          className={`json-editor-save-button ${hasUnsavedChanges ? 'has-changes' : ''}`}
          disabled={!!error}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          {hasUnsavedChanges ? 'Save JSON Changes' : 'No Changes to Save'}
        </button>
        {hasUnsavedChanges && (
          <p className="json-editor-save-hint">
            You have unsaved changes in the JSON editor
          </p>
        )}
      </div>

      {/* Diff View Toggle */}
      {hasUnsavedChanges && (
        <div className="diff-toggle-section">
          <button
            type="button"
            onClick={() => setShowDiff(!showDiff)}
            className="diff-toggle-button"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {showDiff ? 'Hide' : 'Show'} Changes (Diff View)
          </button>
        </div>
      )}

      {/* Diff View */}
      {showDiff && hasUnsavedChanges && (
        <div className="diff-view-container">
          {/* Tabs */}
          <div className="diff-tabs">
            <button
              className={`diff-tab ${diffTab === 'summary' ? 'active' : ''}`}
              onClick={() => setDiffTab('summary')}
            >
              Summary
            </button>
            <button
              className={`diff-tab ${diffTab === 'questions' ? 'active' : ''}`}
              onClick={() => setDiffTab('questions')}
            >
              Questions ({computeQuestionsDiff().added.length + computeQuestionsDiff().removed.length + computeQuestionsDiff().modified.length})
            </button>
            <button
              className={`diff-tab ${diffTab === 'items' ? 'active' : ''}`}
              onClick={() => setDiffTab('items')}
            >
              Items ({computeItemsDiff().added.length + computeItemsDiff().removed.length + computeItemsDiff().modified.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="diff-tab-content">
            {diffTab === 'summary' && (
              <div className="diff-summary">
                {(() => {
                  const summary = computeSummary()
                  const hasChanges = summary.questionsAdded > 0 || summary.questionsRemoved > 0 || summary.questionsModified > 0 ||
                    summary.itemsAdded > 0 || summary.itemsRemoved > 0 ||
                    summary.peopleAdded > 0 || summary.peopleRemoved > 0

                  if (!hasChanges) return <p className="diff-no-changes">No changes detected</p>

                  return (
                    <>
                      <div className="diff-summary-section">
                        <h4>Questions</h4>
                        {summary.questionsAdded > 0 && <div className="diff-summary-item added">+ {summary.questionsAdded} added</div>}
                        {summary.questionsRemoved > 0 && <div className="diff-summary-item removed">- {summary.questionsRemoved} removed</div>}
                        {summary.questionsModified > 0 && <div className="diff-summary-item modified">~ {summary.questionsModified} modified</div>}
                        {summary.questionsAdded === 0 && summary.questionsRemoved === 0 && summary.questionsModified === 0 && (
                          <div className="diff-summary-item">No changes</div>
                        )}
                      </div>
                      <div className="diff-summary-section">
                        <h4>Items</h4>
                        {summary.itemsAdded > 0 && <div className="diff-summary-item added">+ {summary.itemsAdded} added</div>}
                        {summary.itemsRemoved > 0 && <div className="diff-summary-item removed">- {summary.itemsRemoved} removed</div>}
                        {summary.itemsAdded === 0 && summary.itemsRemoved === 0 && (
                          <div className="diff-summary-item">No changes</div>
                        )}
                      </div>
                      <div className="diff-summary-section">
                        <h4>People</h4>
                        {summary.peopleAdded > 0 && <div className="diff-summary-item added">+ {summary.peopleAdded} added</div>}
                        {summary.peopleRemoved > 0 && <div className="diff-summary-item removed">- {summary.peopleRemoved} removed</div>}
                        {summary.peopleAdded === 0 && summary.peopleRemoved === 0 && (
                          <div className="diff-summary-item">No changes</div>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            {diffTab === 'questions' && (
              <div className="diff-questions">
                {(() => {
                  const qDiff = computeQuestionsDiff()
                  const hasChanges = qDiff.added.length > 0 || qDiff.removed.length > 0 || qDiff.modified.length > 0

                  if (!hasChanges) return <p className="diff-no-changes">No question changes</p>

                  return (
                    <>
                      {qDiff.added.length > 0 && (
                        <div className="diff-section">
                          <h4 className="diff-section-title added">Added Questions</h4>
                          {qDiff.added.map((q: any, idx: number) => (
                            <div key={idx} className="diff-item added">
                              <strong>{q.text}</strong>
                              <span className="diff-item-meta">({q.questionType || 'single-choice'})</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {qDiff.removed.length > 0 && (
                        <div className="diff-section">
                          <h4 className="diff-section-title removed">Removed Questions</h4>
                          {qDiff.removed.map((q: any, idx: number) => (
                            <div key={idx} className="diff-item removed">
                              <strong>{q.text}</strong>
                              <span className="diff-item-meta">({q.questionType || 'single-choice'})</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {qDiff.modified.length > 0 && (
                        <div className="diff-section">
                          <h4 className="diff-section-title modified">Modified Questions</h4>
                          {qDiff.modified.map((q: any, idx: number) => (
                            <div key={idx} className="diff-item modified">
                              <strong>{q.text}</strong>
                              <div className="diff-item-change">Type: {q.oldType} → {q.newType}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            {diffTab === 'items' && (
              <div className="diff-items">
                {(() => {
                  const iDiff = computeItemsDiff()
                  const hasChanges = iDiff.added.length > 0 || iDiff.removed.length > 0 || iDiff.modified.length > 0

                  if (!hasChanges) return <p className="diff-no-changes">No item changes</p>

                  return (
                    <>
                      {iDiff.added.length > 0 && (
                        <div className="diff-section">
                          <h4 className="diff-section-title added">Added Items</h4>
                          {iDiff.added.map((item, idx) => (
                            <div key={idx} className="diff-item added">
                              <strong>+ {item.text}</strong>
                              <div className="diff-item-locations">
                                in: {item.locations.join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {iDiff.removed.length > 0 && (
                        <div className="diff-section">
                          <h4 className="diff-section-title removed">Removed Items</h4>
                          {iDiff.removed.map((item, idx) => (
                            <div key={idx} className="diff-item removed">
                              <strong>- {item.text}</strong>
                              <div className="diff-item-locations">
                                was in: {item.locations.join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {iDiff.modified.length > 0 && (
                        <div className="diff-section">
                          <h4 className="diff-section-title modified">Modified Items</h4>
                          {iDiff.modified.map((item, idx) => (
                            <div key={idx} className="diff-item modified">
                              <strong>~ {item.text}</strong>
                              <div className="diff-item-locations">
                                was in: {item.oldLocations.join(', ')}
                              </div>
                              <div className="diff-item-locations">
                                now in: {item.newLocations.join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="json-editor-wrapper">
        <div className="json-editor-line-numbers" ref={lineNumbersRef}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="json-editor-line-number">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="json-editor-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          placeholder="Enter question set JSON..."
        />
      </div>

      {error && (
        <div className="json-editor-error">
          <strong>Validation Error:</strong> {error}
        </div>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="json-editor-scroll-top"
          title="Scroll to top"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}
    </div>
  )
}
