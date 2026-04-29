import { Resend } from 'resend';
import type { NewsletterSubscriber } from './subscribers.js';

const FROM_EMAIL =
  process.env.EMAIL_FROM ??
  process.env.FROM_EMAIL ??
  'Moneta <onboarding@resend.dev>';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let _resend: Resend | null = null;

export function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY nicht gesetzt – E-Mail-Versand nicht verfügbar.');
    return null;
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const client = getResendClient();
  if (!client) return { success: false, error: 'RESEND_API_KEY nicht konfiguriert' };

  const from = params.from ?? FROM_EMAIL;
  const to   = Array.isArray(params.to) ? params.to : [params.to];
  const trySend = () =>
    client.emails.send({ from, to, subject: params.subject, html: params.html });

  let { data, error } = await trySend();
  if (error) {
    const isRateLimit =
      (error as any).statusCode === 429 ||
      error.message?.includes('429') ||
      error.message?.toLowerCase().includes('rate limit');
    if (isRateLimit) {
      console.warn('[email] Rate-Limit (429) – warte 2s…');
      await sleep(2000);
      ({ data, error } = await trySend());
    }
  }
  if (error) return { success: false, error: error.message };
  return { success: true, id: data?.id };
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const BG           = '#070d1a';
const HERO_BG      = 'linear-gradient(145deg,#0f1b38 0%,#16113a 100%)';
const CARD_BG      = '#0b1528';
const CARD_BDR     = '#1e2d4a';
const ROW_DIV      = '#121f36';
const ACCENT       = '#6366f1';
const ACCENT2      = '#8b5cf6';
const TEXT_PRI     = '#f1f5f9';
const TEXT_SEC     = '#94a3b8';
const TEXT_DIM     = '#475569';
const TEXT_MUT     = '#334155';
const LABEL_CLR    = '#818cf8';
const GREEN_BG     = '#052e16';
const GREEN_BDR    = '#166534';
const GREEN_TXT    = '#22c55e';
const RED_BG       = '#450a0a';
const RED_BDR      = '#991b1b';
const RED_TXT      = '#ef4444';

// ── Shared HTML helpers ───────────────────────────────────────────────────────

function emailHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${title}</title>
</head>`;
}

function emailHeader(rightLabel: string): string {
  return `<tr><td style="padding-bottom:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td>
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:34px;height:34px;background:linear-gradient(135deg,${ACCENT},${ACCENT2});border-radius:10px;text-align:center;vertical-align:middle;font-size:17px;line-height:34px;">📈</td>
          <td style="padding-left:9px;font-size:20px;font-weight:800;color:${TEXT_PRI};letter-spacing:-0.03em;">Moneta</td>
        </tr></table>
      </td>
      <td align="right" style="font-size:11px;color:${TEXT_DIM};font-weight:500;letter-spacing:0.01em;">${rightLabel}</td>
    </tr></table>
  </td></tr>`;
}

function sectionCard(label: string, content: string, extra = ''): string {
  return `<tr><td style="background:${CARD_BG};border:1px solid ${CARD_BDR};border-radius:16px;padding:20px 20px 16px;${extra}">
    <p style="margin:0 0 13px;font-size:10px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">${label}</p>
    ${content}
  </td></tr>`;
}

function spacer(h = 8): string {
  return `<tr><td style="height:${h}px;line-height:${h}px;">&nbsp;</td></tr>`;
}

function emailCta(href: string, label: string): string {
  return `<tr><td align="center" style="padding:18px 0 32px;">
    <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,${ACCENT},${ACCENT2});color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 36px;border-radius:12px;letter-spacing:0.03em;">${label}</a>
  </td></tr>`;
}

function emailFooter(hint: string): string {
  return `<tr><td style="border-top:1px solid ${CARD_BDR};padding-top:18px;">
    <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:${ACCENT};letter-spacing:0.02em;">Moneta – Investieren mit Durchblick.</p>
    <p style="margin:0;font-size:11px;color:${TEXT_MUT};line-height:1.7;">${hint}</p>
  </td></tr>`;
}

function valueCard(
  label: string, value: string, sub?: string,
  bg = 'rgba(255,255,255,0.04)', border = 'rgba(255,255,255,0.08)',
  labelColor = TEXT_DIM, valueColor = TEXT_PRI,
): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${bg};border:1px solid ${border};border-radius:14px;padding:16px 18px;">
    <tr><td>
      <p style="margin:0 0 6px;font-size:10px;color:${labelColor};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">${label}</p>
      <p style="margin:0 0 ${sub ? '4px' : '0'};font-size:22px;font-weight:800;color:${valueColor};letter-spacing:-0.02em;line-height:1;">${value}</p>
      ${sub ? `<p style="margin:0;font-size:12px;color:${valueColor};opacity:0.8;">${sub}</p>` : ''}
    </td></tr>
  </table>`;
}

