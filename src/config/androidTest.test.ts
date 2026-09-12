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

    it('recruits exactly when a tester group is configured', () => {
        // The banner, the footer link and the page CTA are all gated on this, so
        // an unconfigured deploy shows nothing rather than a dead end.
        expect(isRecruitingTesters()).toBe(TESTER_GROUP_URL.trim() !== '')
    })

    it('points at a joinable Google Group while recruiting', () => {
        // A closed test can admit people from an uploaded email list or from a
        // Google Group, and only the group can be joined by someone arriving from
        // the website. So the configured URL has to be a group, not a Play link
        // or a relative path that would render as a broken anchor.
        //
        // Returns early rather than failing once recruitment stops: clearing the
        // URL is how the call is switched off, and that must not break the build.
        if (!isRecruitingTesters()) return

        expect(TESTER_GROUP_URL).toMatch(/^https:\/\/groups\.google\.com\/g\/[a-z0-9-]+$/)
    })

    it('treats a whitespace-only group URL as not recruiting', () => {
        expect(isRecruitingTesters('   ')).toBe(false)
    })

    it('recruits once a real group URL is configured', () => {
        expect(isRecruitingTesters('https://groups.google.com/g/packmeup-testers')).toBe(true)
    })
})
