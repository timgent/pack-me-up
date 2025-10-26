import { useRef, useCallback } from 'react'

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  error: string | null
}

/**
 * JSON editor component for advanced users to edit question data directly.
 * Provides a textarea with monospace font, line numbers, and error display.
 */
export function JsonEditor({ value, onChange, error }: JsonEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  // Count lines in the value
  const lineCount = value.split('\n').length

  // Sync scroll between line numbers and textarea
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  return (
    <div className="json-editor-container">
      <div className="json-editor-header">
        <h3>Raw JSON Editor</h3>
        <p className="json-editor-help">
          Edit the question set JSON directly. Changes will be applied when you switch back to Visual Editor mode.
        </p>
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
    </div>
  )
}
