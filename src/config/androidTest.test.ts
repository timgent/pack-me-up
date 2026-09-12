import { describe, it, expect } from 'vitest'
import { PLAY_PACKAGE_ID, PLAY_OPT_IN_URL, TESTER_GROUP_URL, isRecruitingTesters } from './androidTest'

describe('Android closed-test configuration', () => {
    it('uses the package id the Android build actually ships', () => {
        // capacitor.config.ts `appId` and android/app/build.gradle `applicationId`.
        // A mismatch here points testers at a Play page for an app that doesn't exist.
        expect(PLAY_PACKAGE_ID).toBe('com.timgent.packmeup')
    })

    it('builds the Play opt-in URL from that package id', () => {
        expect(PLAY_OPT_IN_URL).toBe('https://play.google.com/apps/testing/com.timgent.packmeup')
    })

    it('is not recruiting while no tester group URL is set', () => {
        // The banner and the page CTA are both gated on this, so an unconfigured
        // deploy shows nothing rather than sending people to a dead end.
        if (TESTER_GROUP_URL.trim() === '') {
            expect(isRecruitingTesters()).toBe(false)
        } else {
            expect(isRecruitingTesters()).toBe(true)
        }
    })

    it('treats a whitespace-only group URL as not recruiting', () => {
        expect(isRecruitingTesters('   ')).toBe(false)
    })

    it('recruits once a real group URL is configured', () => {
        expect(isRecruitingTesters('https://groups.google.com/g/packmeup-testers')).toBe(true)
    })
})
