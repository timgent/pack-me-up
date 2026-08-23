import { useMemo, useState, type KeyboardEvent } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';

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
    name: 'Private Data Pod',
    issuer: 'https://privatedatapod.com',
    description: 'Free · 1 GB storage · beginner-friendly'
  }
];

export const LAST_PROVIDER_KEY = 'solid-last-provider-issuer';

/**
 * Turn what the user typed into an OIDC issuer URL, or null if it isn't one.
 *
 * The search box does double duty — a query like "community" must stay a search,
 * while "my-pod.example.org" is a pod the user wants to connect to. A scheme-less
 * host defaults to `https://`; an explicit `http://` (a local dev server, usually)
 * is preserved.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function normalizeIssuerUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const hasScheme = /^https?:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  // Without a scheme to go on, only host-shaped text counts as a URL — otherwise
  // every search term would parse as https://<term>.
  const hostLooksReal = url.hostname === 'localhost' || /\.[a-z]{2,}$/i.test(url.hostname);
  if (!hasScheme && !hostLooksReal) return null;

  const normalized = url.toString();
  return url.pathname === '/' && !url.search && !url.hash
    ? normalized.replace(/\/$/, '')
    : normalized;
}

function knownProvider(issuer: string): SolidProvider | undefined {
  return COMMON_PROVIDERS.find(p => p.issuer === issuer);
}

/** Known providers keep their name and blurb; a self-hosted pod is known by its URL. */
function providerForIssuer(issuer: string): SolidProvider {
  return knownProvider(issuer) ?? { name: issuer, issuer };
}

function getLastUsedIssuer(): string | null {
  return localStorage.getItem(LAST_PROVIDER_KEY);
}

interface SolidProviderSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (issuer: string) => void | Promise<void>;
}

export function SolidProviderSelector({ isOpen, onClose, onSelect }: SolidProviderSelectorProps) {
  const [query, setQuery] = useState('');
  const [connectingTo, setConnectingTo] = useState<SolidProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastUsedIssuer = getLastUsedIssuer();
  const typedUrl = normalizeIssuerUrl(query);

  const providers = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      // Nothing typed: the pod you used last time is the one you most likely want.
      const ordered = [...COMMON_PROVIDERS];
      if (lastUsedIssuer) {
        const last = providerForIssuer(lastUsedIssuer);
        return [last, ...ordered.filter(p => p.issuer !== last.issuer)];
      }
      return ordered;
    }

    return COMMON_PROVIDERS.filter(
      p => p.name.toLowerCase().includes(term) || p.issuer.toLowerCase().includes(term)
    );
  }, [query, lastUsedIssuer]);

  const connect = async (provider: SolidProvider) => {
    setConnectingTo(provider);
    setError(null);
    try {
      await onSelect(provider.issuer);
      // Only a connection that got as far as the provider's redirect is worth
      // remembering — a typo'd pod URL must not become next time's default.
      localStorage.setItem(LAST_PROVIDER_KEY, provider.issuer);
    } catch {
      setConnectingTo(null);
      setError(`Couldn't connect to ${provider.issuer}. Check the address and try again.`);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // What the user typed wins: a pasted pod URL that happens to contain
    // "inrupt" is their pod, not Inrupt PodSpaces.
    if (typedUrl) {
      void connect(providerForIssuer(typedUrl));
    } else if (providers.length > 0) {
      void connect(providers[0]);
    }
  };

  const handleClose = () => {
    onClose();
    setQuery('');
    setConnectingTo(null);
    setError(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Sync &amp; Share your lists">
      <div className="space-y-4">
        {/* Payoff first, mechanism second — signing in is what unlocks these */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 space-y-2">
          <p className="text-sm text-gray-700">
            Signing in lets you <strong>sync across your devices</strong> and <strong>share lists</strong> — a single list with a friend, or your whole question set with the person you travel with.
          </p>
          <details className="group">
            <summary className="text-sm font-semibold text-gray-900 cursor-pointer list-none marker:content-none">
              <span className="group-open:hidden">▸ </span>
              <span className="hidden group-open:inline">▾ </span>
              What is a Solid Pod?
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-sm text-gray-700">
                Signing in uses a Solid Pod: personal data storage that <strong>you control</strong>. Instead of storing your packing lists on our servers, they're stored in your own secure space.
              </p>
              <ul className="text-sm text-gray-700 space-y-1 ml-4 list-disc">
                <li><strong>You own your data</strong> - it stays in your Pod</li>
                <li><strong>Privacy-focused</strong> - you choose who can access it</li>
                <li><strong>Portable</strong> - use your Pod with any Solid app</li>
              </ul>
            </div>
          </details>
        </div>

        {connectingTo ? (
          <div className="border-t border-gray-200 pt-6 pb-4 flex flex-col items-center gap-3" aria-live="polite">
            <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm text-gray-700">Connecting to {connectingTo.name}…</p>
            <p className="text-xs text-gray-500 text-center">
              You'll be taken to your provider to sign in.
            </p>
          </div>
        ) : (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <Input
              label="Search providers or paste your Pod URL"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Inrupt, or my-pod.example.org"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            {error && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-2">
              {typedUrl && (
                <button
                  type="button"
                  data-provider-option
                  aria-label={`Connect to ${typedUrl}`}
                  onClick={() => void connect(providerForIssuer(typedUrl))}
                  className="w-full text-left px-4 py-3 border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 hover:border-blue-500 rounded-md transition-colors"
                >
                  <div className="font-medium text-gray-900 break-all">{typedUrl}</div>
                  <div className="text-xs text-blue-700 font-medium">Use this Pod URL</div>
                </button>
              )}

              {providers.map((provider) => {
                const isLastUsed = provider.issuer === lastUsedIssuer;
                return (
                  <button
                    key={provider.issuer}
                    type="button"
                    data-provider-option
                    aria-label={provider.name}
                    onClick={() => void connect(provider)}
                    className="w-full text-left px-4 py-3 border border-gray-300 hover:bg-gray-50 hover:border-gray-400 rounded-md transition-colors"
                  >
                    <div className="font-medium text-gray-900 break-all">{provider.name}</div>
                    {provider.description && (
                      <div className="text-xs text-green-700 font-medium">{provider.description}</div>
                    )}
                    <div className="flex items-baseline justify-between gap-2">
                      {provider.name === provider.issuer
                        ? <span />
                        : <span className="text-xs text-gray-400 break-all">{provider.issuer}</span>}
                      {isLastUsed && (
                        <span className="text-xs font-medium text-blue-700 whitespace-nowrap">Last used</span>
                      )}
                    </div>
                  </button>
                );
              })}

              {providers.length === 0 && !typedUrl && (
                <p className="text-sm text-gray-500 text-center py-2">
                  No matching providers. Paste your Pod's URL to connect to it directly.
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 text-center">
          No Pod? No problem — your data saves locally in your browser automatically.
        </p>
      </div>
    </Modal>
  );
}
