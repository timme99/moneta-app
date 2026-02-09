
import React from 'react';
import { User, Shield, Wallet, ChevronRight, Mail, LogOut, Target, Scale, Bell, CheckCircle2 } from 'lucide-react';
import { UserAccount } from '../types';

interface SettingsProps {
  account: UserAccount | null;
}

const Settings: React.FC<SettingsProps> = ({ account }) => {
  const SettingItem = ({ icon: Icon, label, value, isActive }: any) => (
    <button className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-all group border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-6">
        <div className={`bg-white border p-3 rounded-2xl transition-all ${isActive ? 'border-blue-300 bg-blue-50' : 'border-slate-200 group-hover:border-blue-300 group-hover:bg-blue-50'}`}>
          <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600'}`} />
        </div>
        <div className="text-left">
          <h4 className="font-black text-slate-900 text-sm tracking-tight">{label}</h4>
          <p className="text-xs text-slate-500 font-medium">{value}</p>
        </div>
      </div>
      {isActive ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 transition-all" />}
    </button>
  );

  const sections = [
    {
      title: 'Konto & Sicherheit',
      items: [
        { icon: User, label: 'Benutzername', value: account?.name || 'Gast-Modus' },
        { icon: Mail, label: 'E-Mail & Magic-Link', value: account?.email || 'Nicht registriert' },
        { icon: Shield, label: 'Datenbank-Status', value: account ? 'Cloud Sync Aktiv' : 'Nur Lokal gespeichert', isActive: !!account }
      ]
    },
    {
      title: 'Benachrichtigungen & Automation',
      items: [
        { icon: Bell, label: 'KI-Wochenbericht', value: 'Automatische Depot-Analyse per Mail', isActive: account?.settings.weeklyDigest },
        { icon: Target, label: 'Preis-Alarme', value: 'Info bei großen Kursänderungen', isActive: true },
        { icon: Scale, label: 'Rechtliche Updates', value: 'Aktiv' }
      ]
    }
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
      <div className="flex items-center gap-6 mb-12">
        <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center text-white text-3xl font-black shadow-2xl">
          {account?.name?.[0]?.toUpperCase() || 'G'}
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{account ? `Hallo, ${account.name}` : 'Einstellungen'}</h1>
          <p className="text-sm font-medium text-slate-500">
            {account ? 'Ihr Portfolio wird sicher in der Datenbank gespeichert.' : 'Registrieren Sie sich, um Ihre Daten in der Cloud zu speichern.'}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{section.title}</span>
            </div>
            <div>
              {section.items.map((item, i) => (
                <SettingItem key={i} {...item} />
              ))}
            </div>
          </div>
        ))}

        {account ? (
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            className="w-full flex items-center justify-center gap-3 p-6 bg-rose-50 text-rose-600 rounded-[32px] font-black uppercase tracking-widest text-[10px] hover:bg-rose-100 transition-all"
          >
            <LogOut className="w-4 h-4" /> Abmelden & Session beenden
          </button>
        ) : (
          <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-xl shadow-blue-500/20 text-center">
            <h4 className="font-black text-lg mb-2">Cloud-Features nutzen</h4>
            <p className="text-xs text-blue-100 mb-6 leading-relaxed">
              Registrieren Sie sich, um Ihr Portfolio auf allen Geräten zu synchronisieren und wöchentliche KI-Analysen per E-Mail zu erhalten.
            </p>
            <button className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-50 transition-all">
              Jetzt Konto erstellen
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
