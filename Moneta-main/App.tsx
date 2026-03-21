
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
import { analyzePortfolio } from './services/geminiService';
import { userService } from './services/userService';
import { getSupabaseBrowser } from './lib/supabaseBrowser';
import { loadUserHoldings, addTickersByName, deleteHolding } from './services/holdingsService';
import { useSubscription, PLAN_LIMITS } from './lib/useSubscription';
import { Clock, AlertTriangle, ShieldCheck, BarChart3, Loader2, BookMarked, Calendar, FlaskConical, Lock, Plus, X, Trash2, ChevronRight, Sparkles, TrendingUp } from 'lucide-react';

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
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Mein Cockpit</h1>
                {lastUpdate && analysisReport && (
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Analysiert {lastUpdate}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {analysisReport && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    analysisReport.score >= 7 ? 'bg-emerald-50 text-emerald-700' :
                    analysisReport.score >= 5 ? 'bg-amber-50 text-amber-700' :
                    'bg-rose-50 text-rose-700'
                  }`}>
                    <ShieldCheck className="w-3 h-3" />
                    Score {analysisReport.score}/10
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

            {/* ── Stats-Leiste ─────────────────────────────────────────────── */}
            {holdings.length > 0 && (() => {
              const totalInvested = holdings
                .filter(h => !h.watchlist && h.shares != null && h.buy_price != null)
                .reduce((sum, h) => sum + (h.shares! * h.buy_price!), 0);
              const posCount = holdings.filter(h => !h.watchlist).length;
              const watchCount = holdings.filter(h => h.watchlist).length;
              const avgPerPos = posCount > 0 && totalInvested > 0 ? Math.round(totalInvested / posCount) : null;
              return (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Einstand gesamt', value: totalInvested > 0 ? `${totalInvested.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €` : '—', sub: 'Kaufkurse × Stückzahl' },
                    { label: 'Positionen', value: `${posCount}`, sub: `+ ${watchCount} Watchlist` },
                    { label: 'Ø pro Position', value: avgPerPos ? `${avgPerPos.toLocaleString('de-DE')} €` : '—', sub: 'Einstand' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-emerald-600/10 border border-emerald-600/20 rounded-2xl p-4">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-xl font-black text-slate-900 mt-1">{stat.value}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── Onboarding (wenn kein Depot) ─────────────────────────────── */}
            {holdings.length === 0 && (
              <div className="bg-gradient-to-br from-emerald-50 to-slate-50 border border-emerald-100 rounded-3xl p-8 text-center">
                <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <BarChart3 className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Depot importieren oder aufbauen</h2>
                <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                  Füge deine ersten Aktien hinzu – per Screenshot, PDF oder manuell über den Drawer.
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

            {/* ── Live Depot-Übersicht (immer sichtbar wenn Holdings vorhanden) ── */}
            {holdings.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Mein Depot</h3>
                  <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                    {holdings.filter(h => !h.watchlist).length} Position{holdings.filter(h => !h.watchlist).length !== 1 ? 'en' : ''}
                    {holdings.filter(h => h.watchlist).length > 0 && ` · ${holdings.filter(h => h.watchlist).length} Watchlist`}
                  </p>
                </div>

                <div className="divide-y divide-slate-50">
                  {[...holdings]
                    .sort((a, b) => {
                      // Portfolio-Positionen vor Watchlist
                      if (a.watchlist !== b.watchlist) return a.watchlist ? 1 : -1;
                      // Portfolio: nach Positionsgröße (Stückzahl × Kaufpreis) absteigend
                      if (!a.watchlist) {
                        const valA = (a.shares ?? 0) * (a.buy_price ?? 0);
                        const valB = (b.shares ?? 0) * (b.buy_price ?? 0);
                        return valB - valA;
                      }
                      // Watchlist: alphabetisch nach Symbol
                      return (a.symbol ?? '').localeCompare(b.symbol ?? '');
                    })
                    .slice(0, 6)
                    .map((h) => {
                    // Aktuellen Kurs aus dem Analyse-Report auslesen (kein extra API-Aufruf)
                    const reportEntry = analysisReport?.holdings?.find(
                      (rh) => rh.ticker === h.symbol || rh.ticker === h.ticker?.symbol
                    );
                    const rawPrice = reportEntry?.currentPrice ?? '';
                    const currentPrice = (() => {
                      const cleaned = String(rawPrice).replace(/[€$£\s]/g, '').replace(/[A-Za-z]/g, '').trim();
                      const n = parseFloat(cleaned.replace(',', '.'));
                      return isFinite(n) && n > 0 ? n : null;
                    })();
                    const perfPct = (currentPrice && h.buy_price && h.buy_price > 0)
                      ? ((currentPrice - h.buy_price) / h.buy_price) * 100
                      : null;
                    const fmt = (n: number, d = 2) =>
                      n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

                    return (
                      <div key={h.id} className="px-4 sm:px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-start gap-2">
                          {/* Linke Seite: Name + Metazeile */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-900 truncate">
                                {h.ticker?.company_name ?? h.name ?? h.symbol}
                              </span>
                              {h.watchlist && (
                                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                                  Watchlist
                                </span>
                              )}
                            </div>
                            {/* Metazeile: Symbol · Sektor · Stückzahl · Kaufpreis */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[10px] text-slate-400 font-mono">{h.symbol}</span>
                              {h.ticker?.sector && (
                                <>
                                  <span className="text-[10px] text-slate-300">·</span>
                                  <span className="text-[9px] text-slate-400 font-medium">{h.ticker.sector}</span>
                                </>
                              )}
                              {!h.watchlist && h.shares != null && (
                                <>
                                  <span className="text-[10px] text-slate-300">·</span>
                                  <span className="text-[10px] text-slate-600 font-semibold">{h.shares} Stk.</span>
                                </>
                              )}
                              {!h.watchlist && h.buy_price != null && (
                                <>
                                  <span className="text-[10px] text-slate-300">·</span>
                                  <span className="text-[10px] text-slate-500 font-medium">∅ {fmt(h.buy_price)} €</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Rechte Seite: aktueller Kurs + Entwicklung + Buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            {currentPrice != null ? (
                              <div className="text-right">
                                <div className="text-sm font-bold text-slate-800 tabular-nums">
                                  {fmt(currentPrice)} €
                                </div>
                                {perfPct != null && (
                                  <div className={`text-[10px] font-black tabular-nums ${perfPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {perfPct >= 0 ? '+' : ''}{fmt(perfPct, 1)} %
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Kein aktueller Kurs → nur Gesamteinstand zeigen */
                              !h.watchlist && h.shares != null && h.buy_price != null && (
                                <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                                  {fmt(h.shares * h.buy_price)} €
                                </span>
                              )
                            )}
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => setShowDepotDrawer(true)}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors"
                                title="Im Drawer bearbeiten"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!window.confirm(`„${h.symbol}" wirklich aus dem Depot entfernen?`)) return;
                                  await deleteHolding(h.id, userAccount?.id ?? '');
                                  await fetchHoldings();
                                }}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                                title="Löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {holdings.length > 6 && (
                    <div className="px-6 py-3 text-center">
                      <button
                        onClick={() => setShowDepotDrawer(true)}
                        className="text-[10px] text-emerald-500 font-bold hover:text-emerald-600 transition-colors"
                      >
                        + {holdings.length - 6} weitere Position{holdings.length - 6 !== 1 ? 'en' : ''} anzeigen
                      </button>
                    </div>
                  )}
                </div>

                {/* KI-Analyse starten wenn noch keine Analyse vorhanden */}
                {!analysisReport && holdings.filter(h => !h.watchlist).length > 0 && (
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                    <button
                      onClick={() => {
                        const text = buildDepotTextFromHoldings(holdings);
                        if (text) handleAnalysis({ text });
                      }}
                      disabled={isGlobalLoading}
                      className="w-full bg-emerald-600 text-white py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isGlobalLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <BarChart3 className="w-4 h-4" />}
                      KI-Analyse starten · {holdings.filter(h => !h.watchlist).length} Position{holdings.filter(h => !h.watchlist).length !== 1 ? 'en' : ''}
                    </button>
                  </div>
                )}

                {/* Hinweis wenn nur Watchlist-Einträge vorhanden */}
                {!analysisReport && holdings.filter(h => !h.watchlist).length === 0 && (
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
                    <BookMarked className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-[10px] text-slate-500 font-medium">
                      Füge Positionen mit Stückzahl & Kaufpreis hinzu, um eine KI-Analyse zu starten.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Freemium-Gate ───────────────────────────────────────────── */}
            {!subscription.isPremium && holdings.length >= PLAN_LIMITS.free.maxHoldings && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-[24px] p-5 flex items-center gap-4">
                <div className="bg-emerald-100 p-3 rounded-2xl shrink-0">
                  <Lock className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900">Limit erreicht: {PLAN_LIMITS.free.maxHoldings} Positionen</p>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                    Mit Premium unbegrenzte Positionen, 365 Tage Performance-Historie und Kurs-Alerts.
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

            {/* ── Performance-Chart ──────────────────────────────────────── */}
            {holdings.filter(h => !h.watchlist).length > 0 && (
              <PerformanceChart
                userId={userAccount?.id}
                onUpgradeClick={() => setShowUpgradeModal(true)}
              />
            )}

            {/* ── KI-Briefing ───────────────────────────────────────────── */}
            {holdings.filter(h => !h.watchlist).length > 0 && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">KI-Briefing</h3>
                  <span className="text-[10px] text-slate-400 ml-auto">Automatisch · keine Anlageberatung</span>
                </div>
                <div className="space-y-0">
                  {(() => {
                    const nonWatch = holdings.filter(h => !h.watchlist);
                    const insights: string[] = [];
                    const sectorCounts: Record<string, number> = {};
                    nonWatch.forEach(h => { if (h.ticker?.sector) sectorCounts[h.ticker.sector] = (sectorCounts[h.ticker.sector] ?? 0) + 1; });
                    const topSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0];
                    if (topSector && nonWatch.length > 2 && topSector[1] / nonWatch.length > 0.5) {
                      insights.push(`Klumpenrisiko: Über 50 % deiner Positionen entfallen auf den Sektor „${topSector[0]}".`);
                    }
                    if (nonWatch.length < 4) {
                      insights.push(`Konzentriertes Portfolio: Mit ${nonWatch.length} Position${nonWatch.length !== 1 ? 'en' : ''} ist dein Depot noch wenig gestreut.`);
                    }
                    const watchCount = holdings.filter(h => h.watchlist).length;
                    if (watchCount > 0) {
                      insights.push(`Du hast ${watchCount} Wert${watchCount !== 1 ? 'e' : ''} auf der Watchlist – füge Kaufpreis & Stückzahl hinzu, um sie zu analysieren.`);
                    }
                    if (insights.length === 0) {
                      insights.push('Dein Portfolio sieht gut aufgestellt aus. Starte eine KI-Analyse für tiefere Einblicke.');
                    }
                    return insights.map((text, i) => (
                      <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <p className="text-sm text-slate-700">{text}</p>
                      </div>
                    ));
                  })()}
                </div>
                {!analysisReport && (
                  <button
                    onClick={() => {
                      const text = buildDepotTextFromHoldings(holdings);
                      if (text) handleAnalysis({ text });
                    }}
                    disabled={isGlobalLoading}
                    className="mt-4 text-xs text-emerald-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    Vollständige KI-Analyse starten →
                  </button>
                )}
              </div>
            )}

            {/* ── Schnellzugriff auf Depot-Tools ────────────────────────── */}
            {holdings.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveView('earnings')}
                  className={`flex items-center gap-4 p-5 rounded-[24px] border transition-all text-left group hover:shadow-md ${
                    activeView === 'earnings' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <div className={`p-3 rounded-[14px] ${activeView === 'earnings' ? 'bg-white/20' : 'bg-emerald-50 group-hover:bg-emerald-100'}`}>
                    <Calendar className={`w-5 h-5 ${activeView === 'earnings' ? 'text-white' : 'text-emerald-600'}`} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${activeView === 'earnings' ? 'text-emerald-100' : 'text-slate-400'}`}>Quartalszahlen</p>
                    <p className={`text-sm font-black mt-0.5 ${activeView === 'earnings' ? 'text-white' : 'text-slate-900'}`}>Earnings Calendar</p>
                    <p className={`text-[10px] font-medium mt-0.5 ${activeView === 'earnings' ? 'text-emerald-100' : 'text-slate-400'}`}>Nächste Termine deiner Aktien</p>
                  </div>
                </button>

                <button
                  onClick={() => setActiveView('scenarios')}
                  className={`flex items-center gap-4 p-5 rounded-[24px] border transition-all text-left group hover:shadow-md ${
                    activeView === 'scenarios' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <div className={`p-3 rounded-[14px] ${activeView === 'scenarios' ? 'bg-white/20' : 'bg-emerald-50 group-hover:bg-emerald-100'}`}>
                    <FlaskConical className={`w-5 h-5 ${activeView === 'scenarios' ? 'text-white' : 'text-emerald-700'}`} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${activeView === 'scenarios' ? 'text-emerald-100' : 'text-slate-400'}`}>Simulation</p>
                    <p className={`text-sm font-black mt-0.5 ${activeView === 'scenarios' ? 'text-white' : 'text-slate-900'}`}>Szenario-Analyse</p>
                    <p className={`text-[10px] font-medium mt-0.5 ${activeView === 'scenarios' ? 'text-emerald-100' : 'text-slate-400'}`}>Was wäre wenn? · KI-Simulation</p>
                  </div>
                </button>

                <button
                  onClick={() => setActiveView('options')}
                  className={`flex items-center gap-4 p-5 rounded-[24px] border transition-all text-left group hover:shadow-md ${
                    activeView === 'options' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <div className={`p-3 rounded-[14px] ${activeView === 'options' ? 'bg-white/20' : 'bg-emerald-50 group-hover:bg-emerald-100'}`}>
                    <TrendingUp className={`w-5 h-5 ${activeView === 'options' ? 'text-white' : 'text-emerald-700'}`} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${activeView === 'options' ? 'text-emerald-100' : 'text-slate-400'}`}>Black-Scholes</p>
                    <p className={`text-sm font-black mt-0.5 ${activeView === 'options' ? 'text-white' : 'text-slate-900'}`}>Optionspreis-Tracker</p>
                    <p className={`text-[10px] font-medium mt-0.5 ${activeView === 'options' ? 'text-emerald-100' : 'text-slate-400'}`}>Greeks · Szenario-Simulation</p>
                  </div>
                </button>
              </div>
            )}

            {/* ── KI-Analyse Ergebnisse (nur wenn vorhanden) ──────────────── */}
            {analysisReport && (
              <>
                <MarketNewsTicker
                  news={analysisReport.news}
                  onNewsClick={(item) => setSelectedNewsFromTicker(item)}
                  isPremium={true}
                />

                <DashboardSummary
                  report={analysisReport}
                  healthReport={healthReport}
                  savingsReport={savingsReport}
                  insight={null}
                  holdings={holdings}
                />

                <NewsletterQuickToggle account={userAccount} />

                <PortfolioDeepDive
                  report={analysisReport}
                  healthReport={healthReport}
                  savingsReport={savingsReport}
                  selectedNewsFromTicker={selectedNewsFromTicker}
                  onClearSelectedNews={() => setSelectedNewsFromTicker(null)}
                />
              </>
            )}
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
