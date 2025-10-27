import { PackingListQuestionSetSchema } from './types'
import { ZodError } from 'zod'

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validates a question set JSON structure using Zod schema validation.
 * Ensures all required fields and proper data types before applying to the form.
 */
export function validateQuestionSet(data: any): ValidationResult {
  const result = PackingListQuestionSetSchema.safeParse(data)

  if (result.success) {
    return { valid: true }
  }

  // Format Zod error for user-friendly display
  const zodError = result.error as ZodError
  const firstIssue = zodError.issues[0]
  const path = firstIssue.path.join('.')
  const message = firstIssue.message

  return {
    valid: false,
    error: path ? `${path}: ${message}` : message
  }
}
