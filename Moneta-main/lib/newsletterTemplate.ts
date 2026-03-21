/**
 * lib/newsletterTemplate.ts
 *
 * Generiert Newsletter-Inhalte (Markdown + Plain-Text-Variante) aus
 * den Portfolio-Analyse-Daten von Moneta.
 *
 * Verwendung:
 *   import { buildNewsletterMarkdown, buildNewsletterNewsSection } from '../lib/newsletterTemplate';
 *
 * Hinweis: Alle generierten Texte sind informativ. Kein Anlageberatungscharakter.
 */

export interface NewsletterNewsItem {
  title: string;
  source: string;
  snippet: string;
  url?: string;
  ticker?: string;
  importance: 'hoch' | 'mittel' | 'niedrig';
  impact_emoji: string;
}

export interface NewsletterHolding {
  name: string;
  ticker: string;
  value?: number;       // Gesamtwert in € (Stückzahl × aktueller Kurs)
  invested?: number;    // Einstand in € (Stückzahl × Kaufpreis)
  perfPct?: number;     // Performance in % seit Kauf
  sentiment?: 'Positiv' | 'Neutral' | 'Negativ';
}

export interface NewsletterPayload {
  userName?: string;
  date?: string;                    // ISO-Datum, default: today
  totalValue?: number;              // Aktueller Depotwert in €
  totalInvested?: number;           // Einstand gesamt in €
  weeklyChangePct?: number;         // Wochenperformance in %
  holdings?: NewsletterHolding[];   // Top-Positionen (max 5 empfohlen)
  news?: NewsletterNewsItem[];       // News-Items aus analysisReport.news
  insights?: string[];              // Max 3 sachliche Hinweise (kein Rat!)
  upcomingEarnings?: { ticker: string; company: string; date: string }[];
  footerDisclaimer?: string;        // Überschreibt Standard-Disclaimer
}

const fmt = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCompact = (n: number) =>
  n.toLocaleString('de-DE', { maximumFractionDigits: 0 });

const importanceIcon = (imp: string) =>
  imp === 'hoch' ? '🔴' : imp === 'mittel' ? '🟡' : '🟢';

const sentimentIcon = (s?: string) =>
  s === 'Positiv' ? '▲' : s === 'Negativ' ? '▼' : '–';

const DEFAULT_DISCLAIMER =
  '⚠️ **Kein Anlageberatungsangebot.** Alle Inhalte sind rein informativ und ersetzen keine ' +
  'Beratung durch einen zugelassenen Finanzberater gemäß KWG/WpIG. Vergangene Wertentwicklungen ' +
  'sind kein verlässlicher Indikator für zukünftige Ergebnisse.';

// ── Öffentliche API ───────────────────────────────────────────────────────────

/**
 * Erstellt den vollständigen Newsletter als Markdown-String.
 */
