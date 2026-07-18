import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { ErrorFallback } from './components/ErrorFallback.tsx'
import { initSentry } from './sentry.ts'

initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={ErrorFallback} showDialog>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
