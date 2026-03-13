import { Resend } from 'resend';
import type { NewsletterSubscriber } from './subscribers.js';

/**
 * Absender-Adresse.
 * Beispiel in Vercel: EMAIL_FROM="Moneta <newsletter@moneta-invest.de>"
 */
const FROM_EMAIL =
  process.env.EMAIL_FROM ??
  process.env.FROM_EMAIL ??
  'Moneta <onboarding@resend.dev>';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Lazy-Init: verhindert "new Resend(undefined)" beim Laden ohne API-Key.
let _resend: Resend | null = null;

export function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY nicht gesetzt – E-Mail-Versand nicht verfügbar.');
    return null;
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Sendet eine einzelne E-Mail über Resend.
 * Bei Rate-Limit (429) wird einmalig 2 s gewartet und erneut versucht.
 */
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

// ── Shared design tokens (inline CSS, email-safe) ─────────────────────────────

const BG        = '#070d1a';
const CARD_BG   = 'linear-gradient(135deg,#0f1b38 0%,#1e1040 100%)';
const CARD_BDR  = '#1e2d4a';
const ACCENT    = '#6366f1';
const ACCENT2   = '#8b5cf6';
const TEXT_PRI  = '#f1f5f9';
const TEXT_SEC  = '#94a3b8';
const TEXT_MUT  = '#334155';
const TEXT_FADE = '#475569';
const LABEL_CLR = '#818cf8';

const GREEN_BG  = '#052e16';
const GREEN_BDR = '#166534';
const GREEN_TXT = '#22c55e';
const RED_BG    = '#450a0a';
const RED_BDR   = '#991b1b';
const RED_TXT   = '#ef4444';

function emailHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${title}</title>
</head>`;
}

function emailHeader(rightLabel: string): string {
  return `
  <!-- ─ HEADER ─ -->
  <tr><td style="padding-bottom:28px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td>
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:38px;height:38px;background:linear-gradient(135deg,${ACCENT},${ACCENT2});border-radius:11px;text-align:center;vertical-align:middle;font-size:19px;line-height:1;">📈</td>
          <td style="padding-left:10px;font-size:21px;font-weight:800;color:${TEXT_PRI};letter-spacing:-0.03em;">Moneta</td>
        </tr></table>
      </td>
      <td align="right" style="font-size:11px;color:${TEXT_FADE};font-weight:500;">${rightLabel}</td>
    </tr></table>
  </td></tr>`;
}

function emailCta(href: string, label: string): string {
  return `
  <!-- ─ CTA ─ -->
  <tr><td align="center" style="padding:20px 0 36px;">
    <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,${ACCENT},${ACCENT2});color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 40px;border-radius:14px;letter-spacing:0.02em;">${label}</a>
  </td></tr>`;
}

function emailFooter(unsubscribeHint: string): string {
  return `
  <!-- ─ FOOTER ─ -->
  <tr><td style="border-top:1px solid ${CARD_BDR};padding-top:20px;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${ACCENT};letter-spacing:0.02em;">Moneta – Investieren mit Durchblick.</p>
    <p style="margin:0;font-size:11px;color:${TEXT_MUT};line-height:1.75;">${unsubscribeHint}</p>
  </td></tr>`;
}

function valueCard(label: string, value: string, sub?: string,
                   bg = 'rgba(255,255,255,0.05)', border = 'rgba(255,255,255,0.09)',
                   labelColor = '#64748b', valueColor = TEXT_PRI): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${bg};border:1px solid ${border};border-radius:16px;padding:20px;">
    <tr><td>
      <p style="margin:0 0 8px;font-size:10px;color:${labelColor};font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">${label}</p>
      <p style="margin:0 0 ${sub ? '5px' : '0'};font-size:26px;font-weight:800;color:${valueColor};letter-spacing:-0.02em;">${value}</p>
      ${sub ? `<p style="margin:0;font-size:14px;color:${valueColor};opacity:0.75;">${sub}</p>` : ''}
    </td></tr>
  </table>`;
}

