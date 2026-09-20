import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

vi.mock('@vercel/analytics/react', () => ({
  Analytics: vi.fn(() => null),
}))

vi.mock('./components/SolidPodContext', () => ({
  SolidPodProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSolidPod: vi.fn(() => ({ isLoggedIn: false, isLoading: false })),
}))

vi.mock('./components/DatabaseContext', () => ({
  DatabaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./components/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  // `InviteRedemption` toasts when somebody accepts an invite.
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('./components/Navigation', () => ({
  Navigation: () => null,
}))

vi.mock('./components/SessionExpiredBanner', () => ({
  SessionExpiredBanner: () => null,
}))

vi.mock('./components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}))

// Registers `virtual:pwa-register`, a module only the real Vite PWA plugin
// resolves — not loaded under vitest.config.ts, so it's mocked here the same
// way pwaUpdate.test.ts and usePwaUpdate.test.ts mock it directly.
vi.mock('./services/pwaUpdate', () => ({
  registerPwaServiceWorker: vi.fn(() => undefined),
}))

vi.mock('./pages/landing-page', () => ({ LandingPage: () => null }))
vi.mock('./pages/questions-page', () => ({ QuestionsPage: () => null }))
vi.mock('./pages/create-packing-list', () => ({ CreatePackingList: () => null }))
vi.mock('./pages/packing-lists', () => ({ PackingLists: () => null }))
vi.mock('./pages/view-packing-list', () => ({ ViewPackingList: () => null }))
vi.mock('./pages/solid-pod-handle-redirect-page', () => ({ SolidPodHandleRedirectPage: () => null }))
vi.mock('./pages/wizard', () => ({ Wizard: () => null }))
vi.mock('./pages/backups', () => ({ BackupsPage: () => null }))

import { Analytics } from '@vercel/analytics/react'
import App from './App'

const mockAnalytics = vi.mocked(Analytics)

describe('App', () => {
  beforeEach(() => {
    mockAnalytics.mockClear()
  })

  it('renders the Analytics component for page view tracking', () => {
    render(<App />)
    expect(mockAnalytics).toHaveBeenCalled()
  })
})
