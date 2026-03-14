
import React, { useState, useEffect, useRef } from 'react';
import { Bell, TrendingUp, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { UserAccount } from '../types';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';

interface Props {
  account: UserAccount | null;
}

type PrefKey = 'weeklyReport' | 'dailyDigest';

interface ToggleRowProps {
  icon: React.ElementType;
  label: string;
  description: string;
  isActive: boolean;
  prefKey: PrefKey;
  saving: boolean;
  onToggle: (key: PrefKey, value: boolean) => void;
}

function ToggleRow({ icon: Icon, label, description, isActive, prefKey, saving, onToggle }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-slate-500" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-800 leading-tight">{label}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onToggle(prefKey, !isActive)}
        disabled={saving}
        className="shrink-0 transition-transform active:scale-95"
        aria-label={isActive ? `${label} deaktivieren` : `${label} aktivieren`}
      >
        {saving
          ? <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
          : isActive
            ? <ToggleRight className="w-8 h-8 text-emerald-500" />
            : <ToggleLeft  className="w-8 h-8 text-slate-300" />
        }
      </button>
    </div>
  );
}

const NewsletterQuickToggle: React.FC<Props> = ({ account }) => {
  const sb = getSupabaseBrowser();
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [dailyDigest,  setDailyDigest]  = useState(false);
  const [saving,       setSaving]       = useState<string | null>(null);
  const [toast,        setToast]        = useState<{ text: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (text: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // Load preferences from Supabase on mount
  useEffect(() => {
    if (!sb || !account?.id) return;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user?.id || cancelled) return;

      const { data, error } = await sb
        .from('profiles')
        .select('preferences')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled || error || !data) return;
      const prefs = ((data as any).preferences ?? {}) as Record<string, boolean | undefined>;
      if (prefs.weeklyReport != null) setWeeklyDigest(!!prefs.weeklyReport);
      if (prefs.dailyDigest  != null) setDailyDigest(!!prefs.dailyDigest);
    })();

    return () => { cancelled = true; };
  }, [account?.id]);

  const handleToggle = async (key: PrefKey, value: boolean) => {
    if (!sb || !account) return;
    setSaving(key);
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user?.id) { setSaving(null); return; }

    const { error } = await sb.rpc('merge_user_preference', {
      p_user_id: session.user.id,
      p_key:     key,
      p_value:   value,
    });
    setSaving(null);

    if (error) { flash('Fehler beim Speichern', true); return; }
    if (key === 'weeklyReport') setWeeklyDigest(value);
    if (key === 'dailyDigest')  setDailyDigest(value);
    flash('Gespeichert ✓');
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Newsletter</span>
        {toast && (
          <span className={`text-[10px] font-bold ${toast.error ? 'text-rose-500' : 'text-emerald-600'}`}>
            {toast.text}
          </span>
        )}
      </div>

      {!account ? (
        <p className="text-[11px] text-slate-400 py-2">
          Bitte anmelden, um Newsletter-Einstellungen zu speichern.
        </p>
      ) : (
        <>
          <ToggleRow
            icon={Bell}
            label="KI-Wochenbericht"
            description="Automatische Depot-Analyse per E-Mail (jeden Montag)"
            isActive={weeklyDigest}
            prefKey="weeklyReport"
            saving={saving === 'weeklyReport'}
            onToggle={handleToggle}
          />
          <ToggleRow
            icon={TrendingUp}
            label="Täglicher Depot-Überblick"
            description="Tagesabschluss mit Depotwert & Performance (täglich 22 Uhr)"
            isActive={dailyDigest}
            prefKey="dailyDigest"
            saving={saving === 'dailyDigest'}
            onToggle={handleToggle}
          />
        </>
      )}
    </div>
  );
};

export default NewsletterQuickToggle;
