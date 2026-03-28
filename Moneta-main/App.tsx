
import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Logo from './components/atoms/Logo';
import DashboardSummary from './components/DashboardSummary';
import Assistant from './components/Assistant';
import EmptyState from './components/EmptyState';
import Discover from './components/Discover';
import Settings from './components/Settings';
import PortfolioDeepDive from './components/PortfolioDeepDive';
import MarketNewsTicker from './components/MarketNewsTicker';
import Legal from './components/Legal';
import AuthModal from './components/AuthModal';
import PortfolioInput from './components/PortfolioInput';
import EarningsCalendar from './components/EarningsCalendar';
import ScenarioAnalysis from './components/ScenarioAnalysis';
import TaxOptimizer from './components/TaxOptimizer';
import OptionsTracker from './components/OptionsTracker';
import NewsletterQuickToggle from './components/NewsletterQuickToggle';
import PerformanceChart from './components/PerformanceChart';
import UpgradeModal from './components/UpgradeModal';
import { PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport, UserAccount, HoldingRow } from './types';
import { analyzePortfolio, generateHoldingTheses } from './services/geminiService';
import { userService } from './services/userService';
import { getSupabaseBrowser } from './lib/supabaseBrowser';
import { loadUserHoldings, addTickersByName, deleteHolding } from './services/holdingsService';
import { useSubscription, PLAN_LIMITS } from './lib/useSubscription';
import { AlertTriangle, ShieldCheck, BarChart3, Loader2, Calendar, FlaskConical, Lock, Plus, X, Trash2, ChevronRight, ChevronDown, Sparkles, TrendingUp, TrendingDown, Minus, Zap, RefreshCcw } from 'lucide-react';

/** Erstellt ein UserAccount-Objekt aus einem Supabase-User */
function userFromSupabase(sbUser: any): UserAccount {
  return {
    id:         sbUser.id,
    email:      sbUser.email ?? '',
    name:       sbUser.user_metadata?.full_name
                ?? sbUser.user_metadata?.name
                ?? sbUser.email?.split('@')[0]
                ?? 'Nutzer',
    isLoggedIn: true,
    settings:   { autoNewsletter: false, weeklyDigest: false, cloudSync: true },
  };
}

type NewsItem = PortfolioAnalysisReport['news'] extends (infer T)[] ? T : never;

