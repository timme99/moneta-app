
import { ETF } from './types';

export const APP_NAME = "Moneta";
export const APP_TAGLINE = "Your Digital Wealth Advisor";

export const MOCK_ETFS: ETF[] = [
  {
    id: '1',
    name: 'iShares Core MSCI World UCITS ETF (Acc)',
    isin: 'IE00B4L5Y983',
    ticker: 'EUNL',
    ter: 0.20,
    fundSize: '65 Mrd. €',
    category: 'Aktien Welt',
    oneYearReturn: 18.5,
    threeYearReturn: 32.4,
    riskScore: 4
  },
  {
    id: '2',
    name: 'Vanguard FTSE All-World UCITS ETF (Dist)',
    isin: 'IE00B3RBWM25',
    ticker: 'VWRL',
    ter: 0.22,
    fundSize: '12 Mrd. €',
    category: 'Aktien Welt',
    oneYearReturn: 17.2,
    threeYearReturn: 28.1,
    riskScore: 4
  },
  {
    id: '3',
    name: 'iShares Core S&P 500 UCITS ETF (Acc)',
    isin: 'IE00B5BMR087',
    ticker: 'SXR8',
    ter: 0.07,
    fundSize: '75 Mrd. €',
    category: 'Aktien USA',
    oneYearReturn: 24.1,
    threeYearReturn: 45.2,
    riskScore: 5
  },
  {
    id: '4',
    name: 'Xtrackers MSCI Emerging Markets UCITS ETF',
    isin: 'IE00BTJRMP35',
    ticker: 'XMME',
    ter: 0.18,
    fundSize: '4 Mrd. €',
    category: 'Aktien Schwellenländer',
    oneYearReturn: 5.4,
    threeYearReturn: -8.2,
    riskScore: 6
  },
  {
    id: '5',
    name: 'Vanguard Global Aggregate Bond UCITS ETF',
    isin: 'IE00BG47KH54',
    ticker: 'VAGP',
    ter: 0.10,
    fundSize: '3 Mrd. €',
    category: 'Anleihen Welt',
    oneYearReturn: 2.1,
    threeYearReturn: -4.5,
    riskScore: 2
  }
];

export const APP_THEME = {
  primary: 'blue-600',
  secondary: 'slate-800',
  accent: 'emerald-500'
};
