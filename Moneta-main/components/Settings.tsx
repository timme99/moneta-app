
import React, { useState, useEffect } from 'react';
import { User, Shield, ChevronRight, Mail, LogOut, Target, Scale, Bell, CheckCircle2, Send, Loader2, Clock, FileText } from 'lucide-react';
import { UserAccount } from '../types';
import { emailService, EmailSettings } from '../services/emailService';

interface SettingsProps {
  account: UserAccount | null;
  onAccountUpdate?: (account: UserAccount | null) => void;
}

const Settings: React.FC<SettingsProps> = ({ account, onAccountUpdate }) => {
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(emailService.getSettings());
  const [emailInput, setEmailInput] = useState(emailSettings.email);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [reportPreview, setReportPreview] = useState<string | null>(null);

  useEffect(() => {
    setEmailSettings(emailService.getSettings());
  }, []);

  const handleSaveEmail = () => {
    const updated = { ...emailSettings, email: emailInput };
    emailService.saveSettings(updated);
    setEmailSettings(updated);
    setSendResult({ success: true, message: 'E-Mail gespeichert!' });
    setTimeout(() => setSendResult(null), 3000);
  };

  const handleToggleDailyReport = () => {
    const updated = { ...emailSettings, dailyReport: !emailSettings.dailyReport };
    emailService.saveSettings(updated);
    setEmailSettings(updated);
  };

  const handleToggleWeeklyDigest = () => {
    const updated = { ...emailSettings, weeklyDigest: !emailSettings.weeklyDigest };
    emailService.saveSettings(updated);
    setEmailSettings(updated);
  };

  const handleSendTestReport = async () => {
    if (!emailInput) {
      setSendResult({ success: false, message: 'Bitte E-Mail-Adresse eingeben.' });
      return;
    }

    setIsSending(true);
    setSendResult(null);
    setReportPreview(null);

    const userData = localStorage.getItem('moneta_db_mock');
    let holdings: any[] = [];
    let score = 0;
    let summary = '';

    if (userData) {
      const user = JSON.parse(userData);
      if (user.portfolioData?.report) {
        holdings = user.portfolioData.report.holdings || [];
        score = user.portfolioData.report.score || 0;
        summary = user.portfolioData.report.summary || '';
      }
    }

    if (holdings.length === 0) {
      setSendResult({ success: false, message: 'Kein Portfolio vorhanden. Bitte zuerst eine Analyse durchführen.' });
      setIsSending(false);
      return;
    }

    const result = await emailService.sendDailyReport(emailInput, holdings, score, summary);
    setSendResult({ success: result.success, message: result.message });

    if (result.html) {
      setReportPreview(result.html);
    }

    setIsSending(false);
  };

  const SettingItem = ({ icon: Icon, label, value, isActive, onClick }: any) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-all group border-b border-slate-100 last:border-0"
    >
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
            {account ? 'Ihr Portfolio wird sicher in der Datenbank gespeichert.' : 'Konfigurieren Sie Ihre Moneta-Einstellungen.'}
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

        {/* E-Mail & Täglicher Bericht */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">E-Mail & Täglicher Bericht</span>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">E-Mail-Adresse für Berichte</label>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="deine@email.de"
                  className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium"
                />
                <button
                  onClick={handleSaveEmail}
                  className="px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all"
                >
                  Speichern
                </button>
              </div>
            </div>

            <SettingItem
              icon={Mail}
              label="Täglicher Depot-Bericht"
              value={emailSettings.dailyReport ? 'Jeden Morgen um 8:00 Uhr' : 'Deaktiviert'}
              isActive={emailSettings.dailyReport}
              onClick={handleToggleDailyReport}
            />

            <SettingItem
              icon={Bell}
              label="Wöchentliche Zusammenfassung"
              value={emailSettings.weeklyDigest ? 'Jeden Montag' : 'Deaktiviert'}
              isActive={emailSettings.weeklyDigest}
              onClick={handleToggleWeeklyDigest}
            />

            {emailSettings.lastSent && (
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Letzter Versand: {new Date(emailSettings.lastSent).toLocaleString('de-DE')}
                </span>
              </div>
            )}

            <button
              onClick={handleSendTestReport}
              disabled={isSending || !emailInput}
              className="w-full flex items-center justify-center gap-3 p-5 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
            >
              {isSending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Bericht wird erstellt...</>
              ) : (
                <><Send className="w-4 h-4" /> Test-Bericht jetzt senden</>
              )}
            </button>

            {sendResult && (
              <div className={`p-4 rounded-2xl text-sm font-bold flex items-center gap-3 ${
                sendResult.success
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-100'
              }`}>
                {sendResult.success ? <CheckCircle2 className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                {sendResult.message}
              </div>
            )}

            {reportPreview && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bericht-Vorschau</span>
                </div>
                <div
                  className="bg-white border border-slate-200 rounded-2xl p-6 overflow-auto max-h-[500px] shadow-inner"
                  dangerouslySetInnerHTML={{ __html: reportPreview }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Weitere Benachrichtigungen */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Weitere Benachrichtigungen</span>
          </div>
          <div>
            <SettingItem icon={Target} label="Preis-Alarme" value="Info bei großen Kursänderungen" isActive={true} />
            <SettingItem icon={Scale} label="Rechtliche Updates" value="Aktiv" />
          </div>
        </div>

        {account ? (
          <button
            onClick={() => {
              localStorage.clear();
              if (onAccountUpdate) onAccountUpdate(null);
              window.location.reload();
            }}
            className="w-full flex items-center justify-center gap-3 p-6 bg-rose-50 text-rose-600 rounded-[32px] font-black uppercase tracking-widest text-[10px] hover:bg-rose-100 transition-all"
          >
            <LogOut className="w-4 h-4" /> Abmelden & Session beenden
          </button>
        ) : (
          <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-xl shadow-blue-500/20 text-center">
            <h4 className="font-black text-lg mb-2">Cloud-Features nutzen</h4>
            <p className="text-xs text-blue-100 mb-6 leading-relaxed">
              Registrieren Sie sich, um Ihr Portfolio auf allen Geräten zu synchronisieren und automatische KI-Analysen per E-Mail zu erhalten.
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
