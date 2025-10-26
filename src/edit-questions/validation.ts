export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validates a question set JSON structure to ensure it has all required fields
 * and proper data types before applying to the form.
 */
export function validateQuestionSet(data: any): ValidationResult {
  // Check if data is an object
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Data must be an object' }
  }

  // Validate people array
  if (!data.people) {
    return { valid: false, error: 'Missing "people" array' }
  }

  if (!Array.isArray(data.people)) {
    return { valid: false, error: '"people" must be an array' }
  }

  for (let i = 0; i < data.people.length; i++) {
    const person = data.people[i]
    if (!person.id || typeof person.id !== 'string') {
      return { valid: false, error: `Person at index ${i} missing or invalid "id"` }
    }
    if (!person.name || typeof person.name !== 'string') {
      return { valid: false, error: `Person at index ${i} missing or invalid "name"` }
    }
  }

  // Validate alwaysNeededItems array
  if (!data.alwaysNeededItems) {
    return { valid: false, error: 'Missing "alwaysNeededItems" array' }
  }

  if (!Array.isArray(data.alwaysNeededItems)) {
    return { valid: false, error: '"alwaysNeededItems" must be an array' }
  }

  for (let i = 0; i < data.alwaysNeededItems.length; i++) {
    const item = data.alwaysNeededItems[i]
    const itemValidation = validateItem(item, `alwaysNeededItems[${i}]`)
    if (!itemValidation.valid) {
      return itemValidation
    }
  }

  // Validate questions array
  if (!data.questions) {
    return { valid: false, error: 'Missing "questions" array' }
  }

  if (!Array.isArray(data.questions)) {
    return { valid: false, error: '"questions" must be an array' }
  }

  for (let i = 0; i < data.questions.length; i++) {
    const question = data.questions[i]
    const questionValidation = validateQuestion(question, i)
    if (!questionValidation.valid) {
      return questionValidation
    }
  }

  return { valid: true }
}

function validateQuestion(question: any, index: number): ValidationResult {
  const prefix = `Question at index ${index}`

  if (!question.id || typeof question.id !== 'string') {
    return { valid: false, error: `${prefix}: missing or invalid "id"` }
  }

  if (!question.text || typeof question.text !== 'string') {
    return { valid: false, error: `${prefix}: missing or invalid "text"` }
  }

  if (!question.type || (question.type !== 'draft' && question.type !== 'saved')) {
    return { valid: false, error: `${prefix}: "type" must be "draft" or "saved"` }
  }

  if (typeof question.order !== 'number') {
    return { valid: false, error: `${prefix}: missing or invalid "order" (must be a number)` }
  }

  if (question.questionType && question.questionType !== 'single-choice' && question.questionType !== 'multiple-choice') {
    return { valid: false, error: `${prefix}: "questionType" must be "single-choice" or "multiple-choice"` }
  }

  if (!question.options || !Array.isArray(question.options)) {
    return { valid: false, error: `${prefix}: missing or invalid "options" array` }
  }

  for (let j = 0; j < question.options.length; j++) {
    const option = question.options[j]
    const optionValidation = validateOption(option, index, j)
    if (!optionValidation.valid) {
      return optionValidation
    }
  }

  return { valid: true }
}

function validateOption(option: any, questionIndex: number, optionIndex: number): ValidationResult {
  const prefix = `Question ${questionIndex}, Option ${optionIndex}`

  if (!option.id || typeof option.id !== 'string') {
    return { valid: false, error: `${prefix}: missing or invalid "id"` }
  }

  if (!option.text || typeof option.text !== 'string') {
    return { valid: false, error: `${prefix}: missing or invalid "text"` }
  }

  if (typeof option.order !== 'number') {
    return { valid: false, error: `${prefix}: missing or invalid "order" (must be a number)` }
  }

  if (!option.items || !Array.isArray(option.items)) {
    return { valid: false, error: `${prefix}: missing or invalid "items" array` }
  }

  for (let k = 0; k < option.items.length; k++) {
    const item = option.items[k]
    const itemValidation = validateItem(item, `${prefix}, Item ${k}`)
    if (!itemValidation.valid) {
      return itemValidation
    }
  }

  return { valid: true }
}

function validateItem(item: any, prefix: string): ValidationResult {
  if (!item.text || typeof item.text !== 'string') {
    return { valid: false, error: `${prefix}: missing or invalid "text"` }
  }

  if (!item.personSelections || !Array.isArray(item.personSelections)) {
    return { valid: false, error: `${prefix}: missing or invalid "personSelections" array` }
  }

  for (let i = 0; i < item.personSelections.length; i++) {
    const selection = item.personSelections[i]
    if (!selection.personId || typeof selection.personId !== 'string') {
      return { valid: false, error: `${prefix}, personSelections[${i}]: missing or invalid "personId"` }
    }
    if (typeof selection.selected !== 'boolean') {
      return { valid: false, error: `${prefix}, personSelections[${i}]: missing or invalid "selected" (must be boolean)` }
    }
  }

  return { valid: true }
}
