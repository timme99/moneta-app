
import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
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
import { PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport, UserAccount, HoldingRow } from './types';
import { analyzePortfolio } from './services/geminiService';
import { userService } from './services/userService';
import { getSupabaseBrowser } from './lib/supabaseBrowser';
import { Clock, AlertTriangle, ShieldCheck, BarChart3, Loader2, BookMarked } from 'lucide-react';

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
    settings:   { autoNewsletter: true, weeklyDigest: true, cloudSync: true },
  };
}

type NewsItem = PortfolioAnalysisReport['news'] extends (infer T)[] ? T : never;

const App: React.FC = () => {
  const [activeView, setActiveView] = useState('cockpit');
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [analysisReport, setAnalysisReport] = useState<PortfolioAnalysisReport | null>(null);
  const [healthReport, setHealthReport] = useState<PortfolioHealthReport | null>(null);
  const [savingsReport, setSavingsReport] = useState<PortfolioSavingsReport | null>(null);
  const [selectedNewsFromTicker, setSelectedNewsFromTicker] = useState<NewsItem | null>(null);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [assistantSeed, setAssistantSeed] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean, type: 'impressum' | 'disclaimer' | 'privacy' }>({
    isOpen: false,
    type: 'disclaimer'
  });

  // ── Cockpit-Import (Screenshot / Excel – für EmptyState-Buttons) ──────────
  const [cockpitImportState, setCockpitImportState] = useState<{ loading: boolean; message: string; error: string }>({
    loading: false, message: '', error: '',
  });

  /** Lädt Holdings des Nutzers aus Supabase und speichert sie im State */
  const loadHoldingsForUser = useCallback(async (uid: string) => {
    const sb = getSupabaseBrowser();
    if (!sb || !uid) return;
    const { data } = await sb
      .from('holdings')
      .select('id, shares, buy_price, watchlist, ticker_mapping(*)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setHoldings(
      (data ?? []).map((row: any) => ({
        id:        row.id,
        ticker:    row.ticker_mapping,
        shares:    row.shares,
        buy_price: row.buy_price,
        watchlist: row.watchlist,
      }))
    );
  }, []);

  /** Baut den Depot-Text für die KI-Analyse aus den aktuellen Holdings auf */
  const buildDepotTextFromHoldings = useCallback((holds: HoldingRow[]): string => {
    if (holds.length === 0) return '';
    const lines = holds.map((h, i) => {
      const t = h.ticker;
      const pos = h.watchlist
        ? 'Watchlist'
        : `${h.shares} Stück | Kaufpreis: ${h.buy_price?.toFixed(2)} €`;
      const meta = [
        t.sector      ? `Sektor: ${t.sector}`           : null,
        t.industry    ? `Industrie: ${t.industry}`       : null,
        t.competitors ? `Wettbewerber: ${t.competitors}` : null,
        t.pe_ratio_static != null ? `KGV: ${t.pe_ratio_static}` : null,
      ].filter(Boolean).join(' | ');
      const desc = t.description_static
        ? `\n   Beschreibung: ${t.description_static}`
        : '';
      return `${i + 1}. ${t.company_name} (${t.symbol}) | ${pos}${meta ? ` | ${meta}` : ''}${desc}`;
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

  /** Tickers (Namen/Symbole) → Gemini → ticker_mapping → holdings */
  const bulkAddTickersInCockpit = useCallback(async (names: string[]): Promise<number> => {
    const sb = getSupabaseBrowser();
    const uid = userAccount?.id;
    if (!sb || !uid || names.length === 0) throw new Error('Nicht eingeloggt');

    const resp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'resolve_ticker', payload: { names }, userId: uid }),
    });
    if (!resp.ok) throw new Error('Ticker-Auflösung fehlgeschlagen');
    const resolved: Array<{ ticker: string }> = (await resp.json()).tickers ?? [];
    if (resolved.length === 0) return 0;

    // Validierung: Einträge mit Leerzeichen sind noch Namen, keine Börsensymbole → verwerfen
    const symbols = resolved.map((t) => t.ticker).filter((s: string) => s && !s.includes(' '));
    const { data: mapped } = await sb.from('ticker_mapping').select('id, symbol').in('symbol', symbols);
    if (!mapped || mapped.length === 0) return 0;

    const rows = (mapped as Array<{ id: string }>).map((t) => ({
      user_id: uid, ticker_id: t.id, watchlist: true, shares: null, buy_price: null,
    }));
    const { error } = await sb.from('holdings').upsert(rows, { onConflict: 'user_id,ticker_id' });
    if (error) throw new Error(error.message);

    await loadHoldingsForUser(uid);
    return mapped.length;
  }, [userAccount, loadHoldingsForUser]);

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
      setShowAuthModal(false);
      // Holdings aus Supabase laden (aktuellste Depot-Positionen)
      loadHoldingsForUser(account.id);
      // Lade zuletzt gespeicherte Portfolio-Daten aus localStorage
      const stored = localStorage.getItem('moneta_db_mock');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.portfolioData) {
            setAnalysisReport(parsed.portfolioData.report);
            setHealthReport(parsed.portfolioData.health);
            setSavingsReport(parsed.portfolioData.savings);
            setLastUpdate(localStorage.getItem('moneta_last_update'));
          }
        } catch { /* ignore */ }
      }
    };

    if (sb) {
      // 1. Aktuelle Session prüfen (OAuth-Callback, Magic Link, persistierte Session)
      sb.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          applyUser(userFromSupabase(session.user));
        } else {
          // Kein Supabase-Login → localStorage-Fallback (alte Mock-User)
          userService.fetchUserData().then(u => { if (u) applyUser(u); });
        }
      });

      // 2. Auth-State-Changes (Login nach Magic Link oder OAuth-Redirect)
      const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          applyUser(userFromSupabase(session.user));
        } else if (event === 'SIGNED_OUT') {
          setUserAccount(null);
          setHoldings([]);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      // Supabase nicht konfiguriert → localStorage-Fallback
      userService.fetchUserData().then(u => { if (u) applyUser(u); });
    }
  }, [loadHoldingsForUser]);

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
      userService.useCredit();
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
      />
      
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {activeView === 'cockpit' && (analysisReport || holdings.length > 0) ? (
          <div className="space-y-6">
            <div className="flex justify-between items-end mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Cockpit</h1>
                  <span className="bg-slate-200 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest">Beta</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Informative Depot-Übersicht · Keine Anlageberatung</p>
              </div>
              {lastUpdate && analysisReport && (
                <div className="flex items-center gap-2 text-slate-400 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
                  <Clock className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase">Stand: {lastUpdate}</span>
                </div>
              )}
            </div>

            {/* ── Live Depot-Übersicht (immer sichtbar wenn Holdings vorhanden) ── */}
            {holdings.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Mein Depot</h3>
                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                      {holdings.filter(h => !h.watchlist).length} Position{holdings.filter(h => !h.watchlist).length !== 1 ? 'en' : ''}
                      {holdings.filter(h => h.watchlist).length > 0 && ` · ${holdings.filter(h => h.watchlist).length} Watchlist`}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveView('portfolio')}
                    className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-slate-900 transition-colors"
                  >
                    Verwalten →
                  </button>
                </div>

                <div className="divide-y divide-slate-50">
                  {holdings.slice(0, 6).map((h) => (
                    <div key={h.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 truncate">{h.ticker.company_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{h.ticker.symbol}</span>
                          {h.watchlist && (
                            <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                              Watchlist
                            </span>
                          )}
                          {h.ticker.sector && (
                            <span className="text-[9px] text-slate-400 font-medium">{h.ticker.sector}</span>
                          )}
                        </div>
                      </div>
                      {!h.watchlist && h.shares != null && (
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold text-slate-700">{h.shares} Stk.</span>
                          {h.buy_price != null && (
                            <p className="text-[10px] text-blue-500 font-bold">
                              {(h.shares * h.buy_price).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € Einstand
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {holdings.length > 6 && (
                    <div className="px-6 py-3 text-center">
                      <button
                        onClick={() => setActiveView('portfolio')}
                        className="text-[10px] text-blue-500 font-bold hover:text-blue-600 transition-colors"
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
                      className="w-full bg-blue-600 text-white py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
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
                />

                <div className="bg-amber-50 border border-amber-100 p-5 rounded-[32px] flex items-start gap-4 shadow-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-black text-amber-900 uppercase tracking-widest">Wichtiger Risikohinweis</p>
                    <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                      <strong>Kein Anlageberatungsangebot.</strong> Alle Informationen dienen ausschließlich der allgemeinen Bildung und stellen keine Anlageberatung, Finanzberatung oder Empfehlung zum Kauf oder Verkauf von Wertpapieren dar. Bitte konsultieren Sie vor jeder Anlageentscheidung einen zugelassenen Finanzberater. Kapitaleinsatz an der Börse ist mit Risiken bis zum Totalverlust verbunden.
                    </p>
                  </div>
                </div>

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
               <EarningsCalendar holdings={holdings} />
            ) : activeView === 'scenarios' ? (
               <ScenarioAnalysis holdings={holdings} report={analysisReport} />
            ) : activeView === 'settings' ? (
               <Settings account={userAccount} />
            ) : activeView === 'portfolio' ? (
              <div className="space-y-6">
                <div>
                  <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Depot verwalten</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Aktien & ETFs hinzufügen · Watchlist pflegen · KI-Analyse starten
                  </p>
                </div>
                <PortfolioInput
                  onAnalyze={handlePortfolioAnalysis}
                  isLoading={isGlobalLoading}
                  userAccount={userAccount}
                  onHoldingsChange={setHoldings}
                  onSendToAssistant={(text) => {
                    setAssistantSeed(text);
                    setActiveView('assistant');
                  }}
                />
              </div>
            ) : (
              <EmptyState
                onAnalyzeText={(t) => handleAnalysis({ text: t })}
                onUploadClick={() => setActiveView('assistant')}
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
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-blue-600 p-2 rounded-lg">
                  <ShieldCheck className="text-white w-4 h-4" />
                </div>
                <span className="text-xl font-black text-slate-900 tracking-tighter italic">
                  Mon<span className="text-blue-600">eta</span>
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium max-w-sm leading-relaxed">
                Ein privates Hobby-Projekt für intelligente Portfolio-Analysen. Entwickelt für Bildungszwecke und persönliche Finanzbildung.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Rechtliches</h4>
                <div className="flex flex-col gap-2">
                  <button onClick={() => openLegal('impressum')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors text-left font-medium">Impressum</button>
                  <button onClick={() => openLegal('disclaimer')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors text-left font-medium">Haftungsausschluss</button>
                  <button onClick={() => openLegal('privacy')} className="text-sm text-slate-500 hover:text-blue-600 transition-colors text-left font-medium">Datenschutz</button>
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
              &copy; {new Date().getFullYear()} Moneta · Tim Eichmann · Privates Bildungsprojekt · Kein Anlageberatungsangebot gemäß KWG/WpIG
            </p>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
               <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sichere lokale Verarbeitung</span>
            </div>
          </div>
        </div>
      </footer>

      <Legal isOpen={legalModal.isOpen} onClose={() => setLegalModal({ ...legalModal, isOpen: false })} type={legalModal.type} />

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={() => { /* wird via onAuthStateChange in useEffect gehandelt */ }}
      />
    </div>
  );
};

export default App;
