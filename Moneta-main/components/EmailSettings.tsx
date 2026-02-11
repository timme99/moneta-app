
import React, { useState } from 'react';
import { Mail, Clock, CheckCircle2, Bell, Loader2, AlertCircle } from 'lucide-react';
import { UserAccount } from '../types';
import { userService } from '../services/userService';

interface EmailSettingsProps {
  account: UserAccount;
  onUpdate: (account: UserAccount) => void;
}

const EmailSettings: React.FC<EmailSettingsProps> = ({ account, onUpdate }) => {
  const [dailyEmail, setDailyEmail] = useState(account.settings.dailyEmail);
  const [emailTime, setEmailTime] = useState(account.settings.dailyEmailTime || '08:00');
  const [weeklyDigest, setWeeklyDigest] = useState(account.settings.weeklyDigest);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      await userService.updateSettings(account.id, {
        dailyEmail,
        dailyEmailTime: emailTime,
        weeklyDigest,
      });
      const updated = await userService.fetchUserData();
      if (updated) onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-xl text-white">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">E-Mail Benachrichtigungen</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Portfolio-Updates direkt ins Postfach</p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {/* Daily Email Toggle */}
        <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-black text-sm text-slate-900">Täglicher Portfolio-Report</h4>
              <p className="text-[11px] text-slate-500 font-medium">Kursänderungen, News und KI-Analyse</p>
            </div>
          </div>
          <button
            onClick={() => setDailyEmail(!dailyEmail)}
            className={`relative w-14 h-8 rounded-full transition-colors ${dailyEmail ? 'bg-blue-600' : 'bg-slate-200'}`}
          >
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${dailyEmail ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {dailyEmail && (
          <div className="flex items-center gap-4 p-5 bg-blue-50 rounded-2xl border border-blue-100">
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-bold text-blue-900 mb-2">Versandzeit wählen</p>
              <select
                value={emailTime}
                onChange={(e) => setEmailTime(e.target.value)}
                className="px-4 py-3 bg-white border border-blue-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="06:00">06:00 Uhr (Frühaufsteher)</option>
                <option value="08:00">08:00 Uhr (Empfohlen)</option>
                <option value="12:00">12:00 Uhr (Mittags)</option>
                <option value="18:00">18:00 Uhr (Feierabend)</option>
                <option value="21:00">21:00 Uhr (Abends)</option>
              </select>
            </div>
          </div>
        )}

        {/* Weekly Digest Toggle */}
        <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <Mail className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="font-black text-sm text-slate-900">Wöchentlicher Digest</h4>
              <p className="text-[11px] text-slate-500 font-medium">Zusammenfassung jeden Sonntag</p>
            </div>
          </div>
          <button
            onClick={() => setWeeklyDigest(!weeklyDigest)}
            className={`relative w-14 h-8 rounded-full transition-colors ${weeklyDigest ? 'bg-emerald-600' : 'bg-slate-200'}`}
          >
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${weeklyDigest ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {/* Info */}
        <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-2xl border border-amber-100">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
            E-Mails werden an <strong>{account.email}</strong> gesendet. Die E-Mail enthält Ihre aktuellen Portfolio-Kurse,
            relevante Nachrichten und eine KI-gestützte Tagesanalyse.
          </p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-[20px] font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-lg"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Gespeichert
            </>
          ) : (
            'Einstellungen speichern'
          )}
        </button>
      </div>
    </div>
  );
};

export default EmailSettings;
