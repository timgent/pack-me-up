import { Analytics } from '@vercel/analytics/react'
import { HashRouter } from 'react-router-dom'
import { Route } from 'react-router-dom'
import { Routes } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import './App.css'
import { Navigation } from './components/Navigation'
import { Footer } from './components/Footer'
import { SessionExpiredBanner } from './components/SessionExpiredBanner'
import { OfflineBanner } from './components/OfflineBanner'
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner'
import { AndroidTestBanner } from './components/AndroidTestBanner'
import { usePwaUpdate } from './hooks/usePwaUpdate'
import { ToastProvider } from './components/ToastContext'
import { ThemeProvider } from './components/ThemeContext'
import { LandingPage } from './pages/landing-page'
import { CreatePackingList } from './pages/create-packing-list'
import { PackingLists } from './pages/packing-lists'
import { ViewPackingList } from './pages/view-packing-list'
import { SolidPodProvider, useSolidPod } from './components/SolidPodContext'
import { DatabaseProvider } from './components/DatabaseContext'
import { SolidPodHandleRedirectPage } from './pages/solid-pod-handle-redirect-page'
import { Wizard } from './pages/wizard'
import { BackupsPage } from './pages/backups'
import { ForeignPodLayout } from './components/ForeignPodLayout'
import { ForeignPackingListsPage } from './pages/foreign-packing-lists'
import { SharingSettingsPage } from './pages/sharing-settings'
import { AcceptInvitePage } from './pages/accept-invite'
import { useInviteRedemption } from './hooks/useInviteRedemption'
import { InviteRedemptionContext } from './components/InviteRedemptionContext'
import { QuestionsPage } from './pages/questions-page'
import { PrivacyPolicyPage } from './pages/privacy-policy'
import { YourDataPage } from './pages/your-data'
import { SettingsPage } from './pages/settings'
import { OpenResourcePage } from './pages/open-resource'
import { AndroidTestPage } from './pages/android-test'

function DefaultRedirect() {
  const { isLoggedIn, isReconnecting, isLoading } = useSolidPod()
  if (isLoading) return null
  // A signed-in user whose pod is out of reach still opens on their lists —
  // they are on the device. Sending them to the marketing landing page instead
  // is half of what made being offline look like being signed out (#342).
  return <Navigate to={isLoggedIn || isReconnecting ? '/view-lists' : '/home'} replace />
}

/**
 * Grants access to anyone who accepted an invite while the app was closed.
 *
 * Mounted app-wide rather than on the Sharing page because the person who sent
 * the invite has no reason to visit that page again — they are waiting to hear
 * that it worked, not to go looking. Renders nothing; it only acts.
 */
function InviteRedemption({ children }: { children: React.ReactNode }) {
  const { redeemed } = useInviteRedemption()
  // Pages that show who has access re-read when this moves.
  return <InviteRedemptionContext.Provider value={redeemed.length}>{children}</InviteRedemptionContext.Provider>
}

function App() {
  const { needsRefresh, reload } = usePwaUpdate()
  return (
    <ThemeProvider>
      <ToastProvider>
        <SolidPodProvider>
          <DatabaseProvider>
            <HashRouter>
              <InviteRedemption>
              <Analytics />
              {/* Column layout keeps the footer at the bottom of short pages rather
                  than floating it under the content. */}
              <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-50 via-white to-accent-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
                <Navigation />
                <SessionExpiredBanner />
                <OfflineBanner />
                {needsRefresh && <UpdateAvailableBanner onReload={reload} />}
                <AndroidTestBanner />
                <div className="flex-1 container mx-auto px-4 py-8">
                  <Routes>
                    <Route path="/" element={<DefaultRedirect />} />
                    <Route path="/home" element={<LandingPage />} />
                    {/* Where another app's `#open={open}` invocation lands — see
                        src/capability/openInvocation.ts. */}
                    <Route path="/open" element={<OpenResourcePage />} />
                    <Route path="/wizard" element={<Wizard />} />
                    <Route path="/manage-questions" element={<QuestionsPage />} />
                    <Route path="/create-packing-list" element={<CreatePackingList />} />
                    <Route path="/view-lists" element={<PackingLists />} />
                    <Route path="/view-lists/:id" element={<ViewPackingList />} />
                    <Route path="/solid-pod-handle-redirect" element={<SolidPodHandleRedirectPage />} />
                    <Route path="/backups" element={<BackupsPage />} />
                    <Route path="/sharing" element={<SharingSettingsPage />} />
                    {/* Where an invite link lands. See src/services/invites.ts. */}
                    <Route path="/invite/:token" element={<AcceptInvitePage />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                    <Route path="/your-data" element={<YourDataPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    {/* Stable home for the Play closed-test call — see
                        src/config/androidTest.ts for why nothing links straight to Play. */}
                    <Route path="/android-test" element={<AndroidTestPage />} />
                    <Route path="/pod/:encodedPodUrl" element={<ForeignPodLayout />}>
                      <Route index element={<Navigate to="view-lists" replace />} />
                      <Route path="view-lists" element={<ForeignPackingListsPage />} />
                      <Route path="view-lists/:id" element={<ViewPackingList />} />
                      <Route path="manage-questions" element={<QuestionsPage />} />
                      <Route path="create-packing-list" element={<CreatePackingList />} />
                    </Route>
                  </Routes>
                </div>
                <Footer />
              </div>
              </InviteRedemption>
            </HashRouter>
          </DatabaseProvider>
        </SolidPodProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
