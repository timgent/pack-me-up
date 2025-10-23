import { HashRouter } from 'react-router-dom'
import { Route } from 'react-router-dom'
import { Routes } from 'react-router-dom'
import './App.css'
import { Navigation } from './components/Navigation'
import { ToastProvider } from './components/ToastContext'
import { LandingPage } from './pages/landing-page'
import { EditQuestionsForm } from './pages/edit-questions-form'
import { CreatePackingList } from './pages/create-packing-list'
import { PackingLists } from './pages/packing-lists'
import { ViewPackingList } from './pages/view-packing-list'
import { SolidPodProvider } from './components/SolidPodContext'
import { SolidPodHandleRedirectPage } from './pages/solid-pod-handle-redirect-page'
import { SyncProvider } from './components/SyncContext'
import { AppInitializer } from './components/AppInitializer'
import { SyncConflictHandler } from './components/SyncConflictHandler'

function App() {
  return (
    <ToastProvider>
      <SolidPodProvider>
        <HashRouter>
          <SyncProvider>
            <SyncConflictHandler>
              <AppInitializer>
                <Navigation />
                <div className="container mx-auto px-4 py-8">
                  <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/manage-questions" element={<EditQuestionsForm />} />
                    <Route path="/create-packing-list" element={<CreatePackingList />} />
                    <Route path="/view-lists" element={<PackingLists />} />
                    <Route path="/view-lists/:id" element={<ViewPackingList />} />
                    <Route path="/solid-pod-handle-redirect" element={<SolidPodHandleRedirectPage />} />
                  </Routes>
                </div>
              </AppInitializer>
            </SyncConflictHandler>
          </SyncProvider>
        </HashRouter>
      </SolidPodProvider>
    </ToastProvider>
  )
}

export default App
