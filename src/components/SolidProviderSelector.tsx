import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface SolidProvider {
  name: string;
  issuer: string;
}

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
    <Modal isOpen={isOpen} onClose={handleClose} title="Select Solid Pod Provider">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Choose your Solid Pod provider from the list below or enter a custom one.
        </p>

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
