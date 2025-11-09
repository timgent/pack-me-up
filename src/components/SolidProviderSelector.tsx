import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface SolidProvider {
  name: string;
  issuer: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const COMMON_PROVIDERS: SolidProvider[] = [
  {
    name: 'Inrupt',
    issuer: 'https://login.inrupt.com'
  },
  {
    name: 'solidcommunity.net',
    issuer: 'https://solidcommunity.net'
  },
  {
    name: 'solidweb.org',
    issuer: 'https://solidweb.org'
  }
];

interface SolidProviderSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (issuer: string) => void;
}

export function SolidProviderSelector({ isOpen, onClose, onSelect }: SolidProviderSelectorProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customIssuer, setCustomIssuer] = useState('');

  const handleProviderSelect = (issuer: string) => {
    onSelect(issuer);
    onClose();
    setShowCustomInput(false);
    setCustomIssuer('');
  };

  const handleCustomSubmit = () => {
    if (customIssuer.trim()) {
      handleProviderSelect(customIssuer.trim());
    }
  };

  const handleClose = () => {
    onClose();
    setShowCustomInput(false);
    setCustomIssuer('');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Login with Your Solid Pod">
      <div className="space-y-4">
        {/* Explanation section */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 space-y-2">
          <h3 className="font-semibold text-gray-900 text-sm">What is a Solid Pod?</h3>
          <p className="text-sm text-gray-700">
            A Solid Pod is your personal data storage that <strong>you control</strong>. Instead of storing your packing lists on our servers, they're stored in your own secure space.
          </p>
          <ul className="text-sm text-gray-700 space-y-1 ml-4 list-disc">
            <li><strong>You own your data</strong> - it stays in your Pod</li>
            <li><strong>Privacy-focused</strong> - you choose who can access it</li>
            <li><strong>Portable</strong> - use your Pod with any Solid app</li>
          </ul>
          <p className="text-xs text-gray-600 mt-2">
            <a
              href="https://solidproject.org/users/get-a-pod"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Learn more about Solid
            </a>
          </p>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600 mb-3">
            Choose your Solid Pod provider to get started:
          </p>
        </div>

        <div className="space-y-2">
          {COMMON_PROVIDERS.map((provider) => (
            <button
              key={provider.issuer}
              onClick={() => handleProviderSelect(provider.issuer)}
              className="w-full text-left px-4 py-3 border border-gray-300 hover:bg-gray-50 hover:border-gray-400 rounded-md transition-colors"
            >
              <div className="font-medium text-gray-900">{provider.name}</div>
              <div className="text-sm text-gray-500">{provider.issuer}</div>
            </button>
          ))}
        </div>

        {!showCustomInput ? (
          <Button
            type="button"
            onClick={() => setShowCustomInput(true)}
            variant="secondary"
            className="w-full"
          >
            Use Custom Provider
          </Button>
        ) : (
          <div className="space-y-3 pt-2 border-t border-gray-200">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Custom Provider URL</span>
              <input
                type="url"
                value={customIssuer}
                onChange={(e) => setCustomIssuer(e.target.value)}
                placeholder="https://your-provider.com"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleCustomSubmit}
                disabled={!customIssuer.trim()}
                className="flex-1"
              >
                Connect
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomIssuer('');
                }}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
