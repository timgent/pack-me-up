interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  error: string | null
}

/**
 * JSON editor component for advanced users to edit question data directly.
 * Provides a textarea with monospace font and error display.
 */
export function JsonEditor({ value, onChange, error }: JsonEditorProps) {
  return (
    <div className="json-editor-container">
      <div className="json-editor-header">
        <h3>Raw JSON Editor</h3>
        <p className="json-editor-help">
          Edit the question set JSON directly. Changes will be applied when you switch back to Visual Editor mode.
        </p>
      </div>

      <textarea
        className="json-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="Enter question set JSON..."
      />

      {error && (
        <div className="json-editor-error">
          <strong>Validation Error:</strong> {error}
        </div>
      )}
    </div>
  )
}
