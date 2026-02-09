
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { ChevronRight, ChevronLeft, Target, Shield, Zap, CheckCircle2 } from 'lucide-react';

interface Props {
  onComplete: (profile: UserProfile) => void;
}

const OnboardingFlow: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    age: 30,
    riskTolerance: 'balanced',
    investmentHorizon: 15,
    monthlyInvestment: 250,
    experience: 'basic'
  });

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                <Target className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Wie alt sind Sie?</h2>
              <p className="text-slate-500">Ihr Alter beeinflusst Ihre Anlagestrategie.</p>
            </div>
            <input 
              type="range" min="18" max="80" 
              value={profile.age} 
              onChange={e => setProfile({...profile, age: parseInt(e.target.value)})}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="text-center text-4xl font-bold text-blue-600">{profile.age} Jahre</div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Ihre Risikobereitschaft?</h2>
              <p className="text-slate-500">Wie reagieren Sie auf Marktschwankungen?</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {[
                { id: 'conservative', title: 'Konservativ', desc: 'Sicherheit ist mir am wichtigsten.', icon: Shield, color: 'emerald' },
                { id: 'balanced', title: 'Ausgewogen', desc: 'Gleichgewicht von Risiko und Rendite.', icon: Target, color: 'blue' },
                { id: 'aggressive', title: 'Aggressiv', desc: 'Höhere Rendite bei hoher Volatilität.', icon: Zap, color: 'purple' }
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => setProfile({...profile, riskTolerance: opt.id as any})}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    profile.riskTolerance === opt.id ? `border-${opt.color}-500 bg-${opt.color}-50` : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg bg-${opt.color}-100 text-${opt.color}-600`}>
                    <opt.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{opt.title}</h4>
                    <p className="text-xs text-slate-500">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900">Anlageziel?</h2>
              <p className="text-slate-500">Wie viel möchten Sie monatlich investieren?</p>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">Monatlicher Sparbetrag (€)</label>
              <input 
                type="number" 
                value={profile.monthlyInvestment}
                onChange={e => setProfile({...profile, monthlyInvestment: parseInt(e.target.value)})}
                className="w-full p-4 text-2xl font-bold text-center border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
              <label className="block text-sm font-medium text-slate-700">Anlagehorizont (Jahre)</label>
              <input 
                type="range" min="1" max="40" 
                value={profile.investmentHorizon}
                onChange={e => setProfile({...profile, investmentHorizon: parseInt(e.target.value)})}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="text-center text-xl font-bold text-slate-700">{profile.investmentHorizon} Jahre</div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20">
        <div className="h-2 bg-slate-100 w-full">
          <div 
            className="h-full bg-blue-600 transition-all duration-500" 
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
        <div className="p-8">
          {renderStep()}
          
          <div className="flex justify-between mt-10">
            {step > 1 ? (
              <button 
                onClick={back}
                className="flex items-center gap-2 px-6 py-3 text-slate-600 font-medium hover:text-slate-900 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" /> Zurück
              </button>
            ) : <div></div>}
            
            {step < 3 ? (
              <button 
                onClick={next}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
              >
                Weiter <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={() => onComplete(profile as UserProfile)}
                className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"
              >
                Fertigstellen <CheckCircle2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
