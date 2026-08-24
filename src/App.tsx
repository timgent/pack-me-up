import { Analytics } from '@vercel/analytics/react'
import { HashRouter } from 'react-router-dom'
import { Route } from 'react-router-dom'
import { Routes } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import './App.css'
import { Navigation } from './components/Navigation'
import { Footer } from './components/Footer'
import { SessionExpiredBanner } from './components/SessionExpiredBanner'
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
import { QuestionsPage } from './pages/questions-page'
import { PrivacyPolicyPage } from './pages/privacy-policy'
import { YourDataPage } from './pages/your-data'

function DefaultRedirect() {
  const { isLoggedIn, isLoading } = useSolidPod()
  if (isLoading) return null
  return <Navigate to={isLoggedIn ? '/view-lists' : '/home'} replace />
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SolidPodProvider>
          <DatabaseProvider>
            <HashRouter>
              <Analytics />
              {/* Column layout keeps the footer at the bottom of short pages rather
                  than floating it under the content. */}
              <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-50 via-white to-accent-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
                <Navigation />
                <SessionExpiredBanner />
                <div className="flex-1 container mx-auto px-4 py-8">
                  <Routes>
                    <Route path="/" element={<DefaultRedirect />} />
                    <Route path="/home" element={<LandingPage />} />
                    <Route path="/wizard" element={<Wizard />} />
                    <Route path="/manage-questions" element={<QuestionsPage />} />
                    <Route path="/create-packing-list" element={<CreatePackingList />} />
                    <Route path="/view-lists" element={<PackingLists />} />
                    <Route path="/view-lists/:id" element={<ViewPackingList />} />
                    <Route path="/solid-pod-handle-redirect" element={<SolidPodHandleRedirectPage />} />
                    <Route path="/backups" element={<BackupsPage />} />
                    <Route path="/sharing" element={<SharingSettingsPage />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                    <Route path="/your-data" element={<YourDataPage />} />
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
            </HashRouter>
          </DatabaseProvider>
        </SolidPodProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
