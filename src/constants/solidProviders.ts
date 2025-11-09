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
