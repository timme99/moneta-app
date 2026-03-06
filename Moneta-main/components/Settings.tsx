
import React, { useState, useEffect } from 'react';
import { User, Shield, ChevronRight, Mail, LogOut, Target, Scale, Bell, Loader2, ToggleLeft, ToggleRight, CheckCircle2 } from 'lucide-react';
import { UserAccount } from '../types';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';

interface SettingsProps {
  account: UserAccount | null;
  onOpenAuth?: () => void;
}

type PrefColumn = 'weekly_digest_enabled' | 'newsletter_subscribed';

const Settings: React.FC<SettingsProps> = ({ account, onOpenAuth }) => {
  const sb = getSupabaseBrowser();

  // Always start false – real values are loaded from Supabase in the useEffect below.
  const [weeklyDigest,   setWeeklyDigest]   = useState(false);
  const [autoNewsletter, setAutoNewsletter] = useState(false);
  const [saving,  setSaving]  = useState<PrefColumn | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ── Unified fetch: pull both prefs from profiles table on mount ──────────
  useEffect(() => {
    if (!sb || !account) return;
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.id) return;
      const { data } = await sb
        .from('profiles')
        .select('weekly_digest_enabled, newsletter_subscribed')
        .eq('id', session.user.id)
        .single();
      if (data) {
        setWeeklyDigest((data as any).weekly_digest_enabled  ?? false);
        setAutoNewsletter((data as any).newsletter_subscribed ?? false);
      }
    });
  }, [account?.id]);

  // ── Unified update: one function for all boolean preference columns ───────
  const updatePreference = async (column: PrefColumn, value: boolean) => {
    if (!sb || !account) return;
    setSaving(column);
    setSaveMsg(null);

    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user?.id) { setSaving(null); return; }

    const { error } = await sb
      .from('profiles')
      .update({ [column]: value })
      .eq('id', session.user.id);

    if (!error) {
      if (column === 'weekly_digest_enabled') setWeeklyDigest(value);
      else setAutoNewsletter(value);
      setSaveMsg('Gespeichert ✓');
      setTimeout(() => setSaveMsg(null), 2000);
    } else {
      console.error('[Settings] updatePreference error:', error.message);
    }
    setSaving(null);
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  const SettingRow = ({ icon: Icon, label, value, isActive }: any) => (
    <div className="flex items-center justify-between p-6 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-6">
        <div className={`bg-white border p-3 rounded-2xl transition-all ${isActive ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
          <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
        </div>
        <div className="text-left">
          <h4 className="font-black text-slate-900 text-sm tracking-tight">{label}</h4>
          <p className="text-xs text-slate-500 font-medium">{value}</p>
        </div>
      </div>
      {isActive ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <ChevronRight className="w-5 h-5 text-slate-300" />}
    </div>
  );

  const ToggleRow = ({
    icon: Icon, label, value: description, isActive, column,
  }: {
    icon: any; label: string; value: string; isActive: boolean; column: PrefColumn;
  }) => (
    <div className="flex items-center justify-between p-6 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-6">
        <div className={`bg-white border p-3 rounded-2xl transition-all ${isActive ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
          <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
        </div>
        <div className="text-left">
          <h4 className="font-black text-slate-900 text-sm tracking-tight">{label}</h4>
          <p className="text-xs text-slate-500 font-medium">{description}</p>
        </div>
      </div>
      <button
        onClick={() => updatePreference(column, !isActive)}
        disabled={saving === column || !account}
        className="shrink-0 flex items-center gap-1.5 disabled:opacity-40 transition-opacity"
        title={account ? (isActive ? 'Deaktivieren' : 'Aktivieren') : 'Bitte zuerst anmelden'}
      >
        {saving === column
          ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          : isActive
            ? <ToggleRight className="w-7 h-7 text-blue-600" />
            : <ToggleLeft  className="w-7 h-7 text-slate-300" />}
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
      {/* Profil-Header */}
      <div className="flex items-center gap-6 mb-12">
        <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center text-white text-3xl font-black shadow-2xl">
          {account?.name?.[0]?.toUpperCase() || 'G'}
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {account ? `Hallo, ${account.name}` : 'Einstellungen'}
          </h1>
          <p className="text-sm font-medium text-slate-500">
            {account
              ? 'Ihr Portfolio wird sicher in der Datenbank gespeichert.'
              : 'Registrieren Sie sich, um Ihre Daten in der Cloud zu speichern.'}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Konto & Sicherheit */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Konto & Sicherheit</span>
          </div>
          <SettingRow icon={User}   label="Benutzername"       value={account?.name || 'Gast-Modus'} />
          <SettingRow icon={Mail}   label="E-Mail & Magic-Link" value={account?.email || 'Nicht registriert'} />
          <SettingRow
            icon={Shield}
            label="Datenbank-Status"
            value={account ? 'Cloud Sync Aktiv' : 'Nur Lokal gespeichert'}
            isActive={!!account}
          />
        </div>

        {/* Newsletter & Benachrichtigungen */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Newsletter & Benachrichtigungen
            </span>
            {saveMsg && (
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest animate-in fade-in duration-300">
                {saveMsg}
              </span>
            )}
          </div>

          {!account && (
            <div className="px-8 py-4 bg-amber-50 border-b border-amber-100">
              <p className="text-[11px] text-amber-700 font-medium">
                Anmeldung erforderlich, um Newsletter-Einstellungen zu speichern.
              </p>
            </div>
          )}

          <ToggleRow
            icon={Bell}
            label="KI-Wochenbericht"
            value="Automatische Depot-Analyse per Mail (jeden Montag)"
            isActive={weeklyDigest}
            column="weekly_digest_enabled"
          />
          <ToggleRow
            icon={Target}
            label="Markt-Updates"
            value="Sofortige Info bei wichtigen Kursänderungen"
            isActive={autoNewsletter}
            column="newsletter_subscribed"
          />
          <SettingRow icon={Scale} label="Rechtliche Updates" value="Aktiv" isActive={true} />
        </div>

        {/* Abmelden / Anmelden */}
        {account ? (
          <button
            onClick={async () => {
              if (sb) await sb.auth.signOut();
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
              Registrieren Sie sich, um Ihr Portfolio auf allen Geräten zu synchronisieren und wöchentliche KI-Analysen per E-Mail zu erhalten.
            </p>
            <button
              onClick={onOpenAuth}
              className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-50 transition-all"
            >
              Jetzt Konto erstellen / Anmelden
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
