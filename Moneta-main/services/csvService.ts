import { PortfolioHolding } from '../types';

export interface CSVParseResult {
  holdings: PortfolioHolding[];
  errors: string[];
  rowCount: number;
}

// Known column name mappings (German + English broker exports)
const NAME_COLUMNS = ['name', 'bezeichnung', 'wertpapier', 'instrument', 'asset', 'titel', 'security'];
const ISIN_COLUMNS = ['isin', 'isin-code'];
const TICKER_COLUMNS = ['ticker', 'symbol', 'wkn', 'kürzel'];
const QUANTITY_COLUMNS = ['anzahl', 'stück', 'quantity', 'qty', 'shares', 'menge', 'bestand'];
const PRICE_COLUMNS = ['kaufpreis', 'einstandskurs', 'buy_price', 'cost', 'kaufkurs', 'avg_price', 'durchschnittskurs'];
const CATEGORY_COLUMNS = ['kategorie', 'category', 'typ', 'type', 'asset_class', 'anlageklasse'];

function detectDelimiter(line: string): string {
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;
  if (tabs >= semicolons && tabs >= commas) return '\t';
  if (semicolons >= commas) return ';';
  return ',';
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/['"]/g, '').replace(/\s+/g, '_');
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => normalizeHeader(h) === candidate || normalizeHeader(h).includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(val: string): number {
  if (!val) return 0;
  // Handle German number format (1.234,56) and standard (1,234.56)
  const cleaned = val.replace(/['"€$%\s]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Determine which is decimal separator
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // German: 1.234,56
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    // English: 1,234.56
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.'));
  }
  return parseFloat(cleaned) || 0;
}

export function parseCSV(content: string): CSVParseResult {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    return { holdings: [], errors: ['Die CSV-Datei muss mindestens eine Kopfzeile und eine Datenzeile enthalten.'], rowCount: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(h => h.trim());

  const nameIdx = findColumn(headers, NAME_COLUMNS);
  const isinIdx = findColumn(headers, ISIN_COLUMNS);
  const tickerIdx = findColumn(headers, TICKER_COLUMNS);
  const qtyIdx = findColumn(headers, QUANTITY_COLUMNS);
  const priceIdx = findColumn(headers, PRICE_COLUMNS);
  const categoryIdx = findColumn(headers, CATEGORY_COLUMNS);

  if (nameIdx === -1 && isinIdx === -1 && tickerIdx === -1) {
    errors.push(`Keine erkennbare Spalte für Name, ISIN oder Ticker gefunden. Erkannte Spalten: ${headers.join(', ')}`);
    return { holdings: [], errors, rowCount: 0 };
  }

  const holdings: PortfolioHolding[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));

    const name = nameIdx !== -1 ? cols[nameIdx] : (tickerIdx !== -1 ? cols[tickerIdx] : cols[isinIdx] || '');
    if (!name) {
      errors.push(`Zeile ${i + 1}: Kein Name/Ticker gefunden, übersprungen.`);
      continue;
    }

    const holding: PortfolioHolding = {
      name,
      isin: isinIdx !== -1 ? cols[isinIdx] : undefined,
      ticker: tickerIdx !== -1 ? cols[tickerIdx] : undefined,
      quantity: qtyIdx !== -1 ? parseNumber(cols[qtyIdx]) : 1,
      buyPrice: priceIdx !== -1 ? parseNumber(cols[priceIdx]) : undefined,
      category: categoryIdx !== -1 ? cols[categoryIdx] : undefined,
    };

    holdings.push(holding);
  }

  if (holdings.length === 0) {
    errors.push('Keine gültigen Positionen in der CSV-Datei gefunden.');
  }

  return { holdings, errors, rowCount: lines.length - 1 };
}

export function holdingsToPortfolioText(holdings: PortfolioHolding[]): string {
  return holdings.map(h => {
    const parts = [];
    if (h.quantity > 0) parts.push(`${h.quantity}x`);
    parts.push(h.name);
    if (h.isin) parts.push(`(ISIN: ${h.isin})`);
    if (h.ticker) parts.push(`[${h.ticker}]`);
    if (h.buyPrice) parts.push(`@ ${h.buyPrice}€`);
    return parts.join(' ');
  }).join('\n');
}

export function generateCSVTemplate(): string {
  return `Name;ISIN;Ticker;Anzahl;Kaufpreis;Kategorie
iShares Core MSCI World;IE00B4L5Y983;EUNL;50;68.50;ETF
Apple Inc.;US0378331005;AAPL;10;145.00;Aktie
Allianz SE;DE0008404005;ALV;15;220.30;Aktie`;
}
