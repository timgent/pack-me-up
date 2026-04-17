import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface SolidProvider {
  name: string;
  issuer: string;
  description?: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const COMMON_PROVIDERS: SolidProvider[] = [
  {
    name: 'Inrupt PodSpaces',
    issuer: 'https://login.inrupt.com',
    description: 'Free · run by Inrupt (founded by Tim Berners-Lee, inventor of the Web)'
  },
  {
    name: 'solidcommunity.net',
    issuer: 'https://solidcommunity.net',
    description: 'Free · community-run, backed by the Open Data Institute'
  },
  {
    name: 'solidweb.org',
    issuer: 'https://solidweb.org',
    description: 'Free · EU-hosted'
  },
  {
    name: 'Private Data Pod',
    issuer: 'https://privatedatapod.com',
    description: 'Free · 1 GB storage · beginner-friendly'
  }
];

export const LAST_PROVIDER_KEY = 'solid-last-provider-issuer';

const DEFAULT_PROVIDER = COMMON_PROVIDERS.find(p => p.issuer === 'https://login.inrupt.com')!;

function getLastUsedProvider(): SolidProvider | null {
  const issuer = localStorage.getItem(LAST_PROVIDER_KEY);
  if (!issuer) return null;
  return COMMON_PROVIDERS.find(p => p.issuer === issuer) ?? null;
}

interface SolidProviderSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (issuer: string) => void;
}

export function SolidProviderSelector({ isOpen, onClose, onSelect }: SolidProviderSelectorProps) {
  const primaryProvider = getLastUsedProvider() ?? DEFAULT_PROVIDER;
  const otherProviders = COMMON_PROVIDERS.filter(p => p.issuer !== primaryProvider.issuer);

  const [showOthers, setShowOthers] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customIssuer, setCustomIssuer] = useState('');

  const handleProviderSelect = (issuer: string) => {
    localStorage.setItem(LAST_PROVIDER_KEY, issuer);
    onSelect(issuer);
    onClose();
    setShowOthers(false);
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
    setShowOthers(false);
    setShowCustomInput(false);
    setCustomIssuer('');
  };

  const isLastUsed = localStorage.getItem(LAST_PROVIDER_KEY) === primaryProvider.issuer;

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
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600 mb-3">
            {isLastUsed ? 'Continue with your last-used provider:' : 'Get started with a free provider:'}
          </p>

          {/* Primary provider */}
          <button
            onClick={() => handleProviderSelect(primaryProvider.issuer)}
            className="w-full text-left px-4 py-3 border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 hover:border-blue-500 rounded-md transition-colors"
          >
            <div className="font-medium text-gray-900">{primaryProvider.name}</div>
            {primaryProvider.description && (
              <div className="text-xs text-green-700 font-medium">{primaryProvider.description}</div>
            )}
            <div className="text-xs text-gray-400">{primaryProvider.issuer}</div>
          </button>
        </div>

        {/* Other providers toggle */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowOthers(v => !v)}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors text-center"
          >
            {showOthers ? 'Hide other providers ▲' : 'Other providers ▼'}
          </button>

          {showOthers && (
            <div className="space-y-2">
              {otherProviders.map((provider) => (
                <button
                  key={provider.issuer}
                  onClick={() => handleProviderSelect(provider.issuer)}
                  className="w-full text-left px-4 py-3 border border-gray-300 hover:bg-gray-50 hover:border-gray-400 rounded-md transition-colors"
                >
                  <div className="font-medium text-gray-900">{provider.name}</div>
                  {provider.description && (
                    <div className="text-xs text-green-700 font-medium">{provider.description}</div>
                  )}
                  <div className="text-xs text-gray-400">{provider.issuer}</div>
                </button>
              ))}

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
          )}
        </div>

        <p className="text-xs text-gray-500 text-center">
          No Pod? No problem — your data saves locally in your browser automatically.
        </p>
      </div>
    </Modal>
  );
}
