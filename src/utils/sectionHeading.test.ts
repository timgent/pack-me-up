import { describe, it, expect } from 'vitest'
import { sectionHeading } from './sectionHeading'

describe('sectionHeading', () => {
    it('strips the trailing question mark a question-text section is named with', () => {
        expect(sectionHeading('Will you be staying overnight?')).toBe('Will you be staying overnight')
    })

    it('takes the whitespace around the question mark with it', () => {
        expect(sectionHeading('Will you be staying overnight ?  ')).toBe('Will you be staying overnight')
    })

    it('strips a run of question marks', () => {
        expect(sectionHeading('Camping???')).toBe('Camping')
    })

    it('leaves an ordinary section name exactly as it is', () => {
        expect(sectionHeading('Toiletries')).toBe('Toiletries')
    })

    it('leaves a question mark that is not at the end alone', () => {
        expect(sectionHeading('What now? Kit')).toBe('What now? Kit')
    })

    it('keeps a label that is nothing but question marks, rather than losing the heading', () => {
        expect(sectionHeading('???')).toBe('???')
    })
})
