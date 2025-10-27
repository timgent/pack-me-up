import { PackingListQuestionSetSchema } from './types'
import { ZodError } from 'zod'

export interface ValidationError {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  error?: string // Summary message for backward compatibility
  errors?: ValidationError[] // All validation errors
}

/**
 * Validates a question set JSON structure using Zod schema validation.
 * Ensures all required fields and proper data types before applying to the form.
 * Returns all validation errors, not just the first one.
 */
export function validateQuestionSet(data: any): ValidationResult {
  const result = PackingListQuestionSetSchema.safeParse(data)

  if (result.success) {
    return { valid: true }
  }

  // Format all Zod errors for user-friendly display
  const zodError = result.error as ZodError
  const errors: ValidationError[] = zodError.issues.map(issue => ({
    path: issue.path.join('.') || 'root',
    message: issue.message
  }))

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