const App: React.FC = () => {
  const [activeView, setActiveView] = useState('cockpit');
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [analysisReport, setAnalysisReport] = useState<PortfolioAnalysisReport | null>(null);
  const [healthReport, setHealthReport] = useState<PortfolioHealthReport | null>(null);
  const [savingsReport, setSavingsReport] = useState<PortfolioSavingsReport | null>(null);
  const [selectedNewsFromTicker, setSelectedNewsFromTicker] = useState<NewsItem | null>(null);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const subscription = useSubscription(userAccount?.id);
  const [assistantSeed, setAssistantSeed] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean, type: 'impressum' | 'disclaimer' | 'privacy' }>({
    isOpen: false,
    type: 'disclaimer'
  });
  const [showDepotDrawer, setShowDepotDrawer] = useState(false);

  // ── KI-Einschätzungen je Position (in Portfolio-Tabelle) ─────────────────
  const [theses,       setTheses]       = useState<{ ticker: string; thesis: string }[]>([]);
  const [thesesLoading, setThesesLoading] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null);

  // ── Cockpit-Import (Screenshot / Excel – für EmptyState-Buttons) ──────────
  const [cockpitImportState, setCockpitImportState] = useState<{ loading: boolean; message: string; error: string }>({
    loading: false, message: '', error: '',
  });

  /** Lädt Holdings des Nutzers aus Supabase und speichert sie im State.
   *  Nutzt den zentralen holdingsService – einzige Quelle für Holdings-Daten. */
  const loadHoldingsForUser = useCallback(async (uid: string) => {
    if (!uid) return;
    const rows = await loadUserHoldings(uid);
    setHoldings(rows);
  }, []);

  /** Lädt Holdings aus Supabase und aktualisiert den zentralen State (Single Source of Truth).
   *  Wird nach jedem Add/Delete/Import sowie vom Supabase-Realtime-Channel aufgerufen. */
  const fetchHoldings = useCallback(async () => {
    if (userAccount?.id) await loadHoldingsForUser(userAccount.id);
  }, [userAccount?.id, loadHoldingsForUser]);

  /**
   * Holt den aktuellen Anzeigenamen aus der profiles-Tabelle und synchronisiert
   * ihn in den globalen displayName-State (Header-Avatar + Begrüßung).
   * Kann mit einer userId aufgerufen werden, bevor userAccount-State gesetzt ist.
   */
  const refreshProfile = useCallback(async (userId?: string) => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const uid = userId ?? userAccount?.id;
    if (!uid) return;
    const { data } = await sb
      .from('profiles')
      .select('full_name')
      .eq('id', uid)
      .single() as unknown as { data: { full_name: string | null } | null };
    if (data?.full_name) setDisplayName(data.full_name);
  }, [userAccount?.id]);

  /** Baut den Depot-Text für die KI-Analyse aus den aktuellen Holdings auf */
  const buildDepotTextFromHoldings = useCallback((holds: HoldingRow[]): string => {
    if (holds.length === 0) return '';
    const lines = holds.map((h, i) => {
      const t = h.ticker;
      const displayName = t?.company_name ?? h.name ?? h.symbol;
      const pos = h.watchlist
        ? 'Watchlist'
        : `${h.shares} Stück | Kaufpreis: ${h.buy_price?.toFixed(2)} €`;
      const meta = t ? [
        t.sector      ? `Sektor: ${t.sector}`           : null,
        t.industry    ? `Industrie: ${t.industry}`       : null,
        t.competitors ? `Wettbewerber: ${t.competitors}` : null,
        t.pe_ratio_static != null ? `KGV: ${t.pe_ratio_static}` : null,
      ].filter(Boolean).join(' | ') : '';
      const desc = t?.description_static
        ? `\n   Beschreibung: ${t.description_static}`
        : '';
      const notesLine = h.notes ? `\n   Investment-These: ${h.notes}` : '';
      return `${i + 1}. ${displayName} (${h.symbol}) | ${pos}${meta ? ` | ${meta}` : ''}${desc}${notesLine}`;
    });
    return [
      'Depot-Analyse:',
      '',
      ...lines,
      '',
      'Bitte analysiere dieses Depot vollständig gemäß den Systemvorgaben.',
    ].join('\n');
  }, []);

  /** Bild via Canvas auf max. 1024 px verkleinern (Browser-seitig) */
  const resizeImageInApp = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas nicht verfügbar')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve({ base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
      img.src = url;
    });

  /** Tickers (Namen/Symbole) → Gemini → ticker_mapping → holdings.
   *  Nutzt den zentralen holdingsService für zuverlässige DB-Operationen. */
  const bulkAddTickersInCockpit = useCallback(async (names: string[]): Promise<number> => {
    const uid = userAccount?.id;
    if (!uid || names.length === 0) throw new Error('Nicht eingeloggt');

    const { count, error } = await addTickersByName(names, uid);
    if (error) throw new Error(error);

    // Zentralen State sofort aktualisieren
    await loadHoldingsForUser(uid);
    return count;
  }, [userAccount?.id, loadHoldingsForUser]);

  const handleCockpitImageImport = useCallback(async (file: File) => {
    if (!userAccount) { setCockpitImportState({ loading: false, message: '', error: 'Bitte zuerst einloggen.' }); return; }
    setCockpitImportState({ loading: true, message: '', error: '' });
    try {
      const { base64, mimeType } = await resizeImageInApp(file);
      const resp = await fetch('/api/extract-from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      if (!resp.ok) throw new Error('Bild-Analyse fehlgeschlagen');
      const { tickers } = await resp.json();
      if (!tickers?.length) { setCockpitImportState({ loading: false, message: '', error: 'Keine Ticker im Bild erkannt.' }); return; }
      const count = await bulkAddTickersInCockpit(tickers);
      setCockpitImportState({ loading: false, message: `${count} Ticker aus Screenshot importiert.`, error: '' });
    } catch (e: any) {
      setCockpitImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim Import.' });
    }
  }, [userAccount, bulkAddTickersInCockpit]);

  const handleCockpitExcelImport = useCallback(async (file: File) => {
    if (!userAccount) { setCockpitImportState({ loading: false, message: '', error: 'Bitte zuerst einloggen.' }); return; }
    setCockpitImportState({ loading: true, message: '', error: '' });
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) { setCockpitImportState({ loading: false, message: '', error: 'Keine Daten gefunden.' }); return; }

      const lowerHeaders = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
      const matched = lowerHeaders.find(
        (h) => h === 'ticker' || h === 'symbol' || h === 'symbol/ticker' || h === 'isin' || h === 'wkn' || h.includes('ticker') || h.includes('symbol'),
      );
      if (!matched) { setCockpitImportState({ loading: false, message: '', error: 'Keine Spalte "Ticker", "Symbol" oder "ISIN" gefunden.' }); return; }

      const origKey = Object.keys(rows[0]).find((k) => k.trim().toLowerCase() === matched) ?? matched;
      const values = rows.map((r: any) => String(r[origKey] ?? '').trim()).filter((v) => v.length >= 1);
      if (!values.length) { setCockpitImportState({ loading: false, message: '', error: 'Keine Werte in der Spalte.' }); return; }

      const count = await bulkAddTickersInCockpit(values);
      setCockpitImportState({ loading: false, message: `${count} Ticker aus Excel importiert.`, error: '' });
    } catch (e: any) {
      setCockpitImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim Import.' });
    }
  }, [userAccount, bulkAddTickersInCockpit]);

  useEffect(() => {
    const sb = getSupabaseBrowser();

    const applyUser = (account: UserAccount) => {
      setUserAccount(account);
      // Sofortiger Fallback-Name (aus Auth-Metadata), wird dann durch DB-Wert überschrieben
      setDisplayName(account.name);
      setShowAuthModal(false);
      loadHoldingsForUser(account.id);
      // profiles.full_name laden – überschreibt ggf. den Auth-Metadata-Namen
      refreshProfile(account.id);
    };

    if (!sb) return; // Supabase nicht konfiguriert → Login-Aufforderung anzeigen

    // 1. Bestehende Session prüfen (OAuth-Callback, Magic Link, persistierte Session)
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        applyUser(userFromSupabase(session.user));
      }
      // Kein aktiver Login → userAccount bleibt null → Login-Aufforderung sichtbar
    });

    // 2. Auth-State-Änderungen (Login nach Magic Link oder OAuth-Redirect)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        applyUser(userFromSupabase(session.user));
      } else if (event === 'SIGNED_OUT') {
        setUserAccount(null);
        setHoldings([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadHoldingsForUser]);

  // ── Supabase Realtime: Holdings-Änderungen live empfangen ────────────────
  // Reagiert auf INSERT/UPDATE/DELETE in der holdings-Tabelle des eingeloggten Nutzers.
  // Funktioniert auch geräteübergreifend (Cross-Device-Sync).
  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb || !userAccount?.id) return;

    const channel = sb
      .channel(`holdings-realtime-${userAccount.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'holdings',
          filter: `user_id=eq.${userAccount.id}`,
        },
        () => { fetchHoldings(); }
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [userAccount?.id, fetchHoldings]);

  // KI-Einschätzungen laden wenn sich die Portfolio-Positionen ändern
  useEffect(() => {
    const portfolioHoldings = holdings.filter(h => !h.watchlist);
    if (portfolioHoldings.length === 0) { setTheses([]); return; }
    const inputs = portfolioHoldings.map(h => ({
      name:     h.ticker?.company_name ?? h.name ?? h.symbol,
      ticker:   h.symbol,
      shares:   h.shares,
      buyPrice: h.buy_price,
    }));
    setThesesLoading(true);
    generateHoldingTheses(inputs.slice(0, 8))
      .then(setTheses)
      .catch(() => {})
      .finally(() => setThesesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.filter(h => !h.watchlist).map(h => h.symbol).sort().join(',')]);

  const processMasterData = useCallback((masterData: any) => {
    if (!masterData || Object.keys(masterData).length === 0) return;

    const report: PortfolioAnalysisReport = {
      ...masterData,
      score: masterData.score || 0,
      summary: masterData.summary || "",
      holdings: masterData.holdings || [],
      news: masterData.news || [],
      nextSteps: masterData.nextSteps || (masterData.next_step ? [{ action: "Check", description: masterData.next_step }] : []),
    };

    const health: PortfolioHealthReport = {
      health_score: Math.round(masterData.score / 10) || 0,
      status: (masterData.score || 0) > 70 ? "Stabil" : "Optimierbar",
      color: (masterData.score || 0) > 70 ? "emerald" : "blue",
      summary: masterData.summary || "",
      factors: {
        diversification: { score: masterData.health_factors?.div || 0, note: "Streuung" },
        cost_efficiency: { score: masterData.health_factors?.cost || 0, note: "Gebühren" },
        risk_balance: { score: masterData.health_factors?.risk || 0, note: "Risiko" },
        allocation_drift: { score: 8, note: "Balance" }
      },
      top_strength: "Basis-Check durchgeführt",
      top_consideration: "Kostenstruktur prüfen"
    };

    const savings: PortfolioSavingsReport = {
      current_annual_costs: "?", optimized_annual_costs: "?",
      potential_savings: `${masterData.savings || 0}€`,
      savings_percentage: "N/A", breakdown: [],
      explanation: "KI-basierte Schätzung.",
      considerations: ["Handelskosten beachten"]
    };

    setAnalysisReport(report);
    setHealthReport(health);
    setSavingsReport(savings);
    
    const now = new Date().toLocaleTimeString();
    setLastUpdate(now);
    localStorage.setItem('moneta_last_update', now);
    
    if (userAccount) {
      userService.savePortfolio(userAccount.id, report, health, savings);
    }
    setActiveView('cockpit');
  }, [userAccount]);

  const handleAnalysis = async (input: { text?: string, fileBase64?: string }) => {
    setIsGlobalLoading(true);
    try {
      const masterData = await analyzePortfolio(input);
      processMasterData(masterData);
    } catch (error: any) {
      // Anzeige der benutzerfreundlichen deutschen Fehlermeldung
      if (error.message.includes(':')) {
        alert(error.message.split(':')[1]);
      } else {
        alert("Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später noch einmal.");
      }
    } finally {
      setIsGlobalLoading(false);
    }
  };

  /**
   * Wird von PortfolioInput aufgerufen: erhält bereits formatierten Text
   * mit allen Holdings inkl. Sektor, Beschreibung und Wettbewerber-Kontext.
   */
  const handlePortfolioAnalysis = (portfolioText: string) => {
    handleAnalysis({ text: portfolioText });
  };

  const openLegal = (type: 'impressum' | 'disclaimer' | 'privacy') => {
    setLegalModal({ isOpen: true, type });
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900 bg-slate-50/50">
      <Header
        activeView={activeView}
        onViewChange={setActiveView}
        userAccount={userAccount}
        onLoginClick={() => setShowAuthModal(true)}
        displayName={displayName}
      />
      
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 pb-24 lg:pb-10 w-full">
        {activeView === 'cockpit' ? (
          <div className="space-y-5">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Mein Cockpit</h1>
                {lastUpdate && analysisReport && (
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
                    KI-Analyse · {lastUpdate}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {analysisReport && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    analysisReport.score >= 70 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    analysisReport.score >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    <ShieldCheck className="w-3 h-3" />
                    Score {analysisReport.score}/100
                  </div>
                )}
                <button
                  onClick={() => setShowDepotDrawer(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Depot verwalten
                </button>
              </div>
            </div>

            {/* ── Onboarding (leeres Depot) ────────────────────────────────── */}
            {holdings.length === 0 && (
              <div className="bg-gradient-to-br from-emerald-50 to-slate-50 border border-emerald-100 rounded-3xl p-8 text-center">
                <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <BarChart3 className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Depot importieren oder aufbauen</h2>
                <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                  Füge deine ersten Aktien hinzu – per Screenshot, PDF oder manuell.
                </p>
                <button
                  onClick={() => setShowDepotDrawer(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Depot aufbauen
                </button>
              </div>
            )}

            {/* ── KPI-Karten (Score / Diversifikation / Risiko) ─────────────── */}
            {analysisReport && (
              <DashboardSummary
                report={analysisReport}
                healthReport={healthReport}
                savingsReport={savingsReport}
                insight={null}
                holdings={holdings}
              />
            )}

            {/* ── Freemium-Gate ─────────────────────────────────────────────── */}
            {!subscription.isPremium && holdings.length >= PLAN_LIMITS.free.maxHoldings && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-[24px] p-5 flex items-center gap-4">
                <div className="bg-emerald-100 p-3 rounded-2xl shrink-0">
                  <Lock className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900">Limit erreicht: {PLAN_LIMITS.free.maxHoldings} Positionen</p>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                    Mit Premium unbegrenzte Positionen und erweiterte Analysen.
                  </p>
                </div>
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="shrink-0 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap"
                >
                  Upgrade
                </button>
              </div>
            )}

            {/* ── UNIFIED PORTFOLIO TABLE ───────────────────────────────────── */}
            {holdings.length > 0 && (() => {
              const fmt = (n: number, d = 2) =>
                n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

              const sortedHoldings = [...holdings].sort((a, b) => {
                if (a.watchlist !== b.watchlist) return a.watchlist ? 1 : -1;
                if (!a.watchlist) {
                  const valA = (a.shares ?? 0) * (a.buy_price ?? 0);
                  const valB = (b.shares ?? 0) * (b.buy_price ?? 0);
                  return valB - valA;
                }
                return (a.symbol ?? '').localeCompare(b.symbol ?? '');
              });

              const portfolioCount = holdings.filter(h => !h.watchlist).length;
              const watchlistCount = holdings.filter(h => h.watchlist).length;
              const posHoldings = holdings.filter(h => !h.watchlist && h.shares != null && h.buy_price != null);
              const totalInvested = posHoldings.reduce((s, h) => s + h.shares! * h.buy_price!, 0);

              const sentimentCfg = (s?: string) =>
                s === 'Positiv'
                  ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: TrendingUp }
                  : s === 'Negativ'
                  ? { cls: 'bg-rose-50 text-rose-600 border-rose-200', Icon: TrendingDown }
                  : { cls: 'bg-slate-100 text-slate-500 border-slate-200', Icon: Minus };

              return (
                <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm overflow-hidden">

                  {/* Table header */}
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Mein Portfolio</h3>
                      <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                        {portfolioCount} Position{portfolioCount !== 1 ? 'en' : ''}
                        {watchlistCount > 0 && ` · ${watchlistCount} Watchlist`}
                        {totalInvested > 0 && ` · ${fmt(totalInvested)} € investiert`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {thesesLoading && (
                        <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                          <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                          KI analysiert…
                        </span>
                      )}
                      {!analysisReport && portfolioCount > 0 && (
                        <button
                          onClick={() => { const t = buildDepotTextFromHoldings(holdings); if (t) handleAnalysis({ text: t }); }}
                          disabled={isGlobalLoading}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                        >
                          {isGlobalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          KI-Analyse starten
                        </button>
                      )}
                      {analysisReport && (
                        <button
                          onClick={() => { const t = buildDepotTextFromHoldings(holdings); if (t) handleAnalysis({ text: t }); }}
                          disabled={isGlobalLoading}
                          className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-widest transition-colors disabled:opacity-40"
                          title="Analyse aktualisieren"
                        >
                          <RefreshCcw className={`w-3 h-3 ${isGlobalLoading ? 'animate-spin' : ''}`} />
                          Aktualisieren
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Column labels (desktop) */}
                  <div className="hidden md:grid grid-cols-[1fr_110px_90px_90px_32px] gap-3 px-6 py-2.5 bg-slate-50/80 border-b border-slate-100">
                    {['Aktie', 'Sektor', 'Position', 'Perf.', ''].map((h, i) => (
                      <span key={i} className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">{h}</span>
                    ))}
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-slate-100">
                    {sortedHoldings.map((h) => {
                      const sym = h.ticker?.symbol ?? h.symbol;
                      const reportEntry = analysisReport?.holdings?.find(
                        rh => rh.ticker === sym || rh.ticker === h.symbol
                      );
                      const rawPrice = reportEntry?.currentPrice ?? '';
                      const currentPrice = (() => {
                        const cleaned = String(rawPrice).replace(/[€$£\s]/g, '').replace(/[A-Za-z]/g, '').trim();
                        const n = parseFloat(cleaned.replace(',', '.'));
                        return isFinite(n) && n > 0 ? n : null;
                      })();
                      const perfPct = currentPrice && h.buy_price && h.buy_price > 0
                        ? ((currentPrice - h.buy_price) / h.buy_price) * 100 : null;
                      const posValue = h.shares != null && h.buy_price != null ? h.shares * h.buy_price : null;
                      const thesis = theses.find(t => t.ticker === sym || t.ticker === h.symbol);
                      const sentiment = reportEntry?.sentiment;
                      const { cls: sentCls, Icon: SentIcon } = sentimentCfg(sentiment);
                      const newsItems = analysisReport?.news?.filter(
                        n => n.ticker && n.ticker.toUpperCase() === sym?.toUpperCase()
                      ) ?? [];
                      const hasNews = newsItems.length > 0;
                      const isExpanded = expandedHolding === h.id;

                      return (
                        <div key={h.id}>
                          {/* Main row */}
                          <div
                            className={`px-6 py-3.5 cursor-pointer transition-colors ${
                              isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                            }`}
                            onClick={() => setExpandedHolding(isExpanded ? null : h.id)}
                          >
                            <div className="flex items-center gap-3">

                              {/* Avatar */}
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[9px] font-black ${
                                perfPct != null && perfPct > 0 ? 'bg-emerald-100 text-emerald-700' :
                                perfPct != null && perfPct < 0 ? 'bg-rose-100 text-rose-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {sym.slice(0, 3)}
                              </div>

                              {/* Name + meta (flex-1) */}
                              <div className="flex-1 min-w-0">
                                {/* Desktop: grid layout */}
                                <div className="hidden md:grid grid-cols-[1fr_110px_90px_90px_32px] gap-3 items-center">
                                  {/* Col 1: Name */}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-bold text-slate-900 truncate">
                                        {h.ticker?.company_name ?? h.name ?? sym}
                                      </span>
                                      <span className="text-[9px] font-mono text-slate-400 shrink-0">{sym}</span>
                                      {hasNews && (
                                        <span className="flex items-center gap-0.5 text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                                          <Zap className="w-2.5 h-2.5" /> News
                                        </span>
                                      )}
                                      {h.watchlist && (
                                        <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                                          Watchlist
                                        </span>
                                      )}
                                    </div>
                                    {sentiment && (
                                      <span className={`inline-flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded-full border mt-0.5 ${sentCls}`}>
                                        <SentIcon className="w-2.5 h-2.5" />
                                        {sentiment}
                                      </span>
                                    )}
                                  </div>
                                  {/* Col 2: Sektor */}
                                  <div>
                                    {h.ticker?.sector && (
                                      <span className="text-[9px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-medium truncate block">
                                        {h.ticker.sector}
                                      </span>
                                    )}
                                  </div>
                                  {/* Col 3: Position */}
                                  <div className="text-right">
                                    {!h.watchlist && h.shares != null && (
                                      <p className="text-[11px] font-bold text-slate-700 tabular-nums">
                                        {posValue != null ? `${fmt(posValue)} €` : `${h.shares} Stk.`}
                                      </p>
                                    )}
                                    {!h.watchlist && h.buy_price != null && (
                                      <p className="text-[9px] text-slate-400">∅ {fmt(h.buy_price)} €</p>
                                    )}
                                  </div>
                                  {/* Col 4: Performance */}
                                  <div className="text-right">
                                    {perfPct != null ? (
                                      <>
                                        <p className={`text-[11px] font-black tabular-nums ${perfPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                          {perfPct >= 0 ? '+' : ''}{fmt(perfPct, 1)} %
                                        </p>
                                        {currentPrice != null && (
                                          <p className="text-[9px] text-slate-400 tabular-nums">{fmt(currentPrice)} €</p>
                                        )}
                                      </>
                                    ) : !h.watchlist ? (
                                      <span className="text-[9px] text-slate-300">—</span>
                                    ) : null}
                                  </div>
                                  {/* Col 5: Expand */}
                                  <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>

                                {/* Mobile: stacked */}
                                <div className="md:hidden">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-slate-900 truncate">
                                      {h.ticker?.company_name ?? h.name ?? sym}
                                    </span>
                                    {hasNews && (
                                      <span className="flex items-center gap-0.5 text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                                        <Zap className="w-2.5 h-2.5" /> News
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-[9px] font-mono text-slate-400">{sym}</span>
                                    {h.ticker?.sector && <span className="text-[9px] text-slate-400">· {h.ticker.sector}</span>}
                                    {!h.watchlist && h.shares != null && <span className="text-[9px] text-slate-500 font-semibold">· {h.shares} Stk.</span>}
                                    {perfPct != null && (
                                      <span className={`text-[9px] font-black tabular-nums ${perfPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {perfPct >= 0 ? '+' : ''}{fmt(perfPct, 1)} %
                                      </span>
                                    )}
                                    {sentiment && (
                                      <span className={`inline-flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded-full border ${sentCls}`}>
                                        <SentIcon className="w-2.5 h-2.5" />{sentiment}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Mobile expand chevron */}
                              <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform shrink-0 md:hidden ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>

                          {/* Expanded detail panel */}
                          {isExpanded && (
                            <div className="bg-gradient-to-br from-slate-50 to-white border-t border-slate-100 px-6 py-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">

                              {/* KI-Einschätzung */}
                              {thesis ? (
                                <div className="flex items-start gap-3">
                                  <div className="w-7 h-7 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">KI-Einschätzung</p>
                                    <p className="text-[12px] text-slate-700 leading-relaxed">{thesis.thesis}</p>
                                  </div>
                                </div>
                              ) : thesesLoading ? (
                                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                                  KI-Einschätzung wird generiert…
                                </div>
                              ) : null}

                              {/* News */}
                              {newsItems.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aktuelle News</p>
                                  {newsItems.slice(0, 2).map((n, ni) => (
                                    <div key={ni} className="flex items-start gap-2 bg-white border border-slate-100 rounded-xl p-3">
                                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-slate-800 leading-snug line-clamp-2">{n.title}</p>
                                        {n.summary && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{n.summary}</p>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Aktionen */}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowDepotDrawer(true); }}
                                  className="flex items-center gap-1.5 text-[9px] font-black text-slate-500 hover:text-emerald-600 uppercase tracking-widest transition-colors px-2.5 py-1.5 rounded-lg hover:bg-emerald-50"
                                >
                                  <ChevronRight className="w-3 h-3" /> Bearbeiten
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!window.confirm(`„${sym}" wirklich entfernen?`)) return;
                                    await deleteHolding(h.id, userAccount?.id ?? '');
                                    await fetchHoldings();
                                    setExpandedHolding(null);
                                  }}
                                  className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-rose-600 uppercase tracking-widest transition-colors px-2.5 py-1.5 rounded-lg hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3 h-3" /> Entfernen
                                </button>
                                <p className="text-[8px] text-slate-300 ml-auto italic">KI-generiert · keine Anlageberatung</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-[9px] text-slate-400 italic">
                      Klicke auf eine Position für KI-Einschätzung & News · Keine Anlageberatung
                    </p>
                    <button
                      onClick={() => setShowDepotDrawer(true)}
                      className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest transition-colors"
                    >
                      + Position hinzufügen
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── Markt-News Ticker ─────────────────────────────────────────── */}
            {analysisReport && (
              <MarketNewsTicker
                news={analysisReport.news}
                onNewsClick={(item) => setSelectedNewsFromTicker(item)}
                isPremium={true}
              />
            )}

            {/* ── Schnellzugriff: andere Tools ─────────────────────────────── */}
            {holdings.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    view: 'earnings',
                    icon: Calendar,
                    label: 'Dividenden & Earnings',
                    desc: 'Kalender · Quartalszahlen',
                    color: 'emerald',
                  },
                  {
                    view: 'scenarios',
                    icon: FlaskConical,
                    label: 'Szenario-Analyse',
                    desc: 'Was wäre wenn? · KI-Simulation',
                    color: 'indigo',
                  },
                  {
                    view: 'options',
                    icon: TrendingUp,
                    label: 'Optionspreis-Tracker',
                    desc: 'Black-Scholes · Greeks',
                    color: 'violet',
                  },
                ].map(({ view, icon: Icon, label, desc, color }) => (
                  <button
                    key={view}
                    onClick={() => setActiveView(view)}
                    className="flex items-center gap-3 p-4 rounded-[20px] border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md transition-all text-left group"
                  >
                    <div className="w-10 h-10 bg-slate-100 group-hover:bg-emerald-50 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                      <Icon className="w-4.5 h-4.5 text-slate-600 group-hover:text-emerald-600 transition-colors w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 leading-tight">{label}</p>
                      <p className="text-[9px] text-slate-400 font-medium mt-0.5">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 shrink-0 ml-auto transition-colors" />
                  </button>
                ))}
              </div>
            )}

            {/* ── Portfolio Deep Dive (KI-Analyse Details) ─────────────────── */}
            {analysisReport && (
              <PortfolioDeepDive
                report={analysisReport}
                healthReport={healthReport}
                savingsReport={savingsReport}
                selectedNewsFromTicker={selectedNewsFromTicker}
                onClearSelectedNews={() => setSelectedNewsFromTicker(null)}
              />
            )}

            {/* ── Newsletter (ganz unten) ───────────────────────────────────── */}
            {analysisReport && <NewsletterQuickToggle account={userAccount} />}

          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {activeView === 'assistant' ? (
               <Assistant
                 onAnalysisComplete={(data: any) => processMasterData(data)}
                 initialMessage={assistantSeed}
                 onInitialMessageConsumed={() => setAssistantSeed(null)}
               />
            ) : activeView === 'discover' ? (
               <Discover />
            ) : activeView === 'earnings' ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 font-bold">Keine Anlageberatung. KI-generierte Informationen dienen ausschließlich Bildungszwecken.</p>
                </div>
                <EarningsCalendar key={holdings.map(h => h.symbol).sort().join(',')} holdings={holdings} isPremium={subscription.isPremium} />
              </div>
            ) : activeView === 'scenarios' ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 font-bold">Keine Anlageberatung. KI-generierte Informationen dienen ausschließlich Bildungszwecken.</p>
                </div>
                <ScenarioAnalysis key={holdings.map(h => h.symbol).sort().join(',')} holdings={holdings} report={analysisReport} isPremium={subscription.isPremium} />
              </div>
            ) : activeView === 'options' ? (
              <OptionsTracker />
            ) : activeView === 'tax' ? (
              <TaxOptimizer holdings={holdings} isPremium={subscription.isPremium} />
            ) : activeView === 'settings' ? (
               <Settings account={userAccount} onOpenAuth={() => setShowAuthModal(true)} onProfileRefresh={refreshProfile} />
            ) : activeView === 'portfolio' ? (
              <div className="space-y-6">
                <div>
                  <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Depot verwalten</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Aktien & ETFs hinzufügen · Watchlist pflegen · KI-Analyse starten
                  </p>
                </div>
                {/* Pflicht-Disclaimer */}
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 font-bold">
                    Keine Anlageberatung. KI-generierte Informationen dienen ausschließlich Bildungszwecken und ersetzen keine professionelle Finanzberatung.
                  </p>
                </div>
                <PortfolioInput
                  holdings={holdings}
                  onAnalyze={handlePortfolioAnalysis}
                  isLoading={isGlobalLoading}
                  userAccount={userAccount}
                  onRefresh={fetchHoldings}
                  onSendToAssistant={(text) => {
                    setAssistantSeed(text);
                    setActiveView('assistant');
                  }}
                />
              </div>
            ) : (
              <EmptyState
                onAnalyzeText={(t) => handleAnalysis({ text: t })}
                onUploadClick={() => setActiveView('portfolio')}
                onManagePortfolio={() => setActiveView('portfolio')}
                isLoading={isGlobalLoading}
                onImageImport={handleCockpitImageImport}
                onExcelImport={handleCockpitExcelImport}
                importStatus={cockpitImportState}
              />
            )}
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-16 mt-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
            <div>
              <Logo variant="color-horizontal" className="h-14 mb-4" />
              <p className="text-sm text-slate-500 font-medium max-w-sm leading-relaxed">
                Ein privates Hobby-Projekt für intelligente Portfolio-Analysen. Entwickelt für Bildungszwecke und persönliche Finanzbildung.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Rechtliches</h4>
                <div className="flex flex-col gap-2">
                  <button onClick={() => openLegal('impressum')} className="text-sm text-slate-500 hover:text-emerald-600 transition-colors text-left font-medium">Impressum</button>
                  <button onClick={() => openLegal('disclaimer')} className="text-sm text-slate-500 hover:text-emerald-600 transition-colors text-left font-medium">Haftungsausschluss</button>
                  <button onClick={() => openLegal('privacy')} className="text-sm text-slate-500 hover:text-emerald-600 transition-colors text-left font-medium">Datenschutz</button>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Status</h4>
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-slate-500 font-medium">Private Beta v1.0</span>
                  <span className="text-sm text-emerald-500 font-bold">Systeme Online</span>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] text-slate-400 font-medium italic">
              &copy; {new Date().getFullYear()} Moneta · Tim Bischof · Privates Bildungsprojekt · Kein Anlageberatungsangebot gemäß KWG/WpIG
            </p>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
               <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sichere lokale Verarbeitung</span>
            </div>
          </div>
        </div>
      </footer>

      <Legal isOpen={legalModal.isOpen} onClose={() => setLegalModal({ ...legalModal, isOpen: false })} type={legalModal.type} />

      {/* ── Depot-Drawer (seitliches Panel) ─────────────────────────────── */}
      {showDepotDrawer && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={() => setShowDepotDrawer(false)}
          />
          {/* Drawer Panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white z-50 overflow-hidden shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-white">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Depot verwalten</h2>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">Aktien & ETFs hinzufügen · Watchlist pflegen · KI-Analyse starten</p>
              </div>
              <button
                onClick={() => setShowDepotDrawer(false)}
                className="text-slate-400 hover:text-slate-900 transition-colors p-2 rounded-xl hover:bg-slate-100"
                aria-label="Drawer schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 mx-4 mt-4 mb-0">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-700 font-bold">
                  Keine Anlageberatung. KI-generierte Informationen dienen ausschließlich Bildungszwecken.
                </p>
              </div>
              <div className="px-4 pb-4">
                <PortfolioInput
                  holdings={holdings}
                  onAnalyze={(text) => {
                    setShowDepotDrawer(false);
                    handlePortfolioAnalysis(text);
                  }}
                  isLoading={isGlobalLoading}
                  userAccount={userAccount}
                  onRefresh={fetchHoldings}
                  onSendToAssistant={(text) => {
                    setShowDepotDrawer(false);
                    setAssistantSeed(text);
                    setActiveView('assistant');
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={() => { /* wird via onAuthStateChange in useEffect gehandelt */ }}
      />

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        userId={userAccount?.id}
      />
    </div>
  );
};

export default App;
