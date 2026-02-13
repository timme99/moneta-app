
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
import { PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport, UserAccount } from './types';
import { analyzePortfolio } from './services/geminiService';
import { userService } from './services/userService';
import { DEMO_REPORT, DEMO_HEALTH, DEMO_SAVINGS } from './demoData';
import { Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState('cockpit');
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [analysisReport, setAnalysisReport] = useState<PortfolioAnalysisReport | null>(null);
  const [healthReport, setHealthReport] = useState<PortfolioHealthReport | null>(null);
  const [savingsReport, setSavingsReport] = useState<PortfolioSavingsReport | null>(null);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean, type: 'impressum' | 'disclaimer' | 'privacy' }>({
    isOpen: false,
    type: 'disclaimer'
  });

  useEffect(() => {
    const loadData = async () => {
      const user = await userService.fetchUserData();
      if (user) {
        setUserAccount(user);
        if (user.portfolioData) {
          setAnalysisReport(user.portfolioData.report);
          setHealthReport(user.portfolioData.health);
          setSavingsReport(user.portfolioData.savings);
          setLastUpdate(localStorage.getItem('moneta_last_update'));
          return;
        }
      }
      // Load demo data if no saved portfolio exists
      setAnalysisReport(DEMO_REPORT);
      setHealthReport(DEMO_HEALTH);
      setSavingsReport(DEMO_SAVINGS);
      setLastUpdate(new Date().toLocaleTimeString('de-DE'));
    };
    loadData();
  }, []);

  const processMasterData = useCallback((masterData: any) => {
    if (!masterData || Object.keys(masterData).length === 0) return;

    const report: PortfolioAnalysisReport = {
      ...masterData,
      score: masterData.score || 0,
      summary: masterData.summary || "",
      holdings: masterData.holdings || [],
      news: masterData.news || [],
      nextSteps: masterData.nextSteps || (masterData.next_step ? [{ action: "Check", description: masterData.next_step }] : [])
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

    const now = new Date().toLocaleTimeString('de-DE');
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
      if (error.message.includes(':')) {
        alert(error.message.split(':')[1]);
      } else {
        alert("Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später noch einmal.");
      }
    } finally {
      setIsGlobalLoading(false);
    }
  };

  const openLegal = (type: 'impressum' | 'disclaimer' | 'privacy') => {
    setLegalModal({ isOpen: true, type });
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900 bg-slate-50/50">
      <Header activeView={activeView} onViewChange={setActiveView} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeView === 'cockpit' && analysisReport ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter">Portfolio Cockpit</h1>
                  <span className="bg-slate-200 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest">Beta</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">KI-gestützte Portfolio-Analyse & Echtzeit-Einblicke</p>
              </div>
              {lastUpdate && (
                <div className="flex items-center gap-2 text-slate-400 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
                  <Clock className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase">Stand: {lastUpdate}</span>
                </div>
              )}
            </div>

            <DashboardSummary
              report={analysisReport}
              healthReport={healthReport}
              savingsReport={savingsReport}
              insight={null}
            />

            <MarketNewsTicker
              news={analysisReport.news}
              onNewsClick={() => {}}
              isPremium={true}
            />

            <PortfolioDeepDive
              report={analysisReport}
              healthReport={healthReport}
              savingsReport={savingsReport}
            />

            <div className="bg-amber-50 border border-amber-100 p-5 rounded-[32px] flex items-start gap-4 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-black text-amber-900 uppercase tracking-widest">Wichtiger Risikohinweis</p>
                <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                  Die dargestellten Analysen sind rein informativ und stellen keine Anlageberatung dar. Investitionen an der Börse bergen Risiken bis zum Totalverlust. Dieses Tool ist ein privates Beta-Projekt.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {activeView === 'assistant' ? (
               <Assistant onAnalysisComplete={(data: any) => processMasterData(data)} />
            ) : activeView === 'discover' ? (
               <Discover />
            ) : activeView === 'settings' ? (
               <Settings account={userAccount} />
            ) : (
              <EmptyState
                onAnalyzeText={(t) => handleAnalysis({ text: t })}
                onUploadClick={() => setActiveView('assistant')}
                isLoading={isGlobalLoading}
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
              &copy; {new Date().getFullYear()} Moneta. Nur für private Zwecke. Keine kommerzielle Anlageberatung.
            </p>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
               <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sichere lokale Verarbeitung</span>
            </div>
          </div>
        </div>
      </footer>

      <Legal isOpen={legalModal.isOpen} onClose={() => setLegalModal({ ...legalModal, isOpen: false })} type={legalModal.type} />
    </div>
  );
};

export default App;
