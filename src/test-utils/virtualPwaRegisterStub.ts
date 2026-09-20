// vitest.config.ts aliases the real `virtual:pwa-register` specifier to this
// file: that module id only exists because the VitePWA Vite plugin
// (vite.config.ts) resolves it, and vitest.config.ts doesn't load that
// plugin, so importing it unaliased fails before any test even runs.
// Individual tests still override this with `vi.mock('virtual:pwa-register',
// ...)` when they need to assert on the call.
export function registerSW() {
    return async () => {}
}
