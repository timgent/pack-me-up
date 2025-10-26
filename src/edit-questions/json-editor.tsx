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
export function JsonEditor({ value, onChange, error, onSave, hasUnsavedChanges }: JsonEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const [userPrompt, setUserPrompt] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

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
