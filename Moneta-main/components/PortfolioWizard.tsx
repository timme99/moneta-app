
import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  Target, 
  Shield, 
  Zap, 
  CheckCircle2, 
  TrendingUp, 
  Wallet, 
  Calendar,
  Layers,
  Sparkles,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { generatePortfolioSuggestion } from '../services/geminiService';
import { PortfolioAnalysisReport } from '../types';

interface PortfolioWizardProps {
  onComplete: (report: PortfolioAnalysisReport) => void;
  onCancel: () => void;
}

const PortfolioWizard: React.FC<PortfolioWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState({
    goal: 'wealth',
    risk: 'balanced',
    horizon: 15,
    amount: 500,
    focus: [] as string[]
  });

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);

  const handleFinish = async () => {
    setIsLoading(true);
    try {
      const report = await generatePortfolioSuggestion(data);
      onComplete(report);
    } catch (error) {
      alert("Fehler bei der Portfolio-Erstellung. Bitte versuchen Sie es erneut.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center mb-8">
              <div className="bg-blue-100 w-16 h-16 rounded-[24px] flex items-center justify-center mx-auto mb-4 text-blue-600">
                <Target className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Was möchten Sie erreichen?</h2>
              <p className="text-slate-500 font-medium">Wofür legen Sie Ihr Geld beiseite?</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {[
                { id: 'wealth', title: 'Vermögen aufbauen', desc: 'Mein Geld soll langfristig wachsen.', icon: TrendingUp },
                { id: 'retirement', title: 'Fürs Alter vorsorgen', desc: 'Ich möchte im Ruhestand finanziell frei sein.', icon: Calendar },
                { id: 'safety', title: 'Geld sicher parken', desc: 'Mein Geld soll vor Inflation geschützt sein.', icon: Shield }
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => setData({...data, goal: opt.id})}
                  className={`flex items-center gap-4 p-6 rounded-[24px] border-2 transition-all text-left group ${
                    data.goal === opt.id ? 'border-blue-600 bg-blue-50 shadow-lg' : 'border-slate-100 hover:border-blue-200 bg-white'
                  }`}
                >
                  <div className={`p-3 rounded-2xl ${data.goal === opt.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500'}`}>
                    <opt.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{opt.title}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{opt.desc}</p>
                  </div>
                  {data.goal === opt.id && <CheckCircle2 className="w-5 h-5 text-blue-600 ml-auto" />}
                </button>
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center mb-8">
              <div className="bg-amber-100 w-16 h-16 rounded-[24px] flex items-center justify-center mx-auto mb-4 text-amber-600">
                <Zap className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Wie viel Schwankung halten Sie aus?</h2>
              <p className="text-slate-500 font-medium">Börsenkurse gehen rauf und runter. Was passt zu Ihren Nerven?</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {[
                { id: 'conservative', title: 'Ich mag es sicher', risk: 'Wenig Schwankung', color: 'emerald' },
                { id: 'balanced', title: 'Ein guter Mittelweg', risk: 'Normale Schwankung', color: 'blue' },
                { id: 'aggressive', title: 'Ich will volle Rendite', risk: 'Starke Schwankung möglich', color: 'rose' }
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => setData({...data, risk: opt.id})}
                  className={`flex items-center justify-between p-6 rounded-[24px] border-2 transition-all ${
                    data.risk === opt.id ? `border-${opt.color}-600 bg-${opt.color}-50 shadow-lg` : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-slate-900">{opt.title}</h4>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{opt.risk}</span>
                  </div>
                  {data.risk === opt.id && <CheckCircle2 className={`w-5 h-5 text-${opt.color}-600`} />}
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center mb-4">
              <div className="bg-purple-100 w-16 h-16 rounded-[24px] flex items-center justify-center mx-auto mb-4 text-purple-600">
                <Wallet className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Die Rahmendaten</h2>
              <p className="text-slate-500 font-medium">Wie viel Geld und wie viel Zeit bringen Sie mit?</p>
            </div>
            <div className="space-y-10">
              <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Monatlicher Sparbetrag</label>
                <div className="flex items-center justify-center gap-4">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter">{data.amount}€</span>
                </div>
                <input 
                  type="range" min="25" max="5000" step="25"
                  value={data.amount}
                  onChange={e => setData({...data, amount: parseInt(e.target.value)})}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-6"
                />
              </div>
              
              <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Anlagedauer (in Jahren)</label>
                <div className="flex items-center justify-center gap-4">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter">{data.horizon} Jahre</span>
                </div>
                <input 
                  type="range" min="1" max="40"
                  value={data.horizon}
                  onChange={e => setData({...data, horizon: parseInt(e.target.value)})}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-6"
                />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-[48px] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 relative">
        
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-200">
          <div 
            className="h-full bg-blue-600 transition-all duration-700 ease-out" 
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="p-12">
          {isLoading ? (
            <div className="py-20 text-center space-y-6">
              <div className="relative inline-block">
                <Loader2 className="w-16 h-16 animate-spin text-blue-600" />
                <Sparkles className="w-6 h-6 text-amber-400 absolute -top-1 -right-1 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Dein Plan wird erstellt...</h3>
                <p className="text-slate-500 font-medium">Wir suchen die sichersten und günstigsten Bausteine für dich.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-[400px]">
                {renderStep()}
              </div>
              
              <div className="flex justify-between mt-12 pt-8 border-t border-slate-200/60">
                <button 
                  onClick={step === 1 ? onCancel : back}
                  className="flex items-center gap-2 px-8 py-4 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-slate-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> {step === 1 ? 'Abbrechen' : 'Zurück'}
                </button>
                
                {step < 3 ? (
                  <button 
                    onClick={next}
                    className="flex items-center gap-3 px-10 py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-900/20 active:scale-95"
                  >
                    Nächster Schritt <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button 
                    onClick={handleFinish}
                    className="flex items-center gap-3 px-10 py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-600/30 active:scale-95 group"
                  >
                    Anlage-Plan erstellen <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioWizard;