export function buildNewsletterMarkdown(payload: NewsletterPayload): string {
  const {
    userName,
    date = new Date().toISOString().slice(0, 10),
    totalValue,
    totalInvested,
    weeklyChangePct,
    holdings = [],
    news = [],
    insights = [],
    upcomingEarnings = [],
    footerDisclaimer = DEFAULT_DISCLAIMER,
  } = payload;

  const dateLabel = new Date(date).toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const perfSign = weeklyChangePct != null ? (weeklyChangePct >= 0 ? '+' : '') : '';
  const greeting = userName ? `Hallo ${userName},` : 'Hallo,';

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# 📊 Moneta Depot-Briefing`);
  lines.push(`*${dateLabel}*`);
  lines.push('');
  lines.push(greeting);
  lines.push('hier ist dein aktuelles Depot-Briefing – vollständig automatisiert, rein informativ.');
  lines.push('');

  // ── Compliance-Vignette ───────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(footerDisclaimer);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Depot-Kennzahlen ──────────────────────────────────────────────────────
  if (totalValue != null || totalInvested != null) {
    lines.push('## 💼 Depot-Überblick');
    lines.push('');
    if (totalValue != null) {
      lines.push(`| Kennzahl | Wert |`);
      lines.push(`|---|---|`);
      lines.push(`| Aktueller Depotwert | **${fmt(totalValue)} €** |`);
      if (totalInvested != null) {
        const absChange = totalValue - totalInvested;
        const pctChange = totalInvested > 0 ? ((absChange / totalInvested) * 100) : 0;
        lines.push(`| Einstand | ${fmt(totalInvested)} € |`);
        lines.push(`| Entwicklung (gesamt) | ${absChange >= 0 ? '+' : ''}${fmt(absChange)} € (${absChange >= 0 ? '+' : ''}${pctChange.toFixed(2)} %) |`);
      }
      if (weeklyChangePct != null) {
        lines.push(`| Entwicklung (7 Tage) | ${perfSign}${weeklyChangePct.toFixed(2)} % |`);
      }
      lines.push('');
    }
  }

  // ── Top-Positionen ────────────────────────────────────────────────────────
  if (holdings.length > 0) {
    lines.push('## 📈 Deine Positionen');
    lines.push('');
    lines.push('| Position | Ticker | Einstand | Performance | Trend |');
    lines.push('|---|---|---|---|---|');
    holdings.slice(0, 5).forEach(h => {
      const inv = h.invested != null ? `${fmtCompact(h.invested)} €` : '—';
      const perf = h.perfPct != null
        ? `${h.perfPct >= 0 ? '+' : ''}${h.perfPct.toFixed(1)} %`
        : '—';
      const trend = sentimentIcon(h.sentiment);
      lines.push(`| ${h.name} | \`${h.ticker}\` | ${inv} | ${perf} | ${trend} |`);
    });
    lines.push('');
  }

  // ── Portfolio-News ────────────────────────────────────────────────────────
  if (news.length > 0) {
    lines.push(buildNewsletterNewsSection(news));
  }

  // ── KI-Hinweise (max 3, sachlich) ─────────────────────────────────────────
  const cappedInsights = insights.slice(0, 3);
  if (cappedInsights.length > 0) {
    lines.push('## 💡 Informative Hinweise');
    lines.push('');
    lines.push('> Diese Hinweise basieren auf der Analyse deiner Depot-Struktur. Sie stellen keine Empfehlungen dar.');
    lines.push('');
    cappedInsights.forEach(insight => {
      lines.push(`- ${insight}`);
    });
    lines.push('');
  }

  // ── Upcoming Earnings ─────────────────────────────────────────────────────
  if (upcomingEarnings.length > 0) {
    lines.push('## 📅 Bevorstehende Quartalszahlen');
    lines.push('');
    lines.push('| Unternehmen | Ticker | Datum |');
    lines.push('|---|---|---|');
    upcomingEarnings.forEach(e => {
      const d = new Date(e.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
      lines.push(`| ${e.company} | \`${e.ticker}\` | ${d} |`);
    });
    lines.push('');
    lines.push('*Termine sind Schätzungen auf Basis historischer Daten. Offizielle Termine bitte auf der IR-Seite prüfen.*');
    lines.push('');
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('*Automatisch generiert von [Moneta](https://www.moneta-invest.de) · Investieren mit Durchblick*');
  lines.push('');
  lines.push('Um den Newsletter abzubestellen, gehe zu **Einstellungen → Newsletter** in der App.');

  return lines.join('\n');
}

/**
 * Gibt nur den News-Abschnitt als Markdown zurück.
 * Kann direkt in buildDigestHtml() highlights-Parameter eingesetzt werden.
 */
export function buildNewsletterNewsSection(news: NewsletterNewsItem[]): string {
  if (!news.length) return '';

  const lines: string[] = [];
  lines.push('## 📰 Markt-News für dein Depot');
  lines.push('');

  // Nach Wichtigkeit sortieren
  const sorted = [...news].sort((a, b) => {
    const order = { hoch: 0, mittel: 1, niedrig: 2 };
    return order[a.importance] - order[b.importance];
  });

  sorted.forEach(item => {
    const icon = importanceIcon(item.importance);
    const ticker = item.ticker ? ` · \`${item.ticker}\`` : '';
    lines.push(`### ${icon} ${item.impact_emoji} ${item.title}`);
    lines.push(`*${item.source}${ticker}*`);
    lines.push('');
    lines.push(item.snippet);
    if (item.url) lines.push(`[→ Mehr lesen](${item.url})`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Konvertiert einen buildNewsletterMarkdown()-Output in ein simples
 * Array von Highlight-Strings für buildDigestHtml().
 *
 * Extrahiert die Bullet-Points aus dem Markdown.
 */
export function extractHighlightsFromMarkdown(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.replace(/^- /, '').trim())
    .filter(Boolean);
}

// ── Monatlicher Dividenden-Fahrplan ──────────────────────────────────────────

export interface MonthlyDividendEntry {
  month:          number;   // 1–12
  label:          string;   // "Januar" … "Dezember"
  holdings: {
    symbol:           string;
    name:             string;
    estimatedPayout:  number; // Stückzahl × dividendPerShare (Jahreswert / 4 Quartale)
    isEstimated:      boolean;
  }[];
  totalEstimated: number;   // Summe für diesen Monat
}

const MONTH_LABELS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Baut einen monatlichen Dividenden-Fahrplan aus den Holding-Dividenden.
 *
 * Logik:
 *  - Hat eine Position ein bekanntes Ex-Datum → Auszahlung in diesem Monat anzeigen.
 *  - Hat sie kein Ex-Datum → Jahresdividende gleichmäßig auf Q1/Q2/Q3/Q4 verteilen
 *    (Monate 3, 6, 9, 12 – übliche Quartalsmonate).
 *
 * Verwendung im Newsletter:
 *   const schedule = buildMonthlyDividendSchedule(holdingDividends);
 *   // schedule[0] = Januar, schedule[11] = Dezember
 *
 * Hinweis: Nur informativ. Tatsächliche Ausschüttungstermine beim Unternehmen prüfen.
 */
export function buildMonthlyDividendSchedule(
  holdingDividends: Array<{
    symbol:           string;
    name:             string;
    annualIncome:     number;
    exDividendDate:   string;
    isEstimated:      boolean;
  }>,
  year = new Date().getFullYear(),
): MonthlyDividendEntry[] {
  // Initialisiere 12 leere Monate
  const months: MonthlyDividendEntry[] = MONTH_LABELS.map((label, i) => ({
    month: i + 1,
    label,
    holdings: [],
    totalEstimated: 0,
  }));

  for (const h of holdingDividends) {
    if (h.annualIncome <= 0) continue;

    if (h.exDividendDate) {
      // Bekanntes Ex-Datum → Auszahlung im entsprechenden Monat eintragen
      const d = new Date(h.exDividendDate);
      if (d.getFullYear() === year) {
        const mi = d.getMonth(); // 0-basiert
        months[mi].holdings.push({
          symbol:          h.symbol,
          name:            h.name,
          estimatedPayout: h.annualIncome,   // Jahresdividende für dieses Ex-Datum
          isEstimated:     h.isEstimated,
        });
        months[mi].totalEstimated += h.annualIncome;
      }
    } else {
      // Kein bekanntes Datum → auf 4 Quartale (Q1=März, Q2=Juni, Q3=Sep, Q4=Dez) verteilen
      const quarterMonths = [2, 5, 8, 11]; // 0-basiert: März, Juni, Sept, Dez
      const quarterlyPayout = h.annualIncome / 4;
      for (const mi of quarterMonths) {
        months[mi].holdings.push({
          symbol:          h.symbol,
          name:            h.name,
          estimatedPayout: quarterlyPayout,
          isEstimated:     true, // Verteilung ist immer geschätzt
        });
        months[mi].totalEstimated += quarterlyPayout;
      }
    }
  }

  return months;
}

/**
 * Konvertiert den monatlichen Fahrplan in einen Markdown-Abschnitt
 * für den Newsletter. Monate ohne Auszahlungen werden übersprungen.
 */
export function buildMonthlyScheduleMarkdown(
  schedule: MonthlyDividendEntry[],
  year = new Date().getFullYear(),
): string {
  const activeMonths = schedule.filter(m => m.holdings.length > 0);
  if (!activeMonths.length) return '';

  const lines: string[] = [];
  lines.push(`## 📅 Dividenden-Fahrplan ${year}`);
  lines.push('');
  lines.push('> Schätzungen auf Basis bekannter Ex-Daten bzw. quartalsweiser Verteilung. Keine Garantie.');
  lines.push('');

  for (const m of activeMonths) {
    lines.push(`### ${m.label} — ${m.totalEstimated.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
    for (const h of m.holdings.sort((a, b) => b.estimatedPayout - a.estimatedPayout)) {
      const est = h.isEstimated ? ' *(KI)*' : '';
      lines.push(`- **${h.name}** (\`${h.symbol}\`): ${h.estimatedPayout.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${est}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
