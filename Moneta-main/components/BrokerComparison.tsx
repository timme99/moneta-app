
import React from 'react';
import { CheckCircle2, Star, ExternalLink, ShieldCheck, Zap } from 'lucide-react';

const BrokerCard = ({ name, tags, color, promo, features, cta }: any) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-blue-400 transition-all hover:shadow-xl group">
    <div className={`h-2 bg-${color}-500 w-full`}></div>
    <div className="p-6 flex-1">
      <div className="flex justify-between items-start mb-4">
        <div className={`w-14 h-14 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xl`}>
          {name[0]}
        </div>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />)}
        </div>
      </div>
      
      <h3 className="text-xl font-bold text-slate-900 mb-1">{name}</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.map((t: string) => (
          <span key={t} className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">{t}</span>
        ))}
      </div>

      <div className="bg-blue-50 rounded-xl p-3 mb-6">
        <span className="text-xs font-bold text-blue-600 uppercase tracking-tighter block mb-1">Top Angebot</span>
        <p className="text-sm font-bold text-blue-900">{promo}</p>
      </div>

      <ul className="space-y-2 mb-8">
        {features.map((f: string) => (
          <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
    </div>
    
    <div className="p-6 pt-0">
      <button className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold group-hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
        {cta} <ExternalLink className="w-4 h-4" />
      </button>
      <p className="text-[10px] text-slate-400 text-center mt-3">* Affiliate-Link. Sie unterstützen uns ohne Mehrkosten.</p>
    </div>
  </div>
);

const BrokerComparison: React.FC = () => {
  return (
    <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Die besten Broker im Vergleich</h2>
        <p className="text-slate-500">Wir haben über 15 Broker nach Kosten, ETF-Auswahl und Sicherheit getestet. Finden Sie Ihren perfekten Partner.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <BrokerCard 
          name="Trade Republic"
          tags={['Sicherheit', 'Zinsen', 'Mobile']}
          color="slate"
          promo="4% Zinsen p.a. auf das Verrechnungskonto"
          features={['Echte Aktien & ETFs', '1€ pro Trade', 'Kostenlose Sparpläne', 'Visa Karte inklusive']}
          cta="Depot eröffnen"
        />
        <BrokerCard 
          name="Scalable Capital"
          tags={['Profi-Tools', 'Große Auswahl']}
          color="blue"
          promo="Prime+ Gratis Broker-Aktion"
          features={['Über 7.500 Aktien', 'Alle ETFs besparbar', 'Zinsen auf Cash', 'Desktop & App']}
          cta="Kostenlos starten"
        />
        <BrokerCard 
          name="Finanzen.net ZERO"
          tags={['0€ Ordergebühr', 'Desktop']}
          color="emerald"
          promo="0€ Ordergebühren (ab 500€ Order)"
          features={['Keine Depotgebühren', 'Kryptowährungen', 'Made in Germany', 'Schnelle Anmeldung']}
          cta="Zu ZERO wechseln"
        />
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 flex flex-col md:flex-row items-center gap-8">
        <div className="bg-blue-100 p-4 rounded-2xl">
          <ShieldCheck className="w-12 h-12 text-blue-600" />
        </div>
        <div className="flex-1">
          <h4 className="text-xl font-bold text-slate-900">Nicht sicher, welcher Broker passt?</h4>
          <p className="text-slate-500 mt-1">Fragen Sie unseren KI-Assistenten im Chat. Er kennt die Vor- und Nachteile jedes Anbieters basierend auf Ihrem Anlageprofil.</p>
        </div>
        <button className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20">
          KI-Beratung starten
        </button>
      </div>
    </div>
  );
};

export default BrokerComparison;
