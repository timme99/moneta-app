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

export function buildDailySnapshotHtml(options: {
  userName?: string;
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  ctaUrl?: string;
  dateLabel?: string;
  macroNews?: string[];
  topHoldings?: { symbol: string; name?: string; value?: number; changePercent?: number | null }[];
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

  const pos    = dailyChange >= 0;
  const sign   = pos ? '+' : '';
  const arrow  = pos ? '▲' : '▼';
  const chBg   = pos ? GREEN_BG  : RED_BG;
  const chBdr  = pos ? GREEN_BDR : RED_BDR;
  const chTxt  = pos ? GREEN_TXT : RED_TXT;

  const leftCard  = valueCard('Depotwert', fmtEur(totalValue));
  const rightCard = valueCard(
    `Heute ${arrow}`,
    `${sign}${fmtEur(dailyChange)}`,
    `${sign}${dailyChangePercent.toFixed(2)} %`,
    chBg, chBdr, chTxt, chTxt,
  );

  // ── Positionen-Tabelle ──────────────────────────────────────────────────────
  const holdingsTable = topHoldings.length === 0 ? '' : `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid rgba(255,255,255,0.07);padding-top:14px;">
    <tr>
      <td style="font-size:10px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.15em;text-transform:uppercase;padding-bottom:8px;">Positionen</td>
      <td align="right" style="font-size:10px;color:${TEXT_DIM};font-weight:600;text-transform:uppercase;letter-spacing:0.1em;padding-bottom:8px;">Wert</td>
      <td align="right" style="font-size:10px;color:${TEXT_DIM};font-weight:600;text-transform:uppercase;letter-spacing:0.1em;padding-bottom:8px;padding-left:12px;">Heute</td>
    </tr>
    ${topHoldings.map((h, i) => {
      const chg = h.changePercent;
      const chgCell = chg != null
        ? `<span style="font-size:12px;font-weight:700;color:${chg >= 0 ? GREEN_TXT : RED_TXT};">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>`
        : `<span style="font-size:12px;color:${TEXT_DIM};">–</span>`;
      const valCell = h.value != null && h.value > 0
        ? `<span style="font-size:12px;color:${TEXT_SEC};">${fmtEur(h.value)}</span>`
        : `<span style="font-size:12px;color:${TEXT_DIM};">–</span>`;
      const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
      return `
    <tr>
      <td style="${border}padding:7px 0;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background:rgba(99,102,241,0.13);border:1px solid rgba(99,102,241,0.22);color:#a5b4fc;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:700;letter-spacing:0.04em;white-space:nowrap;">${h.symbol}</td>
          ${h.name ? `<td style="padding-left:8px;font-size:12px;color:${TEXT_DIM};white-space:nowrap;max-width:140px;overflow:hidden;">${h.name.length > 18 ? h.name.slice(0, 17) + '…' : h.name}</td>` : ''}
        </tr></table>
      </td>
      <td align="right" style="${border}padding:7px 0;">${valCell}</td>
      <td align="right" style="${border}padding:7px 0 7px 12px;">${chgCell}</td>
    </tr>`;
    }).join('')}
  </table>`;

  // ── Aktien-News ─────────────────────────────────────────────────────────────
  const newsContent = stockNews.length === 0 ? '' : stockNews.map((item, i) => {
    const impBg  = item.importance === 'hoch' ? '#3b0a0a' : item.importance === 'mittel' ? '#0c1a38' : 'rgba(255,255,255,0.04)';
    const impBdr = item.importance === 'hoch' ? '#7f1d1d' : item.importance === 'mittel' ? '#1e3a8a' : 'rgba(255,255,255,0.08)';
    const impTxt = item.importance === 'hoch' ? '#fca5a5' : item.importance === 'mittel' ? '#93c5fd' : TEXT_DIM;
    const impLbl = item.importance === 'hoch' ? '● Wichtig' : item.importance === 'mittel' ? '● Markt' : '● Info';
    const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
    return `
  <tr><td style="${border}padding:9px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:26px;vertical-align:top;padding-top:1px;font-size:17px;line-height:1;">${item.impact_emoji}</td>
      <td style="padding-left:9px;vertical-align:top;">
        <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#e2e8f0;line-height:1.4;">${item.title}</p>
        <p style="margin:0 0 5px;font-size:12px;color:${TEXT_SEC};line-height:1.45;">${item.snippet}</p>
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-size:10px;color:${TEXT_DIM};">${item.source}</td>
          ${item.ticker ? `<td style="padding-left:7px;"><span style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.22);color:#a5b4fc;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;">${item.ticker}</span></td>` : ''}
          <td style="padding-left:7px;"><span style="background:${impBg};border:1px solid ${impBdr};color:${impTxt};border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;">${impLbl}</span></td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>`;
  }).join('');

  // ── Makrolage ────────────────────────────────────────────────────────────────
  const macroContent = macroNews.length === 0 ? '' : macroNews.map((news, i) => {
    const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
    return `
  <tr><td style="${border}padding:8px 0;">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:16px;vertical-align:top;padding-top:3px;">
        <span style="display:inline-block;width:6px;height:6px;background:${LABEL_CLR};border-radius:50%;"></span>
      </td>
      <td style="padding-left:8px;font-size:13px;color:#cbd5e1;line-height:1.5;">${news}</td>
    </tr></table>
  </td></tr>`;
  }).join('');

  return `${emailHead('Moneta – Tagesabschluss')}
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:24px 16px 48px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

  ${emailHeader(dateLabel)}

  <!-- ─ PERFORMANCE CARD ─ -->
  <tr><td style="background:${HERO_BG};border:1px solid ${CARD_BDR};border-radius:20px;padding:24px 24px 20px;">
    <p style="margin:0 0 3px;font-size:10px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Tagesabschluss</p>
    <p style="margin:0 0 18px;font-size:14px;color:${TEXT_SEC};line-height:1.5;">${userName ? `Hallo ${userName},` : 'Hallo,'} hier ist dein heutiger Depotstand.</p>
    ${twoColumnCards(leftCard, rightCard)}
    ${holdingsTable}
  </td></tr>

  ${stockNews.length > 0 ? `${spacer()}
  <!-- ─ AKTIEN-NEWS ─ -->
  ${sectionCard('Aktien-News', `<table width="100%" cellpadding="0" cellspacing="0" border="0">${newsContent}</table>`)}` : ''}

  ${macroNews.length > 0 ? `${spacer()}
  <!-- ─ MARKTLAGE ─ -->
  ${sectionCard('Marktlage', `<table width="100%" cellpadding="0" cellspacing="0" border="0">${macroContent}</table>`)}` : ''}

  ${emailCta(ctaUrl, 'Depot öffnen →')}

  ${emailFooter('Du erhältst diese Mail, weil du den täglichen Depot-Überblick aktiviert hast.<br>Zum Abmelden deaktiviere den Toggle in deinen Einstellungen.')}

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── buildDigestHtml (Wochenbericht) ───────────────────────────────────────────

export function buildDigestHtml(options: {
  userName?: string;
  summary?: string;
  highlights?: string[];
  ctaUrl?: string;
  totalValue?: number;
  weeklyChange?: number;
  weeklyChangePercent?: number;
  upcomingEarnings?: { ticker: string; company: string; date: string; timeOfDay?: string; quarter?: string }[];
  upcomingDividends?: { symbol: string; company: string; exDate: string; dps: number; yieldPct?: number }[];
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
    upcomingDividends = [],
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

  // ── Earnings ─────────────────────────────────────────────────────────────────
  const earningsContent = upcomingEarnings.length === 0 ? '' : upcomingEarnings.map((e, i) => {
    const d = new Date(e.date + 'T12:00:00');
    const dayLabel = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeIcon = e.timeOfDay === 'vor Marktöffnung' ? '🌅' : e.timeOfDay === 'nach Marktschluss' ? '🌙' : '📅';
    const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
    return `
  <tr><td style="${border}padding:9px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:22px;font-size:15px;vertical-align:middle;">${timeIcon}</td>
      <td style="padding-left:9px;vertical-align:middle;">
        <p style="margin:0 0 1px;font-size:13px;font-weight:700;color:${TEXT_PRI};">${e.company}</p>
        <p style="margin:0;font-size:11px;color:${TEXT_DIM};">${e.ticker}${e.quarter ? ` · ${e.quarter}` : ''}${e.timeOfDay ? ` · ${e.timeOfDay}` : ''}</p>
      </td>
      <td align="right" style="vertical-align:middle;white-space:nowrap;">
        <span style="font-size:12px;font-weight:600;color:#a5b4fc;">${dayLabel}</span>
      </td>
    </tr></table>
  </td></tr>`;
  }).join('');

  // ── Dividenden ───────────────────────────────────────────────────────────────
  const dividendsContent = upcomingDividends.length === 0 ? '' : upcomingDividends.map((d, i) => {
    const dt = new Date(d.exDate + 'T12:00:00');
    const dayLabel = dt.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    const border = i > 0 ? `border-top:1px solid ${ROW_DIV};` : '';
    return `
  <tr><td style="${border}padding:9px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:22px;font-size:15px;vertical-align:middle;">💰</td>
      <td style="padding-left:9px;vertical-align:middle;">
        <p style="margin:0 0 1px;font-size:13px;font-weight:700;color:${TEXT_PRI};">${d.company}</p>
        <p style="margin:0;font-size:11px;color:${TEXT_DIM};">${d.symbol}${d.yieldPct ? ` · ${d.yieldPct.toFixed(1)} % Rendite` : ''}</p>
      </td>
      <td align="right" style="vertical-align:middle;white-space:nowrap;">
        <p style="margin:0;font-size:12px;font-weight:600;color:#a5b4fc;">Ex: ${dayLabel}</p>
        <p style="margin:2px 0 0;font-size:12px;font-weight:700;color:${GREEN_TXT};">+${d.dps.toFixed(2)} € / Aktie</p>
      </td>
    </tr></table>
  </td></tr>`;
  }).join('');

  // ── Evenements zusammenführen ─────────────────────────────────────────────────
  const hasEvents = upcomingEarnings.length > 0 || upcomingDividends.length > 0;
  const eventsContent = !hasEvents ? '' : `
    ${upcomingEarnings.length > 0 ? `
    <p style="margin:0 0 10px;font-size:10px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Earnings</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">${earningsContent}</table>` : ''}
    ${upcomingEarnings.length > 0 && upcomingDividends.length > 0
      ? `<div style="height:1px;background:${CARD_BDR};margin:12px 0;"></div>` : ''}
    ${upcomingDividends.length > 0 ? `
    <p style="margin:0 0 10px;font-size:10px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Dividenden</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">${dividendsContent}</table>` : ''}`;

  return `${emailHead('Moneta – KI-Wochenbericht')}
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:24px 16px 48px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

  ${emailHeader(weekLabel)}

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

  ${highlights.length > 0 ? `${spacer()}
  <!-- ─ HIGHLIGHTS ─ -->
  ${sectionCard('KI-Highlights der Woche',
    `<table width="100%" cellpadding="0" cellspacing="0" border="0">${highlightContent}</table>`
  )}` : ''}

  ${hasEvents ? `${spacer()}
  <!-- ─ KOMMENDE EREIGNISSE ─ -->
  ${sectionCard('Kommende Ereignisse', eventsContent)}` : ''}

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
