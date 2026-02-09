
import React from 'react';
import { ShieldAlert, X, Scale, FileText } from 'lucide-react';

interface LegalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'impressum' | 'disclaimer' | 'privacy';
}

const Legal: React.FC<LegalProps> = ({ isOpen, onClose, type }) => {
  if (!isOpen) return null;

  const content = {
    impressum: {
      title: 'Impressum',
      icon: FileText,
      body: (
        <div className="space-y-4 text-sm text-slate-600">
          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Angaben gemäß § 5 TMG</h4>
            <p>Moneta ist ein rein privates Hobby-Projekt.<br />Betreiber: [Private Betreiber]<br />Kontakt: tiimmme@gmail.com</p>
          </section>
          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Kontakt</h4>
            <p>E-Mail: tiimmme@gmail.com</p>
          </section>
          <p className="italic text-[10px]">Hinweis: Diese Anwendung ist ein privates Projekt zu Bildungszwecken und verfolgt keinerlei kommerzielle Absichten. Alle Daten werden nur lokal verarbeitet.</p>
        </div>
      )
    },
    disclaimer: {
      title: 'Wichtiger Risikohinweis',
      icon: ShieldAlert,
      body: (
        <div className="space-y-4 text-sm text-slate-600">
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-700 font-bold mb-4 flex gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p>Keine Anlageberatung. Totalverlustrisiko möglich.</p>
          </div>
          <p>Die von Moneta bereitgestellten Analysen und Informationen dienen ausschließlich der allgemeinen Bildung. Sie stellen keine Anlageberatung, Steuerberatung oder Rechtsberatung dar.</p>
          <p>Investitionen in Wertpapiere (insbesondere ETFs und Aktien) sind mit hohen Risiken verbunden. Kurse können fallen oder steigen. Im schlimmsten Fall droht der Totalverlust des eingesetzten Kapitals.</p>
          <p>Die KI-Analysen basieren auf Algorithmen und Daten von Drittanbietern. Für die Richtigkeit, Vollständigkeit und Aktualität wird keine Haftung übernommen.</p>
          <p>Handeln Sie niemals allein auf Basis einer KI-Analyse. Konsultieren Sie bei Bedarf einen qualifizierten Finanzberater.</p>
        </div>
      )
    },
    privacy: {
      title: 'Datenschutz',
      icon: Scale,
      body: (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Moneta speichert keine persönlichen Daten auf externen Servern, sofern Sie nicht die Cloud-Synchronisation nutzen. In diesem Fall werden Ihre verschlüsselten Depot-Daten in einer gesicherten Datenbank abgelegt.</p>
          <p>Um Analysen zu erstellen, werden Ihre Depot-Daten (Anlagenamen, ISINs) an die Google Gemini API übertragen. Es werden keine Namen oder privaten Daten von Ihnen übermittelt.</p>
          <p>Kontakt für Datenschutzfragen: tiimmme@gmail.com</p>
        </div>
      )
    }
  };

  const current = content[type];

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white">
              <current.icon className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">{current.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>
        <div className="p-8 max-h-[60vh] overflow-y-auto">
          {current.body}
        </div>
        <div className="p-6 bg-slate-50 text-center">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
};

export default Legal;