function twoColumnCards(left: string, right: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
    <tr>
      <td width="48%" style="vertical-align:top;">${left}</td>
      <td width="4%">&nbsp;</td>
      <td width="48%" style="vertical-align:top;">${right}</td>
    </tr>
  </table>`;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
}

// ── buildDailySnapshotHtml ────────────────────────────────────────────────────

export function buildDailySnapshotHtml(options: {
  userName?: string;
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  ctaUrl?: string;
  dateLabel?: string;
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
  } = options;

  const pos   = dailyChange >= 0;
  const sign  = pos ? '+' : '';
  const arrow = pos ? '▲' : '▼';
  const chBg  = pos ? GREEN_BG  : RED_BG;
  const chBdr = pos ? GREEN_BDR : RED_BDR;
  const chTxt = pos ? GREEN_TXT : RED_TXT;

  const leftCard  = valueCard('Depotwert', fmtEur(totalValue));
  const rightCard = valueCard(
    `Heute ${arrow}`,
    `${sign}${fmtEur(dailyChange)}`,
    `${sign}${dailyChangePercent.toFixed(2)} %`,
    chBg, chBdr, chTxt, chTxt,
  );

  return `${emailHead('Moneta – Tagesabschluss')}
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:28px 16px 52px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

  ${emailHeader(dateLabel)}

  <!-- ─ HERO CARD ─ -->
  <tr><td style="background:${CARD_BG};border:1px solid ${CARD_BDR};border-radius:24px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Tagesabschluss</p>
    <p style="margin:0 0 28px;font-size:16px;color:${TEXT_SEC};line-height:1.55;">${userName ? `Hallo ${userName},` : 'Hallo,'} hier ist dein heutiger Depotstand.</p>
    ${twoColumnCards(leftCard, rightCard)}
  </td></tr>

  <tr><td style="height:12px;">&nbsp;</td></tr>

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
  /** Portfolio-Daten für personalisierte Darstellung (optional) */
  totalValue?: number;
  weeklyChange?: number;
  weeklyChangePercent?: number;
}): string {
  const {
    userName,
    summary = 'Dein wöchentlicher KI-Depot-Überblick.',
    highlights = [],
    ctaUrl = 'https://moneta-invest.de',
    totalValue,
    weeklyChange,
    weeklyChangePercent,
  } = options;

  const now      = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const fmtD = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const weekLabel = `${fmtD(weekStart)} – ${fmtD(weekEnd)}, ${now.getFullYear()}`;

  // Portfolio change section
  let portfolioSection = '';
  if (totalValue !== undefined && weeklyChange !== undefined && weeklyChangePercent !== undefined) {
    const pos   = weeklyChange >= 0;
    const sign  = pos ? '+' : '';
    const arrow = pos ? '▲' : '▼';
    const chBg  = pos ? GREEN_BG  : RED_BG;
    const chBdr = pos ? GREEN_BDR : RED_BDR;
    const chTxt = pos ? GREEN_TXT : RED_TXT;

    portfolioSection = twoColumnCards(
      valueCard('Depotwert', fmtEur(totalValue)),
      valueCard(`Diese Woche ${arrow}`, `${sign}${fmtEur(weeklyChange)}`, `${sign}${weeklyChangePercent.toFixed(2)} %`,
        chBg, chBdr, chTxt, chTxt),
    );
  }

  // Highlights list
  const highlightRows = highlights.map((h) => `
    <tr><td style="padding:11px 0;border-bottom:1px solid ${CARD_BDR};">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:26px;vertical-align:top;padding-right:12px;padding-top:1px;">
          <div style="width:22px;height:22px;background:linear-gradient(135deg,${ACCENT},${ACCENT2});border-radius:7px;text-align:center;line-height:22px;font-size:12px;color:white;">✓</div>
        </td>
        <td style="font-size:14px;color:#cbd5e1;line-height:1.55;">${h}</td>
      </tr></table>
    </td></tr>`).join('');

  return `${emailHead('Moneta – KI-Wochenbericht')}
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
<tr><td align="center" style="padding:28px 16px 52px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

  ${emailHeader(weekLabel)}

  <!-- ─ HERO CARD ─ -->
  <tr><td style="background:${CARD_BG};border:1px solid ${CARD_BDR};border-radius:24px;padding:32px;">
    <p style="margin:0 0 4px;font-size:11px;color:${LABEL_CLR};font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">KI-Wochenbericht</p>
    <p style="margin:0 0 ${portfolioSection || highlights.length ? '24px' : '0'};font-size:16px;color:${TEXT_SEC};line-height:1.55;">${userName ? `Hallo ${userName},` : 'Hallo,'} ${summary}</p>

    ${portfolioSection}

    ${highlights.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${CARD_BDR};">
      ${highlightRows}
    </table>` : ''}
  </td></tr>

  <tr><td style="height:12px;">&nbsp;</td></tr>

  ${emailCta(ctaUrl, 'Wochenbericht öffnen →')}

  ${emailFooter('Du erhältst diese Mail, weil du den KI-Wochenbericht aktiviert hast.<br>Zum Abmelden deaktiviere den Toggle in deinen Einstellungen.')}

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── sendDigestToSubscribers ───────────────────────────────────────────────────
// Sendet eine E-Mail an jeden Abonnenten – sequenziell mit 600 ms Pause.

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
