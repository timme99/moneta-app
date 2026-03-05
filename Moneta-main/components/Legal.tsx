
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
        <div className="space-y-5 text-sm text-slate-600">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-blue-800 text-[11px] font-medium">
            Dieses Impressum gilt für die Webanwendung <strong>Moneta</strong>, erreichbar unter dieser Domain.
          </div>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Angaben gemäß § 5 TMG</h4>
            <p className="leading-relaxed">
              Tim Bischof<br />
              E-Mail: tiimmme@gmail.com
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)</h4>
            <p className="leading-relaxed">
              Tim Bischof<br />
              E-Mail: tiimmme@gmail.com
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Art des Angebots</h4>
            <p className="leading-relaxed text-[12px]">
              Moneta ist ein <strong>privates, nicht-kommerzielles Bildungsprojekt</strong>. Es werden keine Finanzdienstleistungen im Sinne des Kreditwesengesetzes (KWG) oder des Wertpapierinstitutsgesetzes (WpIG) erbracht. Das Angebot richtet sich ausschließlich an volljährige Privatpersonen zu Bildungs- und Informationszwecken.
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Kein Anlageberatungsangebot</h4>
            <p className="leading-relaxed text-[12px]">
              Alle Inhalte dieser Webanwendung dienen ausschließlich der allgemeinen Information und Finanzbildung. Sie stellen <strong>keine Anlageberatung, keine Anlageempfehlung, keine Finanzanalyse</strong> und kein sonstiges nach KWG oder WpIG erlaubnispflichtiges Geschäft dar. Handeln Sie niemals ausschließlich auf Basis von KI-generierten Informationen. Konsultieren Sie vor Anlageentscheidungen stets einen zugelassenen Finanzberater.
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Haftungsausschluss für externe Links</h4>
            <p className="leading-relaxed text-[12px]">
              Diese Website enthält möglicherweise Links zu externen Webseiten Dritter. Auf deren Inhalte haben wir keinen Einfluss und übernehmen dafür keine Gewähr.
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Urheberrecht</h4>
            <p className="leading-relaxed text-[12px]">
              Die durch den Betreiber erstellten Inhalte unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung oder Verbreitung ohne ausdrückliche Zustimmung des Betreibers ist untersagt.
            </p>
          </section>
        </div>
      )
    },
    disclaimer: {
      title: 'Haftungsausschluss',
      icon: ShieldAlert,
      body: (
        <div className="space-y-4 text-sm text-slate-600">
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-700 font-bold mb-4 flex gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p>Kein Anlageberatungsangebot – ausschließlich allgemeine Finanzinformation zu Bildungszwecken.</p>
          </div>

          <p className="font-semibold text-slate-800">Keine Anlageberatung (§ 2 Abs. 2 WpIG / § 1 Abs. 1a KWG)</p>
          <p className="text-[12px] leading-relaxed">
            Sämtliche von Moneta bereitgestellten Analysen, Informationen, Texte, Grafiken und KI-generierten Inhalte dienen <strong>ausschließlich der allgemeinen Information und Finanzbildung</strong>. Sie stellen keine Anlageberatung, Anlageempfehlung, Finanzanalyse, Anlagevermittlung, Abschlussvermittlung oder sonstige Finanzdienstleistung gemäß KWG oder WpIG dar. Moneta verfügt über keine Zulassung der BaFin.
          </p>

          <p className="font-semibold text-slate-800">Risikohinweis</p>
          <p className="text-[12px] leading-relaxed">
            Investitionen in Wertpapiere (Aktien, ETFs, Anleihen u. ä.) sind mit erheblichen Risiken verbunden. Kurse können stark schwanken. Im schlimmsten Fall ist ein Totalverlust des eingesetzten Kapitals möglich. Vergangene Wertentwicklungen sind <strong>kein verlässlicher Indikator</strong> für zukünftige Entwicklungen.
          </p>

          <p className="font-semibold text-slate-800">KI-generierte Inhalte</p>
          <p className="text-[12px] leading-relaxed">
            Analysen werden durch KI-Modelle (Google Gemini) erstellt und können Fehler, Unvollständigkeiten oder veraltete Informationen enthalten. Für die Richtigkeit, Vollständigkeit oder Aktualität wird keine Haftung übernommen.
          </p>

          <p className="font-semibold text-slate-800">Empfehlung</p>
          <p className="text-[12px] leading-relaxed">
            Handeln Sie niemals ausschließlich auf Basis von KI-generierten Analysen. Konsultieren Sie vor jeder Anlageentscheidung einen zugelassenen Finanzberater (z. B. mit MiFID-II-Zulassung).
          </p>
        </div>
      )
    },
    privacy: {
      title: 'Datenschutz',
      icon: Scale,
      body: (
        <div className="space-y-4 text-sm text-slate-600">
          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Verantwortlicher (Art. 4 Nr. 7 DSGVO)</h4>
            <p>Tim Bischof · tiimmme@gmail.com</p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Erhobene Daten</h4>
            <p className="text-[12px] leading-relaxed">
              Ohne Anmeldung speichert Moneta keine personenbezogenen Daten auf externen Servern. Bei aktivierter Cloud-Synchronisation werden Ihre Depot-Daten (Ticker-Symbole, Stückzahlen, Kaufpreise) sowie Ihre E-Mail-Adresse (zur Authentifizierung) in einer Supabase-Datenbank (EU-Server, Frankfurt/Irland) gespeichert. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Drittanbieter / KI-Verarbeitung</h4>
            <p className="text-[12px] leading-relaxed">
              Für KI-Analysen werden Depot-Daten (Ticker-Symbole, ISINs) an die Google Gemini API übertragen. Es werden keine Namen oder sonstige direkt personenidentifizierbare Daten übermittelt. Google LLC ist EU-Standard-Vertragsklauseln unterworfen. Weitere Informationen:{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                Google Datenschutzrichtlinie
              </a>.
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Ihre Rechte (Art. 15–21 DSGVO)</h4>
            <p className="text-[12px] leading-relaxed">
              Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Anfragen richten Sie bitte an: tiimmme@gmail.com. Sie haben außerdem das Recht, sich bei der zuständigen Datenschutzaufsichtsbehörde zu beschweren.
            </p>
          </section>

          <section>
            <h4 className="font-black text-slate-900 uppercase text-[10px] tracking-widest mb-2">Cookies & Tracking</h4>
            <p className="text-[12px] leading-relaxed">
              Moneta setzt ausschließlich technisch notwendige Cookies (Authentifizierungs-Token, Session-Management). Es werden keine Tracking- oder Werbe-Cookies verwendet. Es findet kein Analytics-Tracking statt.
            </p>
          </section>
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
