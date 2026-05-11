/**
 * useSubscription – React Hook für Premium-Plan-Prüfung.
 *
 * Liest die `subscriptions`-Tabelle in Supabase für den eingeloggten User.
 * Gibt isPremium / isPro zurück, die in der UI für Feature-Gates genutzt werden.
 *
 * FREE:    bis 5 Holdings, 3 KI-Analysen/Monat, 1 CSV-Import
 * PREMIUM: unbegrenzt, Steuer-Optimizer, Performance-Chart, Alerts (4,99€/Monat)
 * PRO:     alles + Steuer-PDF-Export, API-Zugang (12€/Monat)
 */

import { useState, useEffect } from 'react';
import { getSupabaseBrowser } from './supabaseBrowser';

export type SubscriptionPlan = 'free' | 'premium' | 'pro';

export interface SubscriptionState {
  plan: SubscriptionPlan;
  isPremium: boolean;    // premium OR pro
  isPro: boolean;        // nur pro
  isLoading: boolean;
  validUntil: Date | null;
}

const FREE_STATE: SubscriptionState = {
  plan: 'free',
  isPremium: false,
  isPro: false,
  isLoading: false,
  validUntil: null,
};

export function useSubscription(userId: string | null | undefined): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>({ ...FREE_STATE, isLoading: true });

  useEffect(() => {
    if (!userId) {
      setState(FREE_STATE);
      return;
    }

    const sb = getSupabaseBrowser();
    if (!sb) {
      setState(FREE_STATE);
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true }));

    (async () => {
      try {
        const { data } = await sb
          .from('subscriptions')
          .select('plan, valid_until')
          .eq('user_id', userId)
          .maybeSingle();

        if (!data) {
          setState(FREE_STATE);
          return;
        }
        const validUntil = data.valid_until ? new Date(data.valid_until) : null;
        const isValid = !validUntil || validUntil > new Date();
        const plan = (isValid ? data.plan : 'free') as SubscriptionPlan;
        setState({
          plan,
          isPremium: plan === 'premium' || plan === 'pro',
          isPro: plan === 'pro',
          isLoading: false,
          validUntil,
        });
      } catch {
        setState(FREE_STATE);
      }
    })();
  }, [userId]);

  return state;
}

// ── Freemium-Limits ───────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free: {
    maxHoldings:          5,
    maxScenarioHoldings:  5,    // Max Positionen in der Szenario-Analyse
    maxEarningsHoldings:  5,    // Max Portfolio-Positionen im Earnings-Kalender
    maxAnalysisHoldings:  10,   // Max Positionen die an KI-Analysen übergeben werden
    analysesPerMonth:     3,
    csvImports:           1,
    performanceDays:      7,   // Tage Historie im Performance-Chart
    alerts:               0,
  },
  premium: {
    maxHoldings:          Infinity,
    maxScenarioHoldings:  Infinity,
    maxEarningsHoldings:  Infinity,
    maxAnalysisHoldings:  Infinity,
    analysesPerMonth:     Infinity,
    csvImports:           Infinity,
    performanceDays:      365,
    alerts:               20,
  },
  pro: {
    maxHoldings:          Infinity,
    maxScenarioHoldings:  Infinity,
    maxEarningsHoldings:  Infinity,
    maxAnalysisHoldings:  Infinity,
    analysesPerMonth:     Infinity,
    csvImports:           Infinity,
    performanceDays:      Infinity,
    alerts:               Infinity,
  },
} as const;
