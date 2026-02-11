
import React from 'react';
import { User, Shield, ChevronRight, Mail, LogOut, Target, Scale, Bell, CheckCircle2 } from 'lucide-react';
import { UserAccount } from '../types';
import { userService } from '../services/userService';
import EmailSettings from './EmailSettings';

interface SettingsProps {
  account: UserAccount | null;
  onLogout: () => void;
  onShowAuth: (mode: 'login' | 'register') => void;
  onAccountUpdate: (account: UserAccount) => void;
}

const Settings: React.FC<SettingsProps> = ({ account, onLogout, onShowAuth, onAccountUpdate }) => {
  const SettingItem = ({ icon: Icon, label, value, isActive }: any) => (
    <div className="w-full flex items-center justify-between p-6 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-6">
        <div className={`bg-white border p-3 rounded-2xl ${isActive ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
          <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
        </div>
        <div className="text-left">
          <h4 className="font-black text-slate-900 text-sm tracking-tight">{label}</h4>
          <p className="text-xs text-slate-500 font-medium">{value}</p>
        </div>
      </div>
      {isActive && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
    </div>
  );

  const handleLogout = () => {
    userService.logout();
    onLogout();
  };

  const accountSection = {
    title: 'Konto & Sicherheit',
    items: [
      { icon: User, label: 'Benutzername', value: account?.name || 'Gast-Modus' },
      { icon: Mail, label: 'E-Mail', value: account?.email || 'Nicht registriert' },
      { icon: Shield, label: 'Kontostatus', value: account ? `Erstellt: ${new Date(account.createdAt).toLocaleDateString('de-DE')}` : 'Nur Lokal gespeichert', isActive: !!account }
    ]
  };

  const notificationSection = {
    title: 'Benachrichtigungen & Automation',
    items: [
      { icon: Bell, label: 'Täglicher Report', value: account?.settings.dailyEmail ? `Aktiv – ${account.settings.dailyEmailTime} Uhr` : 'Deaktiviert', isActive: account?.settings.dailyEmail },
      { icon: Target, label: 'Preis-Alarme', value: 'Info bei großen Kursänderungen', isActive: true },
      { icon: Scale, label: 'Rechtliche Updates', value: 'Aktiv' }
    ]
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
      <div className="flex items-center gap-6 mb-12">
        <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center text-white text-3xl font-black shadow-2xl">
          {account?.name?.[0]?.toUpperCase() || 'G'}
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{account ? `Hallo, ${account.name}` : 'Einstellungen'}</h1>
          <p className="text-sm font-medium text-slate-500">
            {account ? 'Verwalten Sie Ihr Konto und Ihre Benachrichtigungen.' : 'Registrieren Sie sich, um alle Features zu nutzen.'}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Account Section */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{accountSection.title}</span>
          </div>
          <div>
            {accountSection.items.map((item, i) => (
              <SettingItem key={i} {...item} />
            ))}
          </div>
        </div>

        {/* Notification Section */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{notificationSection.title}</span>
          </div>
          <div>
            {notificationSection.items.map((item, i) => (
              <SettingItem key={i} {...item} />
            ))}
          </div>
        </div>

        {/* Email Settings (only for logged-in users) */}
        {account && (
          <EmailSettings account={account} onUpdate={onAccountUpdate} />
        )}

        {/* Logout / Register */}
        {account ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 p-6 bg-rose-50 text-rose-600 rounded-[32px] font-black uppercase tracking-widest text-[10px] hover:bg-rose-100 transition-all"
          >
            <LogOut className="w-4 h-4" /> Abmelden & Session beenden
          </button>
        ) : (
          <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-xl shadow-blue-500/20 text-center">
            <h4 className="font-black text-lg mb-2">Alle Features nutzen</h4>
            <p className="text-xs text-blue-100 mb-6 leading-relaxed">
              Registrieren Sie sich, um Ihr Portfolio zu speichern, tägliche E-Mail-Reports zu erhalten und auf allen Geräten zu synchronisieren.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => onShowAuth('register')}
                className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-50 transition-all"
              >
                Konto erstellen
              </button>
              <button
                onClick={() => onShowAuth('login')}
                className="px-8 py-4 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-400 transition-all border border-blue-400"
              >
                Anmelden
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
