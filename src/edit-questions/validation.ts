import { PackingListQuestionSetSchema } from './types'
import { ZodError, ZodIssue } from 'zod'

export interface ValidationError {
  path: string
  message: string
  lineNumber?: number
  context?: string
}

export interface ValidationResult {
  valid: boolean
  error?: string // Summary message for backward compatibility
  errors?: ValidationError[] // All validation errors
}

/**
 * Converts a Zod error into a more human-readable error message with context
 */
function enhanceErrorMessage(issue: ZodIssue, data: unknown): { message: string; context?: string } {
  const path = issue.path.join('.')

  // Get the actual value at this path
  let actualValue: unknown
  try {
    actualValue = issue.path.reduce((obj, key) => obj?.[key], data as Record<string, unknown>)
  } catch {
    actualValue = undefined
  }

  // Create context-aware error messages
  let enhancedMessage = issue.message
  let context: string | undefined

  // Check the issue code for more specific messages
  if (issue.code === 'invalid_type') {
    if (issue.expected === 'array' && actualValue === undefined) {
      enhancedMessage = `Missing required array field`
    } else if (issue.expected === 'object' && actualValue === undefined) {
      enhancedMessage = `Missing required object`
    } else {
      enhancedMessage = `Expected ${issue.expected}, got ${typeof actualValue}`
    }
  } else if (issue.code === 'invalid_union') {
    enhancedMessage = `Value doesn't match any of the expected types`
    if (path.includes('questionType')) {
      enhancedMessage = `Must be "single-choice" or "multiple-choice"`
    }
  } else if (issue.code === 'too_small') {
    enhancedMessage = `Value is too small (minimum: ${issue.minimum})`
  } else if (issue.code === 'unrecognized_keys' && 'keys' in issue) {
    enhancedMessage = `Unexpected field(s): ${(issue as { keys: string[] }).keys.join(', ')}`
  }

  // Add context showing the actual value if it's a simple type
  if (actualValue !== undefined && actualValue !== null) {
    if (typeof actualValue === 'string' || typeof actualValue === 'number' || typeof actualValue === 'boolean') {
      context = `Current value: ${JSON.stringify(actualValue)}`
    } else if (typeof actualValue === 'object') {
      context = `Current value: ${JSON.stringify(actualValue).substring(0, 100)}${JSON.stringify(actualValue).length > 100 ? '...' : ''}`
    }
  }

  return { message: enhancedMessage, context }
}

/**
 * Finds the line number in the JSON text for a given path
 */
export function findLineNumberForPath(jsonText: string, path: string): number | undefined {
  if (!path || path === 'root') return 1

  const pathParts = path.split('.')
  const lines = jsonText.split('\n')

  try {
    const searchPath = [...pathParts]

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Look for the current path part
      if (searchPath.length > 0) {
        const currentPart = searchPath[0]

        // Check if this line contains our target field
        const fieldPattern = new RegExp(`["']${currentPart}["']\\s*:`)
        const arrayIndexPattern = /^\s*{/ // For array indices, look for object start

        if (fieldPattern.test(trimmed)) {
          searchPath.shift()
          if (searchPath.length === 0) {
            return i + 1 // Line numbers are 1-indexed
          }
        } else if (!isNaN(Number(currentPart)) && arrayIndexPattern.test(trimmed)) {
          // Handle array indices - this is approximate
          searchPath.shift()
          if (searchPath.length === 0) {
            return i + 1
          }
        }
      }
    }
  } catch {
    // If we can't find it, return undefined
  }

  return undefined
}

/**
 * Validates a question set JSON structure using Zod schema validation.
 * Ensures all required fields and proper data types before applying to the form.
 * Returns all validation errors, not just the first one.
 */
export function validateQuestionSet(data: unknown, jsonText?: string): ValidationResult {
  const result = PackingListQuestionSetSchema.safeParse(data)

  if (result.success) {
    return { valid: true }
  }

  // Format all Zod errors for user-friendly display
  const zodError = result.error as ZodError
  const errors: ValidationError[] = zodError.issues.map(issue => {
    const path = issue.path.join('.') || 'root'
    const { message, context } = enhanceErrorMessage(issue, data)

    return {
      path,
      message,
      context,
      lineNumber: jsonText ? findLineNumberForPath(jsonText, path) : undefined
    }
  })

  // Create summary message
  const errorCount = errors.length
  const summary = `Found ${errorCount} validation error${errorCount > 1 ? 's' : ''}`

  // Also include first error in summary for backward compatibility
  const firstError = errors[0]
  const detailedSummary = `${summary}: ${firstError.path}: ${firstError.message}`

  return {
    valid: false,
    error: detailedSummary,
    errors
  }
}
