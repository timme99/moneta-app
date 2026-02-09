
import React, { useState } from 'react';
import { Target, Shield, Zap, Wind, ArrowRight, Star, X, Info, History, Scale, Layers, Loader2 } from 'lucide-react';
import { explainStrategy } from '../services/geminiService';
import { StrategyExplanation } from '../types';

const ExplanationModal = ({ info, onClose }: { info: StrategyExplanation, onClose: () => void }) => (
  <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-4">
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-white/20 animate-in slide-in-from-bottom-6 duration-300">
      <div className="sticky top-0 bg-white/80 backdrop-blur-md px-10 py-6 border-b border-slate-100 flex items-center justify-between z-10">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{info.strategy_name}</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Neutraler Bildungskanal</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
      </div>
      <div className="p-10 space-y-10">
        <p className="text-slate-600 font-medium leading-relaxed">{info.description}</p>
        
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
          <div className="flex items-center gap-2 mb-4 text-slate-900">
            <Layers className="w-4 h-4" />
            <h3 className="font-black uppercase text-[10px] tracking-widest">Typische Allokation</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(info.typical_allocation).map(([key, val]) => (
              <div key={key} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm">
                <span className="text-xs font-bold text-slate-700">{key}</span>
                <span className="text-xs font-black text-blue-600">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Star className="w-4 h-4" />
              <h4 className="text-[10px] font-black uppercase tracking-widest">Häufige Gründe</h4>
            </div>
            <ul className="space-y-2">
              {info.common_reasons.map((r, i) => (
                <li key={i} className="text-[11px] font-medium text-slate-600 leading-relaxed bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">{r}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <Scale className="w-4 h-4" />
              <h4 className="text-[10px] font-black uppercase tracking-widest">Zu bedenken</h4>
            </div>
            <ul className="space-y-2">
              {info.considerations.map((c, i) => (
                <li key={i} className="text-[11px] font-medium text-slate-600 leading-relaxed bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">{c}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-blue-600 p-8 rounded-[32px] text-white relative overflow-hidden">
          <History className="absolute -bottom-6 -right-6 w-32 h-32 text-white/10 -rotate-12" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-3 flex items-center gap-2">
            <History className="w-4 h-4" /> Historischer Kontext
          </h4>
          <p className="text-sm font-medium leading-relaxed relative z-10">{info.historical_context}</p>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Andere Ansätze</h4>
          <div className="flex flex-wrap gap-2">
            {info.alternatives.map((a, i) => (
              <span key={i} className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-tighter">{a}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const StrategyCard = ({ title, desc, risk, icon: Icon, color, returns, onLearnMore }: any) => (
  <div className="bg-white p-8 rounded-[32px] border border-slate-200 hover:border-blue-400 transition-all cursor-pointer group shadow-sm flex flex-col h-full">
    <div className={`p-4 rounded-[20px] bg-${color}-50 w-fit mb-6 group-hover:scale-110 transition-transform`}>
      <Icon className={`w-8 h-8 text-${color}-600`} />
    </div>
    <div className="flex justify-between items-start mb-2">
      <h3 className="font-black text-xl text-slate-900 tracking-tight">{title}</h3>
      <span className="text-[9px] font-black bg-slate-100 px-2 py-1 rounded-lg text-slate-400 uppercase tracking-widest">Risiko: {risk}/10</span>
    </div>
    <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium flex-1">{desc}</p>
    
    <div className="flex items-center justify-between">
      <div className="text-emerald-600 font-black text-lg">{returns} <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Ø Rendite p.a.</span></div>
      <button 
        onClick={(e) => { e.stopPropagation(); onLearnMore(); }}
        className="px-5 py-3 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all flex items-center gap-2 shadow-xl shadow-slate-900/10"
      >
        Details <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  </div>
);

const Strategies: React.FC = () => {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLearnMore = async (name: string) => {
    setIsLoading(true);
    try {
      const result = await explainStrategy(name);
      setSelectedStrategy(result);
    } catch (e) {
      alert("Fehler beim Laden.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-left-10 duration-500">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-12 rounded-[48px] text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse"></div>
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <span className="text-amber-400 font-black text-[10px] uppercase tracking-[0.3em]">Premium Insights</span>
          </div>
          <h2 className="text-5xl font-black mb-6 tracking-tighter leading-none">Strategie-Hub</h2>
          <p className="text-slate-400 text-lg font-medium leading-relaxed">Entdecken Sie wissenschaftlich fundierte Anlage-Modelle. Wir erklären Ihnen die Zusammenhänge – neutral und faktenbasiert.</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">KI bereitet Daten vor...</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <StrategyCard 
          title="70/30 Klassiker" 
          desc="Der Goldstandard für Privatanleger: Maximale Abdeckung des Weltmarktes mit Schwellenländer-Tilt." 
          risk={5} 
          icon={Target} 
          color="blue" 
          returns="~8,4%"
          onLearnMore={() => handleLearnMore("70/30 Welt Portfolio")}
        />
        <StrategyCard 
          title="Nachhaltigkeit ESG" 
          desc="Investieren Sie nur in Unternehmen, die strenge Umwelt-, Sozial- und Governance-Kriterien erfüllen." 
          risk={6} 
          icon={Wind} 
          color="emerald" 
          returns="~9,1%"
          onLearnMore={() => handleLearnMore("ESG/SRI Nachhaltigkeitsstrategie")}
        />
        <StrategyCard 
          title="All-Weather Portfolio" 
          desc="Nach Ray Dalio: Ein Portfolio für jede Konjunkturphase durch gezielte Asset-Diversifikation." 
          risk={3} 
          icon={Shield} 
          color="purple" 
          returns="~5,2%"
          onLearnMore={() => handleLearnMore("All-Weather Portfolio Strategy")}
        />
      </div>

      {selectedStrategy && <ExplanationModal info={selectedStrategy} onClose={() => setSelectedStrategy(null)} />}
    </div>
  );
};

export default Strategies;