function twoColumnCards(left: string, right: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:0;">
    <tr>
      <td width="49%" style="vertical-align:top;">${left}</td>
      <td width="2%">&nbsp;</td>
      <td width="49%" style="vertical-align:top;">${right}</td>
    </tr>
  </table>`;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
}

function changeBadge(pct: number): string {
  const color = pct >= 0 ? GREEN_TXT : RED_TXT;
  const sign  = pct >= 0 ? '+' : '';
  return `<span style="font-size:12px;font-weight:700;color:${color};">${sign}${pct.toFixed(2)}%</span>`;
}

// ── buildDailySnapshotHtml ────────────────────────────────────────────────────

export interface StockNewsItem {
  title: string;
  source: string;
  snippet: string;
  importance: 'hoch' | 'mittel' | 'niedrig';
  impact_emoji: string;
  ticker?: string;
}

export interface DailyHolding {
  symbol: string;
  name?: string;
  value?: number;
  changePercent?: number | null;
  weightingPct?: number;
  sentiment?: 'POSITIV' | 'NEUTRAL' | 'NEGATIV';
  marketComment?: string;
  trend?: 'Steigend' | 'Stabil' | 'Fallend';
}

export function buildDailySnapshotHtml(options: {
  userName?: string;
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  ctaUrl?: string;
  dateLabel?: string;
  macroNews?: string[];
  topHoldings?: DailyHolding[];
  stockNews?: StockNewsItem[];
}): string {
  const {
    userName,
    totalValue,
    dailyChange,
    dailyChangePercent,
    ctaUrl = 'https://moneta-invest.de',
    dateLabel = new Date().toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
    macroNews  = [],
    topHoldings = [],
    stockNews  = [],
  } = options;

  const pos   = dailyChange >= 0;
  const sign  = pos ? '+' : '';
  const arrow = pos ? '▲' : '▼';
  const chTxt = pos ? GREEN_TXT : RED_TXT;
  const chBg  = pos ? GREEN_BG  : RED_BG;
  const chBdr = pos ? GREEN_BDR : RED_BDR;

  // ── Markt-Signale: 2-Spalten-Karten ─────────────────────────────────────────
  function newsCard(item: StockNewsItem): string {
    const impBg  = item.importance === 'hoch'   ? '#2d0a0a' : item.importance === 'mittel' ? '#1a1206' : '#0a1a0a';
    const impBdr = item.importance === 'hoch'   ? '#7f1d1d' : item.importance === 'mittel' ? '#78350f' : '#14532d';
    const impTxt = item.importance === 'hoch'   ? '#fca5a5' : item.importance === 'mittel' ? '#fcd34d' : '#86efac';
    const impLbl = item.importance === 'hoch'   ? 'HOCH'    : item.importance === 'mittel' ? 'MITTEL'  : 'NIEDRIG';
    const tickerBadge = item.ticker
      ? `<span style="margin-left:5px;color:${TEXT_DIM};font-size:9px;font-weight:700;letter-spacing:0.06em;">${item.ticker}</span>`
      : '';
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background:#0d1f3c;border:1px solid ${CARD_BDR};border-radius:12px;">
      <tr><td style="padding:12px 13px 11px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:top;">
              <span style="background:${impBg};border:1px solid ${impBdr};color:${impTxt};border-radius:4px;padding:2px 6px;font-size:8px;font-weight:800;letter-spacing:0.1em;">${impLbl}</span>${tickerBadge}
              <span style="margin-left:5px;font-size:9px;color:${TEXT_DIM};">${item.source}</span>
            </td>
            <td align="right" style="vertical-align:top;font-size:13px;color:${TEXT_DIM};">→</td>
          </tr>
        </table>
        <p style="margin:7px 0 4px;font-size:12px;font-weight:700;color:${TEXT_PRI};line-height:1.4;">${item.title}</p>
        <p style="margin:0;font-size:11px;color:${TEXT_SEC};line-height:1.45;">${item.snippet}</p>
      </td></tr>
    </table>`;
  }

  const newsRows: string[] = [];
  for (let i = 0; i < stockNews.length; i += 2) {
    const left  = stockNews[i]   ? newsCard(stockNews[i])   : '';
    const right = stockNews[i+1] ? newsCard(stockNews[i+1]) : '<table width="100%"><tr><td></td></tr></table>';
    newsRows.push(`
  <tr>
    <td width="49%" style="vertical-align:top;">${left}</td>
    <td width="2%" style="min-width:8px;">&nbsp;</td>
    <td width="49%" style="vertical-align:top;">${right}</td>
  </tr>
  ${i + 2 < stockNews.length ? `<tr><td colspan="3" style="height:8px;"></td></tr>` : ''}`);
  }

  const marktSignaleBlock = stockNews.length === 0 ? '' : `
  <!-- ─ MARKT-SIGNALE ─ -->
  ${sectionCard('Markt-Signale', `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${newsRows.join('')}
    </table>`,
    `margin-bottom:0;`
  )}`;

  // ── Depot-Überblick Tabelle ──────────────────────────────────────────────────
  function sentimentBadge(s?: string): string {
    if (s === 'POSITIV') return `<span style="background:#052e16;border:1px solid #166534;color:${GREEN_TXT};border-radius:6px;padding:3px 8px;font-size:9px;font-weight:700;letter-spacing:0.06em;white-space:nowrap;">POSITIV</span>`;
    if (s === 'NEGATIV') return `<span style="background:#450a0a;border:1px solid #991b1b;color:${RED_TXT};border-radius:6px;padding:3px 8px;font-size:9px;font-weight:700;letter-spacing:0.06em;white-space:nowrap;">NEGATIV</span>`;
    return `<span style="background:#0f172a;border:1px solid #334155;color:${TEXT_DIM};border-radius:6px;padding:3px 8px;font-size:9px;font-weight:700;letter-spacing:0.06em;white-space:nowrap;">NEUTRAL</span>`;
  }

  function trendLabel(t?: string): string {
    if (t === 'Steigend') return `<span style="color:${GREEN_TXT};font-size:12px;font-weight:600;">↑ Steigend</span>`;
    if (t === 'Fallend')  return `<span style="color:${RED_TXT};font-size:12px;font-weight:600;">↓ Fallend</span>`;
    return `<span style="color:${TEXT_DIM};font-size:12px;font-weight:600;">→ Stabil</span>`;
  }

  function weightBar(pct?: number): string {
    const p = Math.min(100, Math.max(0, pct ?? 0));
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding-bottom:4px;font-size:11px;font-weight:700;color:${TEXT_PRI};">${p.toFixed(2)}&thinsp;%</td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:${CARD_BDR};border-radius:3px;height:4px;overflow:hidden;">
          <tr><td width="${Math.round(p)}%" style="background:${ACCENT};height:4px;border-radius:3px;font-size:0;">&nbsp;</td>
              <td style="height:4px;"></td></tr>
        </table>
      </td></tr>
    </table>`;
  }

  const holdingsTableBlock = topHoldings.length === 0 ? '' : (() => {
    const hasAiCols = topHoldings.some(h => h.sentiment || h.marketComment || h.trend);
    const rows = topHoldings.map((h, i) => {
      const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
      const companyName = h.name && h.name !== h.symbol
        ? `<p style="margin:0 0 2px;font-size:13px;font-weight:700;color:${TEXT_PRI};line-height:1.3;">${h.name.length > 22 ? h.name.slice(0, 21) + '…' : h.name}</p>`
        : '';
      return `
  <tr>
    <td style="${border}padding:11px 0 11px 4px;vertical-align:top;width:150px;">
      ${companyName}
      <span style="font-size:10px;color:${LABEL_CLR};font-weight:700;font-family:monospace;letter-spacing:0.04em;">${h.symbol}</span>
    </td>
    <td style="${border}padding:11px 8px;vertical-align:top;width:80px;">${weightBar(h.weightingPct)}</td>
    ${hasAiCols ? `
    <td style="${border}padding:11px 6px;vertical-align:top;width:72px;">${sentimentBadge(h.sentiment)}</td>
    <td style="${border}padding:11px 8px;vertical-align:top;">
      <p style="margin:0;font-size:11px;color:${TEXT_SEC};line-height:1.5;">${h.marketComment ?? '–'}</p>
    </td>
    <td style="${border}padding:11px 4px 11px 0;vertical-align:top;white-space:nowrap;text-align:right;">${trendLabel(h.trend)}</td>
    ` : `
    <td style="${border}padding:11px 4px 11px 0;vertical-align:top;text-align:right;white-space:nowrap;">
      ${h.changePercent != null
        ? `<span style="font-size:12px;font-weight:700;color:${h.changePercent >= 0 ? GREEN_TXT : RED_TXT};">${h.changePercent >= 0 ? '+' : ''}${h.changePercent.toFixed(2)}%</span>`
        : `<span style="font-size:12px;color:${TEXT_DIM};">–</span>`}
    </td>`}
  </tr>`;
    }).join('');

    const aiHeaders = hasAiCols ? `
      <td style="padding:0 6px 10px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;vertical-align:bottom;">Marktstimmung</td>
      <td style="padding:0 8px 10px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;vertical-align:bottom;">Marktlage (informativ)</td>
      <td style="padding:0 0 10px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;text-align:right;vertical-align:bottom;">Trend</td>` : `
      <td style="padding:0 0 10px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;text-align:right;vertical-align:bottom;">Heute</td>`;

    return `
  <!-- ─ DEPOT-ÜBERBLICK ─ -->
  ${spacer(8)}
  ${sectionCard('Depot-Überblick', `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr style="border-bottom:1px solid ${ROW_DIV};">
        <td style="padding:0 0 10px 4px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;vertical-align:bottom;">Firma&nbsp;/&nbsp;Anlage</td>
        <td style="padding:0 8px 10px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;vertical-align:bottom;">Gewichtung</td>
        ${aiHeaders}
      </tr>
      ${rows}
    </table>`,
    `margin-bottom:0;`
  )}`;
  })();

  // ── Performance-Zusammenfassung (kompakt, nach Depot) ────────────────────────
  const perfRow = `
  <!-- ─ TAGESABSCHLUSS ─ -->
  ${spacer(8)}
  <tr><td style="background:${HERO_BG};border:1px solid ${CARD_BDR};border-radius:16px;padding:18px 20px;">
    <p style="margin:0 0 3px;font-size:9px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Tagesabschluss</p>
    <p style="margin:0 0 14px;font-size:13px;color:${TEXT_SEC};">${userName ? `Hallo ${userName},` : 'Hallo,'} hier ist dein heutiger Depotstand.</p>
    ${twoColumnCards(
      valueCard('Depotwert', fmtEur(totalValue)),
      valueCard(`Heute ${arrow}`, `${sign}${fmtEur(dailyChange)}`, `${sign}${dailyChangePercent.toFixed(2)} %`, chBg, chBdr, chTxt, chTxt),
    )}
  </td></tr>`;

  // ── Makrolage (kompakt, optionale Ergänzung) ─────────────────────────────────
  const macroBlock = macroNews.length === 0 ? '' : `
  ${spacer(8)}
  ${sectionCard('Marktlage', macroNews.map((n, i) => `
    <table cellpadding="0" cellspacing="0" border="0" style="${i > 0 ? `border-top:1px solid ${ROW_DIV};` : ''}padding:${i > 0 ? '8' : '0'}px 0 8px;width:100%;"><tr>
      <td style="width:10px;vertical-align:top;padding-top:4px;"><span style="display:inline-block;width:5px;height:5px;background:${LABEL_CLR};border-radius:50%;"></span></td>
      <td style="padding-left:8px;font-size:12px;color:#cbd5e1;line-height:1.5;">${n}</td>
    </tr></table>`).join('')
  )}`;

  return `${emailHead('Moneta – Tagesabschluss')}
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:24px 16px 48px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

  ${emailHeader(dateLabel)}

  ${marktSignaleBlock}

  ${holdingsTableBlock}

  ${perfRow}

  ${macroBlock}

  ${emailCta(ctaUrl, 'Depot öffnen →')}

  ${emailFooter('Du erhältst diese Mail, weil du den täglichen Depot-Überblick aktiviert hast.<br>Zum Abmelden deaktiviere den Toggle in deinen Einstellungen.')}

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── buildDigestHtml (Wochenbericht) ───────────────────────────────────────────

export interface WeeklyEarning {
  ticker: string;
  company: string;
  date: string;
  timeOfDay?: string;
  quarter?: string;
  epsEstimate?: string;
}

export interface WeeklyDividend {
  symbol: string;
  company: string;
  exDate: string;
  dps: number;           // Jahresdividende je Aktie
  yieldPct?: number;
  shares?: number;       // Stückzahl (für P.A. Gesamt)
  annualIncome?: number; // shares × dps
}

export function buildDigestHtml(options: {
  userName?: string;
  summary?: string;
  highlights?: string[];
  ctaUrl?: string;
  totalValue?: number;
  weeklyChange?: number;
  weeklyChangePercent?: number;
  upcomingEarnings?: WeeklyEarning[];
  pastEarnings?: WeeklyEarning[];
  upcomingDividends?: WeeklyDividend[];
  pastDividends?: WeeklyDividend[];
  portfolioChartUrl?: string;
}): string {
  const {
    userName,
    summary = 'Dein wöchentlicher KI-Depot-Überblick.',
    highlights = [],
    ctaUrl = 'https://moneta-invest.de',
    totalValue,
    weeklyChange,
    weeklyChangePercent,
    upcomingEarnings = [],
    pastEarnings = [],
    upcomingDividends = [],
    pastDividends = [],
    portfolioChartUrl,
  } = options;

  const now       = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const fmtD = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const weekLabel = `${fmtD(weekStart)} – ${fmtD(weekEnd)}, ${now.getFullYear()}`;

  // ── Performance-Block ────────────────────────────────────────────────────────
  let perfBlock = '';
  if (totalValue !== undefined && weeklyChange !== undefined && weeklyChangePercent !== undefined) {
    const pos  = weeklyChange >= 0;
    const sign = pos ? '+' : '';
    const arrow = pos ? '▲' : '▼';
    const chBg  = pos ? GREEN_BG  : RED_BG;
    const chBdr = pos ? GREEN_BDR : RED_BDR;
    const chTxt = pos ? GREEN_TXT : RED_TXT;
    perfBlock = twoColumnCards(
      valueCard('Depotwert', fmtEur(totalValue)),
      valueCard(`Diese Woche ${arrow}`, `${sign}${fmtEur(weeklyChange)}`, `${sign}${weeklyChangePercent.toFixed(2)} %`,
        chBg, chBdr, chTxt, chTxt),
    );
  }

  // ── Highlights ───────────────────────────────────────────────────────────────
  const highlightContent = highlights.length === 0 ? '' : highlights.map((h, i) => {
    const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
    return `
  <tr><td style="${border}padding:9px 0;">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:24px;vertical-align:top;padding-top:1px;">
        <span style="display:inline-block;width:20px;height:20px;background:linear-gradient(135deg,${ACCENT},${ACCENT2});border-radius:6px;text-align:center;line-height:20px;font-size:11px;color:white;font-weight:700;">${i + 1}</span>
      </td>
      <td style="padding-left:10px;font-size:13px;color:#cbd5e1;line-height:1.55;">${h}</td>
    </tr></table>
  </td></tr>`;
  }).join('');

  // ── Earnings-Zeile (App-Style: Datum links, Details rechts) ─────────────────
  function earningRow(e: WeeklyEarning, isPast: boolean, isFirst: boolean): string {
    const d       = new Date(e.date + 'T12:00:00');
    const today   = new Date(); today.setHours(0,0,0,0);
    const diffMs  = d.getTime() - today.getTime();
    const diffD   = Math.round(diffMs / 86400000);
    const dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' });
    const countdownTxt  = isPast
      ? `vor ${Math.abs(diffD)}d`
      : diffD === 0 ? 'Heute' : `in ${diffD}d`;
    const countdownClr  = isPast ? TEXT_DIM : diffD <= 3 ? GREEN_TXT : '#818cf8';
    const isBald        = !isPast && diffD >= 0 && diffD <= 3;
    const timingBg      = e.timeOfDay === 'vor Marktöffnung'  ? '#451a03' : e.timeOfDay === 'nach Marktschluss' ? '#052e16' : '#0f172a';
    const timingBdr     = e.timeOfDay === 'vor Marktöffnung'  ? '#92400e' : e.timeOfDay === 'nach Marktschluss' ? '#166534' : '#1e3a8a';
    const timingTxt     = e.timeOfDay === 'vor Marktöffnung'  ? '#fcd34d' : e.timeOfDay === 'nach Marktschluss' ? '#86efac' : TEXT_DIM;
    const border = isFirst ? '' : `border-top:1px solid ${ROW_DIV};`;
    return `
  <tr><td style="${border}padding:12px 0;opacity:${isPast ? '0.65' : '1'};">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:72px;vertical-align:top;padding-right:10px;">
        <p style="margin:0;font-size:13px;font-weight:800;color:${TEXT_PRI};line-height:1.2;">${dateStr}</p>
        <p style="margin:3px 0 0;font-size:10px;font-weight:700;color:${countdownClr};">${countdownTxt}</p>
      </td>
      <td style="vertical-align:top;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;"><tr>
          <td style="font-size:10px;font-weight:700;color:${LABEL_CLR};font-family:monospace;vertical-align:middle;white-space:nowrap;">${e.ticker}</td>
          <td style="padding-left:7px;font-size:13px;font-weight:700;color:${TEXT_PRI};vertical-align:middle;">${e.company}</td>
          ${isBald ? `<td style="padding-left:6px;vertical-align:middle;"><span style="background:#166534;border:1px solid ${GREEN_TXT};color:${GREEN_TXT};border-radius:4px;padding:1px 6px;font-size:8px;font-weight:800;letter-spacing:0.1em;">BALD</span></td>` : ''}
        </tr></table>
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          ${e.quarter ? `<td style="font-size:10px;color:${TEXT_DIM};padding-right:8px;">${e.quarter}</td>` : ''}
          ${e.timeOfDay && e.timeOfDay !== 'unbekannt' ? `<td style="padding-right:8px;"><span style="background:${timingBg};border:1px solid ${timingBdr};color:${timingTxt};border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;">${e.timeOfDay}</span></td>` : ''}
          ${e.epsEstimate ? `<td style="font-size:10px;color:${TEXT_DIM};">EPS:&nbsp;<strong style="color:${TEXT_SEC};">${e.epsEstimate}</strong></td>` : ''}
        </tr></table>
      </td>
    </tr></table>
  </td></tr>`;
  }

  // ── Dividenden-Tabelle (App-Style: Position | Ex-Datum | Je Aktie | P.A.) ──
  function dividendTableRows(divs: WeeklyDividend[], isPast: boolean): string {
    const today = new Date(); today.setHours(0,0,0,0);
    return divs.map((d, i) => {
      const dt      = new Date(d.exDate + 'T12:00:00');
      const diffD   = Math.round((dt.getTime() - today.getTime()) / 86400000);
      const dateStr = dt.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' });
      const countdown = isPast
        ? `vor ${Math.abs(diffD)}d`
        : diffD === 0 ? 'Heute' : `in ${diffD}d`;
      const income = d.annualIncome ?? (d.shares ? d.shares * d.dps : null);
      const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
      return `
  <tr style="opacity:${isPast ? '0.7' : '1'};">
    <td style="${border}padding:11px 12px 11px 0;vertical-align:top;">
      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:${TEXT_PRI};">${d.company}</p>
      ${isPast ? `<p style="margin:0 0 2px;"><span style="font-size:8px;font-weight:700;color:${GREEN_TXT};">✓ EX-DATUM VORBEI</span></p>` : ''}
      <p style="margin:0;font-size:10px;color:${TEXT_DIM};">${d.symbol}${d.shares ? ` · ${d.shares} Stk` : ''}</p>
    </td>
    <td style="${border}padding:11px 12px;vertical-align:top;white-space:nowrap;">
      <p style="margin:0;font-size:12px;font-weight:700;color:${TEXT_SEC};">${dateStr}</p>
      <p style="margin:2px 0 0;font-size:10px;color:${TEXT_DIM};">${countdown}</p>
    </td>
    <td align="right" style="${border}padding:11px 12px;vertical-align:top;white-space:nowrap;">
      <p style="margin:0;font-size:12px;color:${TEXT_SEC};">${d.dps.toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2})} €</p>
    </td>
    <td align="right" style="${border}padding:11px 0;vertical-align:top;white-space:nowrap;">
      <p style="margin:0;font-size:14px;font-weight:800;color:${TEXT_PRI};">${income != null ? income.toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' €' : '–'}</p>
    </td>
  </tr>`;
    }).join('');
  }

  const divTableHeader = `
  <tr style="border-bottom:1px solid ${CARD_BDR};">
    <td style="padding:0 12px 9px 0;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Position</td>
    <td style="padding:0 12px 9px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Ex-Datum</td>
    <td align="right" style="padding:0 12px 9px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Je Aktie</td>
    <td align="right" style="padding:0 0 9px;font-size:8px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">P.A. Gesamt</td>
  </tr>`;

  // ── Earnings-Block (eigene Karte) ─────────────────────────────────────────
  const hasEarnings = pastEarnings.length > 0 || upcomingEarnings.length > 0;
  const earningsBlock = !hasEarnings ? '' : (() => {
    const allEarningsRows = [
      ...pastEarnings.map((e, i)    => earningRow(e, true,  i === 0 && upcomingEarnings.length === 0)),
      ...upcomingEarnings.map((e, i) => earningRow(e, false, i === 0)),
    ].join('');
    const countBadge = `<span style="font-size:10px;color:${TEXT_DIM};font-weight:500;">${pastEarnings.length + upcomingEarnings.length} Termin${pastEarnings.length + upcomingEarnings.length !== 1 ? 'e' : ''}</span>`;
    return sectionCard(
      `Earnings-Termine &nbsp;${countBadge}`,
      `<table width="100%" cellpadding="0" cellspacing="0" border="0">${allEarningsRows}</table>
      <p style="margin:12px 0 0;font-size:9px;color:${TEXT_DIM};font-style:italic;">Daten aus Yahoo Finance / KI · Keine Anlageberatung · Offizielle Termine beim Unternehmen prüfen</p>`
    );
  })();

  // ── Dividenden-Block (eigene Karte) ───────────────────────────────────────
  const hasDividends = pastDividends.length > 0 || upcomingDividends.length > 0;
  const dividendsBlock = !hasDividends ? '' : (() => {
    let content = `<table width="100%" cellpadding="0" cellspacing="0" border="0">${divTableHeader}`;
    if (pastDividends.length > 0) {
      content += `<tr><td colspan="4" style="padding:10px 0 4px;font-size:9px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.14em;">Vergangene Woche</td></tr>`;
      content += dividendTableRows(pastDividends, true);
    }
    if (pastDividends.length > 0 && upcomingDividends.length > 0) {
      content += `<tr><td colspan="4" style="padding:14px 0 4px;font-size:9px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.14em;">Nächste Woche</td></tr>`;
    }
    if (upcomingDividends.length > 0) {
      if (pastDividends.length === 0) {
        content += `<tr><td colspan="4" style="padding:10px 0 4px;font-size:9px;color:${TEXT_DIM};font-weight:700;text-transform:uppercase;letter-spacing:0.14em;">Nächste Woche</td></tr>`;
      }
      content += dividendTableRows(upcomingDividends, false);
    }
    content += `</table>
    <p style="margin:12px 0 0;font-size:9px;color:${TEXT_DIM};font-style:italic;">Schätzungen auf Basis historischer Ex-Daten · Keine Anlageberatung</p>`;
    return sectionCard('Dividenden je Position', content);
  })();

  return `${emailHead('Moneta – KI-Wochenbericht')}
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:24px 16px 48px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

  ${emailHeader(weekLabel)}

  ${highlights.length > 0 ? `
  <!-- ─ HIGHLIGHTS (zuerst) ─ -->
  ${sectionCard('KI-Highlights der Woche',
    `<table width="100%" cellpadding="0" cellspacing="0" border="0">${highlightContent}</table>`
  )}
  ${spacer()}` : ''}

  <!-- ─ PERFORMANCE CARD ─ -->
  <tr><td style="background:${HERO_BG};border:1px solid ${CARD_BDR};border-radius:20px;padding:24px 24px 20px;">
    <p style="margin:0 0 3px;font-size:10px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">KI-Wochenbericht</p>
    <p style="margin:0 0 ${perfBlock ? '18px' : '0'};font-size:14px;color:${TEXT_SEC};line-height:1.5;">${userName ? `Hallo ${userName},` : 'Hallo,'} ${summary}</p>
    ${perfBlock}
  </td></tr>

  ${portfolioChartUrl ? `${spacer()}
  <!-- ─ PORTFOLIO-CHART ─ -->
  ${sectionCard('Portfolio-Übersicht',
    `<img src="${portfolioChartUrl}" width="520" style="max-width:100%;border-radius:10px;display:block;margin:0 auto;" alt="Portfolio-Allokation" />`
  )}` : ''}

  ${hasEarnings ? `${spacer()}
  <!-- ─ EARNINGS-TERMINE ─ -->
  ${earningsBlock}` : ''}

  ${hasDividends ? `${spacer()}
  <!-- ─ DIVIDENDEN ─ -->
  ${dividendsBlock}` : ''}

  ${emailCta(ctaUrl, 'Wochenbericht öffnen →')}

  ${emailFooter('Du erhältst diese Mail, weil du den KI-Wochenbericht aktiviert hast.<br>Zum Abmelden deaktiviere den Toggle in deinen Einstellungen.')}

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── sendDigestToSubscribers ───────────────────────────────────────────────────

export async function sendDigestToSubscribers(
  subscribers: NewsletterSubscriber[],
  content: { subject?: string; summary?: string; highlights?: string[]; ctaUrl?: string }
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const subject = content.subject ?? 'Dein KI-Wochenbericht – Moneta';
  let sent = 0, failed = 0;
  const errors: string[] = [];
  const total = subscribers.length;

  for (let i = 0; i < total; i++) {
    const sub = subscribers[i];
    console.log(`[email] Sende an ${sub.email} (${i + 1}/${total})…`);

    const html = buildDigestHtml({
      userName:   sub.name,
      summary:    content.summary,
      highlights: content.highlights,
      ctaUrl:     content.ctaUrl,
    });

    const result = await sendEmail({ to: sub.email, subject, html });
    if (result.success) {
      sent++;
      console.log(`[email] ✓ ${sub.email} (id: ${result.id})`);
    } else {
      failed++;
      const msg = `${sub.email}: ${result.error}`;
      errors.push(msg);
      console.error(`[email] ✗ ${msg}`);
    }
    if (i < total - 1) await sleep(600);
  }

  return { sent, failed, errors };
}
