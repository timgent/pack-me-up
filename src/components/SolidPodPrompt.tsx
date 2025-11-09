import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { SolidProviderSelector } from './SolidProviderSelector'
import { useSolidPod } from './SolidPodContext'

interface SolidPodPromptProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  dismissalKey?: string
}

/**
 * Reusable component for prompting users to set up their Solid Pod
 * Shows benefits and integrates with the provider selector
 */
export function SolidPodPrompt({
  isOpen,
  onClose,
  title,
  message,
  dismissalKey
}: SolidPodPromptProps) {
  const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
  const { login } = useSolidPod()

  const handleGetStarted = () => {
    setIsProviderSelectorOpen(true)
  }

  const handleProviderSelect = (issuer: string) => {
    // Mark as dismissed since they're taking action
    if (dismissalKey) {
      localStorage.setItem(dismissalKey, 'true')
    }
    onClose()
    return login(issuer)
  }

  const handleMaybeLater = () => {
    if (dismissalKey) {
      localStorage.setItem(dismissalKey, 'true')
    }
    onClose()
  }

  const handleCloseProviderSelector = () => {
    setIsProviderSelectorOpen(false)
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleMaybeLater} title={title}>
        <div className="space-y-4">
          <p className="text-gray-700 leading-relaxed">{message}</p>

          <div className="bg-gradient-to-br from-primary-50 to-accent-50 border-2 border-primary-200 rounded-xl p-4 space-y-2">
            <h4 className="font-bold text-primary-900 text-sm">Benefits of using a Solid Pod:</h4>
            <ul className="text-sm text-gray-700 space-y-1.5 ml-4 list-disc">
              <li>
                <strong>Multi-device access</strong> - Access your packing lists from any device
              </li>
              <li>
                <strong>You own your data</strong> - Your lists stay in your personal storage
              </li>
              <li>
                <strong>Never lose your work</strong> - Safe even if you clear browser data
              </li>
              <li>
                <strong>Privacy-focused</strong> - You control who can access your data
              </li>
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={handleGetStarted}
              variant="primary"
              className="flex-1"
            >
              🔒 Set Up Solid Pod
            </Button>
            <Button
              type="button"
              onClick={handleMaybeLater}
              variant="ghost"
              className="flex-1"
            >
              Maybe Later
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            You can always set this up later from the navigation menu
          </p>
        </div>
      </Modal>

      <SolidProviderSelector
        isOpen={isProviderSelectorOpen}
        onClose={handleCloseProviderSelector}
        onSelect={handleProviderSelect}
      />
    </>
  )
}
