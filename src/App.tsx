import { HashRouter } from 'react-router-dom'
import { Route } from 'react-router-dom'
import { Routes } from 'react-router-dom'
import './App.css'
import { Navigation } from './components/Navigation'
import { SessionExpiredBanner } from './components/SessionExpiredBanner'
import { ToastProvider } from './components/ToastContext'
import { LandingPage } from './pages/landing-page'
import { EditQuestionsForm } from './pages/edit-questions-form'
import { CreatePackingList } from './pages/create-packing-list'
import { PackingLists } from './pages/packing-lists'
import { ViewPackingList } from './pages/view-packing-list'
import { SolidPodProvider } from './components/SolidPodContext'
import { DatabaseProvider } from './components/DatabaseContext'
import { SolidPodHandleRedirectPage } from './pages/solid-pod-handle-redirect-page'
import { Wizard } from './pages/wizard'
import { BackupsPage } from './pages/backups'

function App() {
  return (
    <ToastProvider>
      <SolidPodProvider>
        <DatabaseProvider>
        <HashRouter>
          <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50">
            <Navigation />
            <SessionExpiredBanner />
            <div className="container mx-auto px-4 py-8">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/wizard" element={<Wizard />} />
                <Route path="/manage-questions" element={<EditQuestionsForm />} />
                <Route path="/create-packing-list" element={<CreatePackingList />} />
                <Route path="/view-lists" element={<PackingLists />} />
                <Route path="/view-lists/:id" element={<ViewPackingList />} />
                <Route path="/solid-pod-handle-redirect" element={<SolidPodHandleRedirectPage />} />
                <Route path="/backups" element={<BackupsPage />} />
              </Routes>
            </div>
          </div>
        </HashRouter>
        </DatabaseProvider>
      </SolidPodProvider>
    </ToastProvider>
  )
}

export default App
