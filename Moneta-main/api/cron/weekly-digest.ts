import { createClient } from '@supabase/supabase-js';
import { getSubscribersForDigest } from '../../lib/subscribers.js';
import { buildDigestHtml, sendEmail, getResendClient } from '../../lib/email.js';
import type { WeeklyDividend } from '../../lib/email.js';

const SUPABASE_URL     = process.env.MONETA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE = process.env.MONETA_SUPABASE_SERVICE_ROLE_KEY ?? '';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron (Montag 08:00 UTC).
 * Sendet personalisierten KI-Wochenbericht mit Depot-Performance an alle
 * Abonnenten mit preferences.weeklyReport = true.
 *
 * Auth: CRON_SECRET via Authorization: Bearer <secret>
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const auth   = req.headers?.authorization;
  const token  = auth?.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!secret || secret.length < 16) {
    return res.status(503).json({ error: 'CRON_SECRET nicht konfiguriert (min. 16 Zeichen)' });
  }
  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!getResendClient()) {
    console.error('[cron/weekly-digest] RESEND_API_KEY fehlt – Versand abgebrochen.');
    return res.status(503).json({ error: 'RESEND_API_KEY nicht konfiguriert.' });
  }

  try {
    const subscribers = await getSubscribersForDigest();
    console.log(`[cron/weekly-digest] ${subscribers.length} Abonnent(en) mit weeklyReport=true.`);

    if (subscribers.length === 0) {
      console.log('[cron/weekly-digest] Kein Versand – keine Abonnenten.');
      return res.status(200).json({ ok: true, message: 'Keine Abonnenten.', sent: 0 });
    }

    // ── Snapshot + Earnings + Dividenden laden ────────────────────────────────
    let prevByUser = new Map<string, number>();
    let currByUser = new Map<string, number>();
    const symbolsByUser       = new Map<string, string[]>();
    // userId::symbol → shares (für Dividenden-Berechnung)
    const sharesByUserSymbol  = new Map<string, number>();
    // symbol → Firmenname (aus ticker_mapping)
    const nameBySymbol        = new Map<string, string>();
    // Earnings
    const earningsBySymbol     = new Map<string, { ticker: string; company: string; date: string; timeOfDay?: string; quarter?: string; epsEstimate?: string }>();
    const pastEarningsBySymbol = new Map<string, { ticker: string; company: string; date: string; timeOfDay?: string; quarter?: string; epsEstimate?: string }>();
    // Dividenden (symbol → Eintrag)
    const upcomingDivBySymbol  = new Map<string, WeeklyDividend>();
    const pastDivBySymbol      = new Map<string, WeeklyDividend>();

    if (SUPABASE_URL && SUPABASE_SERVICE) {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = nextWeek.toISOString().slice(0, 10);

      const userIds = subscribers.map((s) => s.userId);

      // Heutiger Snapshot
      const { data: currRows } = await sb
        .from('portfolio_snapshots')
        .select('user_id, total_value')
        .in('user_id', userIds)
        .eq('snapshot_date', today) as any;

      // Snapshot von vor 7 Tagen
      const { data: prevRows } = await sb
        .from('portfolio_snapshots')
        .select('user_id, total_value')
        .in('user_id', userIds)
        .eq('snapshot_date', weekAgoStr) as any;

      currByUser = new Map((currRows ?? []).map((r: any) => [r.user_id, r.total_value]));
      prevByUser = new Map((prevRows ?? []).map((r: any) => [r.user_id, r.total_value]));

      // Holdings pro User (inkl. shares für Dividenden)
      const { data: holdingsData } = await sb
        .from('holdings')
        .select('user_id, symbol, shares')
        .in('user_id', userIds)
        .not('shares', 'is', null) as any;

      for (const h of (holdingsData ?? [])) {
        const arr = symbolsByUser.get(h.user_id) ?? [];
        if (!arr.includes(h.symbol)) arr.push(h.symbol);
        symbolsByUser.set(h.user_id, arr);
        if (h.shares > 0) sharesByUserSymbol.set(`${h.user_id}::${h.symbol}`, h.shares);
      }

      const allSymbols = [...new Set((holdingsData ?? []).map((h: any) => h.symbol))] as string[];

      // Firmennamen aus ticker_mapping laden
      if (allSymbols.length > 0) {
        const { data: tickerRows } = await sb
          .from('ticker_mapping')
          .select('symbol, company_name')
          .in('symbol', allSymbols) as any;
        for (const t of (tickerRows ?? [])) nameBySymbol.set(t.symbol, t.company_name);
      }

      if (allSymbols.length > 0) {
        // Earnings der nächsten 7 Tage aus earnings_cache
        const { data: upcomingRows } = await sb
          .from('earnings_cache')
          .select('symbol, event_date, quarter, company, eps_estimate, time_of_day')
          .gte('event_date', today)
          .lte('event_date', nextWeekStr)
          .in('symbol', allSymbols) as any;

        for (const row of (upcomingRows ?? [])) {
          earningsBySymbol.set(row.symbol, {
            ticker:    row.symbol,
            company:   row.company ?? row.symbol,
            date:      row.event_date,
            timeOfDay: row.time_of_day,
            quarter:   row.quarter ?? undefined,
            epsEstimate: row.eps_estimate ?? undefined,
          });
        }

        // Earnings der vergangenen 7 Tage aus earnings_cache
        const { data: pastRows } = await sb
          .from('earnings_cache')
          .select('symbol, event_date, quarter, company, eps_estimate, time_of_day')
          .gte('event_date', weekAgoStr)
          .lt('event_date', today)
          .in('symbol', allSymbols) as any;

        for (const row of (pastRows ?? [])) {
          pastEarningsBySymbol.set(row.symbol, {
            ticker:      row.symbol,
            company:     row.company ?? nameBySymbol.get(row.symbol) ?? row.symbol,
            date:        row.event_date,
            timeOfDay:   row.time_of_day,
            quarter:     row.quarter ?? undefined,
            epsEstimate: row.eps_estimate ?? undefined,
          });
        }

        // Dividenden aus dividend_cache: vergangene + nächste Woche
        const { data: divRows } = await sb
          .from('dividend_cache')
          .select('symbol, dividend_per_share, ex_dividend_date, dividend_yield')
          .in('symbol', allSymbols)
          .not('no_data', 'is', true)
          .gte('ex_dividend_date', weekAgoStr)
          .lte('ex_dividend_date', nextWeekStr) as any;

        for (const row of (divRows ?? [])) {
          if (!row.ex_dividend_date || !row.dividend_per_share) continue;
          const entry: Omit<WeeklyDividend, 'shares' | 'annualIncome'> = {
            symbol:   row.symbol,
            company:  nameBySymbol.get(row.symbol) ?? row.symbol,
            exDate:   row.ex_dividend_date,
            dps:      Number(row.dividend_per_share),
            yieldPct: row.dividend_yield ? Number(row.dividend_yield) : undefined,
          };
          if (row.ex_dividend_date < today) {
            pastDivBySymbol.set(row.symbol, entry as WeeklyDividend);
          } else {
            upcomingDivBySymbol.set(row.symbol, entry as WeeklyDividend);
          }
        }
      }
    }

    // ── Personalisierte E-Mails senden ────────────────────────────────────────
    const ctaUrl = process.env.APP_URL ?? 'https://moneta-invest.de';
    const subject = 'Dein KI-Wochenbericht – Moneta';
    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < subscribers.length; i++) {
      const sub = subscribers[i];

      const totalValue     = currByUser.get(sub.userId);
      const prevValue      = prevByUser.get(sub.userId);
      const weeklyChange   = (totalValue !== undefined && prevValue !== undefined)
        ? totalValue - prevValue : undefined;
      const weeklyChangePct = (weeklyChange !== undefined && prevValue && prevValue > 0)
        ? (weeklyChange / prevValue) * 100 : undefined;

      // Earnings der nächsten 7 Tage für diesen User
      const userSymbols = symbolsByUser.get(sub.userId) ?? [];
      const upcomingEarnings = userSymbols
        .filter((s) => earningsBySymbol.has(s))
        .map((s) => earningsBySymbol.get(s)!)
        .sort((a, b) => a.date.localeCompare(b.date));

      // Earnings der vergangenen 7 Tage für diesen User
      const pastEarnings = userSymbols
        .filter((s) => pastEarningsBySymbol.has(s))
        .map((s) => pastEarningsBySymbol.get(s)!)
        .sort((a, b) => a.date.localeCompare(b.date));

      // Dividenden für diesen User – Stückzahl + Jahreseinkommen anreichern
      function enrichDividends(map: Map<string, WeeklyDividend>): WeeklyDividend[] {
        return userSymbols
          .filter((s) => map.has(s))
          .map((s) => {
            const base   = map.get(s)!;
            const shares = sharesByUserSymbol.get(`${sub.userId}::${s}`);
            return {
              ...base,
              shares,
              annualIncome: shares != null ? shares * base.dps : undefined,
            };
          })
          .sort((a, b) => a.exDate.localeCompare(b.exDate));
      }

      const upcomingDividends = enrichDividends(upcomingDivBySymbol);
      const pastDividends     = enrichDividends(pastDivBySymbol);

      const highlights = [
        'KI-gestützte Szenario-Analyse für dein Depot verfügbar',
        'Earnings-Kalender: alle Quartalszahlen auf einen Blick',
        'Täglicher Depot-Überblick per E-Mail aktivierbar',
      ];

      const html = buildDigestHtml({
        userName:            sub.name,
        summary:             'hier ist deine wöchentliche Depot-Zusammenfassung.',
        highlights,
        ctaUrl,
        totalValue,
        weeklyChange,
        weeklyChangePercent: weeklyChangePct,
        upcomingEarnings:    upcomingEarnings.length > 0 ? upcomingEarnings : undefined,
        pastEarnings:        pastEarnings.length > 0 ? pastEarnings : undefined,
        upcomingDividends:   upcomingDividends.length > 0 ? upcomingDividends : undefined,
        pastDividends:       pastDividends.length > 0 ? pastDividends : undefined,
      });

      console.log(`[cron/weekly-digest] Sende an ${sub.email} (${i + 1}/${subscribers.length})…`);
      const result = await sendEmail({ to: sub.email, subject, html });

      if (result.success) {
        sent++;
        console.log(`[cron/weekly-digest] ✓ ${sub.email} (id: ${result.id})`);
      } else {
        failed++;
        const msg = `${sub.email}: ${result.error}`;
        errors.push(msg);
        console.error(`[cron/weekly-digest] ✗ ${msg}`);
      }

      if (i < subscribers.length - 1) await sleep(600);
    }

    console.log(`[cron/weekly-digest] Ergebnis: ${sent} versendet, ${failed} Fehler.`);
    errors.forEach((e) => console.error('[cron/weekly-digest] Versandfehler:', e));

    return res.status(200).json({
      ok: true, sent, failed,
      errors: errors.length ? errors : undefined,
    });

  } catch (e: any) {
    console.error('[cron/weekly-digest] Unerwarteter Fehler:', e?.message || e);
    return res.status(500).json({ error: 'Fehler beim Versand des Wochenberichts' });
  }
}
