
import React, { useState, useEffect, useRef } from 'react';
import {
  User, Shield, Mail, LogOut, Target, Scale, Bell,
  Loader2, ToggleLeft, ToggleRight, CheckCircle2,
  Pencil, X, AlertTriangle, Cloud, CloudOff, Trash2,
} from 'lucide-react';
import { UserAccount } from '../types';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';

interface SettingsProps {
  account: UserAccount | null;
  onOpenAuth?: () => void;
  /** Called after a successful name save so App.tsx can re-sync displayName. */
  onProfileRefresh?: (userId?: string) => Promise<void>;
}

type BoolPrefColumn =
  | 'weekly_digest_enabled'
  | 'newsletter_subscribed'
  | 'cloud_sync_enabled'
  | 'legal_updates_enabled';

// ── Helpers ──────────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: { text: string; error?: boolean } | null }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-[500] flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold shadow-lg animate-in slide-in-from-bottom-4 duration-300 ${
      toast.error ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
    }`}>
      {toast.error ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
      {toast.text}
    </div>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────

interface DeleteModalProps {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}
function DeleteModal({ onCancel, onConfirm, isDeleting }: DeleteModalProps) {
  const [input, setInput] = useState('');
  const confirmed = input.trim().toUpperCase() === 'LÖSCHEN';

  return (
    <div className="fixed inset-0 z-[400] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl sm:rounded-[32px] shadow-2xl w-[95vw] max-w-md p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl">
            <Trash2 className="w-6 h-6 text-rose-600" />
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-900">Konto unwiderruflich löschen</h3>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Damit werden dein Konto, alle Depot-Positionen und dein Profil <strong>permanent</strong> gelöscht.
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Tippe <span className="text-rose-600">LÖSCHEN</span> zur Bestätigung
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="LÖSCHEN"
            autoFocus
            className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-base font-medium focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50 transition-all"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || isDeleting}
            className="flex-1 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {isDeleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const Settings: React.FC<SettingsProps> = ({ account, onOpenAuth, onProfileRefresh }) => {
  const sb = getSupabaseBrowser();

  // ── Profile-edit state ────────────────────────────────────────────────────
  const [displayName,  setDisplayName]  = useState(account?.name  ?? '');
  const [editingName,  setEditingName]  = useState(false);
  const [nameInput,    setNameInput]    = useState('');

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput,   setEmailInput]   = useState('');

  // ── Boolean preferences – start false/true; real values loaded from DB ──
  const [weeklyDigest,   setWeeklyDigest]   = useState(false);
  const [autoNewsletter, setAutoNewsletter] = useState(false);
  const [cloudSync,      setCloudSync]      = useState(true);   // default ON
  const [legalUpdates,   setLegalUpdates]   = useState(true);   // default ON (GDPR)

  // ── Cloud-sync offline warning ────────────────────────────────────────────
  const [showSyncWarning, setShowSyncWarning] = useState(false);

  // ── Generic saving/toast ──────────────────────────────────────────────────
  const [saving, setSaving] = useState<string | null>(null);
  const [toast,  setToast]  = useState<{ text: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Delete-account state ──────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting,      setIsDeleting]      = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const flash = (text: string, error = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const getSession = async () => {
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    return session;
  };

  // ── Load all preferences from Supabase on mount ───────────────────────────
  useEffect(() => {
    if (!sb || !account) return;
    setDisplayName(account.name ?? '');

    getSession().then(async (session) => {
      if (!session?.user?.id) return;
      const { data } = await sb
        .from('profiles')
        .select('full_name, weekly_digest_enabled, newsletter_subscribed, cloud_sync_enabled, legal_updates_enabled')
        .eq('id', session.user.id)
        .single();
      if (!data) return;
      const d = data as any;
      if (d.full_name)           setDisplayName(d.full_name);
      if (d.weekly_digest_enabled  != null) setWeeklyDigest(d.weekly_digest_enabled);
      if (d.newsletter_subscribed  != null) setAutoNewsletter(d.newsletter_subscribed);
      if (d.cloud_sync_enabled     != null) setCloudSync(d.cloud_sync_enabled);
      if (d.legal_updates_enabled  != null) setLegalUpdates(d.legal_updates_enabled);
    });
  }, [account?.id]);

  // ── Save display name ─────────────────────────────────────────────────────
  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !sb) return;
    setSaving('name');
    const session = await getSession();
    if (!session?.user?.id) { setSaving(null); return; }
    const { error } = await sb.from('profiles').update({ full_name: trimmed }).eq('id', session.user.id);
    setSaving(null);
    if (error) { flash('Fehler beim Speichern des Namens', true); return; }
    setDisplayName(trimmed);
    setEditingName(false);
    flash('Name gespeichert ✓');
    // Sync the new name up to App.tsx so Header avatar updates immediately
    onProfileRefresh?.(session.user.id);
  };

  // ── Save email (Supabase sends confirmation to new address) ───────────────
  const saveEmail = async () => {
    const trimmed = emailInput.trim();
    if (!trimmed || !sb) return;
    setSaving('email');
    const { error } = await sb.auth.updateUser({ email: trimmed });
    setSaving(null);
    if (error) { flash(error.message, true); return; }
    setEditingEmail(false);
    flash('Bestätigungs-Link an neue E-Mail gesendet ✓');
  };

  // ── Boolean preference toggle ─────────────────────────────────────────────
  const updatePreference = async (column: BoolPrefColumn, value: boolean) => {
    if (!sb || !account) return;
    setSaving(column);
    const session = await getSession();
    if (!session?.user?.id) { setSaving(null); return; }

    const { error } = await sb.from('profiles').update({ [column]: value }).eq('id', session.user.id);
    setSaving(null);

    if (error) { flash('Fehler beim Speichern', true); return; }

    const setters: Record<BoolPrefColumn, (v: boolean) => void> = {
      weekly_digest_enabled:  setWeeklyDigest,
      newsletter_subscribed:  setAutoNewsletter,
      cloud_sync_enabled:     setCloudSync,
      legal_updates_enabled:  setLegalUpdates,
    };
    setters[column](value);
    flash('Gespeichert ✓');

    if (column === 'cloud_sync_enabled') setShowSyncWarning(!value);
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const deleteAccount = async () => {
    if (!sb) return;
    setIsDeleting(true);
    const session = await getSession();
    if (!session?.access_token) { setIsDeleting(false); return; }

    const resp = await fetch('/api/auth/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      setIsDeleting(false);
      setShowDeleteModal(false);
      flash(body.error ?? 'Löschen fehlgeschlagen', true);
      return;
    }

    await sb.auth.signOut();
    window.location.reload();
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  const ToggleRow = ({
    icon: Icon, label, description, isActive, column, warningOff,
  }: {
    icon: any; label: string; description: string;
    isActive: boolean; column: BoolPrefColumn; warningOff?: string;
  }) => (
    <div className="flex items-start justify-between px-5 py-5 sm:p-6 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-4 min-w-0">
        <div className={`bg-white border p-3 rounded-2xl mt-0.5 transition-all shrink-0 ${isActive ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
          <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
        </div>
        <div className="min-w-0">
          <h4 className="font-black text-slate-900 text-sm tracking-tight">{label}</h4>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">{description}</p>
          {warningOff && !isActive && (
            <p className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" /> {warningOff}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={() => updatePreference(column, !isActive)}
        disabled={saving === column || !account}
        className="shrink-0 flex items-center gap-1.5 disabled:opacity-40 transition-opacity ml-4 mt-0.5 min-h-[44px] min-w-[44px] justify-center"
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Toast toast={toast} />
      {showDeleteModal && (
        <DeleteModal
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={deleteAccount}
          isDeleting={isDeleting}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-28">

        {/* ── Profile Header ── */}
        <div className="flex items-center gap-6 mb-10">
          <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center text-white text-3xl font-black shadow-2xl shrink-0">
            {displayName?.[0]?.toUpperCase() || account?.email?.[0]?.toUpperCase() || 'G'}
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              {account ? `Hallo, ${displayName || account.name}` : 'Einstellungen'}
            </h1>
            <p className="text-sm font-medium text-slate-500">
              {account
                ? (cloudSync ? 'Portfolio wird sicher in der Cloud gespeichert.' : 'Cloud-Sync deaktiviert – nur lokale Daten.')
                : 'Registrieren Sie sich, um Ihre Daten in der Cloud zu speichern.'}
            </p>
          </div>
        </div>

        {/* ── Konto & Profil ── */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Konto & Profil</span>
          </div>

          {/* Username */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-white border border-slate-200 p-3 rounded-2xl shrink-0">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-slate-900 text-sm tracking-tight">Anzeigename</h4>
                  {editingName ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        autoFocus
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                        placeholder={displayName}
                        className="text-base border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium w-44 min-h-[44px]"
                      />
                      <button onClick={saveName} disabled={saving === 'name' || !nameInput.trim()} className="text-blue-600 hover:text-blue-800 disabled:opacity-40 transition-colors">
                        {saving === 'name' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setEditingName(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 font-medium truncate">{displayName || account?.name || 'Kein Name gesetzt'}</p>
                  )}
                </div>
              </div>
              {account && !editingName && (
                <button
                  onClick={() => { setNameInput(displayName); setEditingName(true); }}
                  className="shrink-0 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                  title="Name bearbeiten"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-white border border-slate-200 p-3 rounded-2xl shrink-0">
                  <Mail className="w-5 h-5 text-slate-400" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-slate-900 text-sm tracking-tight">E-Mail-Adresse</h4>
                  {editingEmail ? (
                    <div className="space-y-1.5 mt-1">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEmail(); if (e.key === 'Escape') setEditingEmail(false); }}
                          placeholder="neue@email.de"
                          className="text-base border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium w-44 min-h-[44px]"
                        />
                        <button onClick={saveEmail} disabled={saving === 'email' || !emailInput.trim()} className="text-blue-600 hover:text-blue-800 disabled:opacity-40 transition-colors">
                          {saving === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setEditingEmail(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[11px] text-amber-600 font-medium">
                        Supabase sendet einen Bestätigungs-Link an die neue Adresse.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 font-medium truncate">{account?.email || 'Nicht registriert'}</p>
                  )}
                </div>
              </div>
              {account && !editingEmail && (
                <button
                  onClick={() => { setEmailInput(''); setEditingEmail(true); }}
                  className="shrink-0 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                  title="E-Mail ändern"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Cloud Sync toggle */}
          <ToggleRow
            icon={cloudSync ? Cloud : CloudOff}
            label="Cloud-Sync"
            description="Portfolio & Einstellungen auf allen Geräten synchronisieren"
            isActive={cloudSync}
            column="cloud_sync_enabled"
            warningOff="Achtung: Daten werden nicht mehr in der Cloud gesichert."
          />
        </div>

        {/* ── Datenschutz & DSGVO ── */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Datenschutz & DSGVO</span>
          </div>
          <ToggleRow
            icon={Scale}
            label="Rechtliche Mitteilungen"
            description="Wichtige Änderungen der AGB, Datenschutzerklärung und Pflichthinweise (DSGVO)"
            isActive={legalUpdates}
            column="legal_updates_enabled"
          />
        </div>

        {/* ── Newsletter & Benachrichtigungen ── */}
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Newsletter & Benachrichtigungen</span>
          </div>

          {!account && (
            <div className="px-8 py-4 bg-amber-50 border-b border-amber-100">
              <p className="text-[11px] text-amber-700 font-medium">
                Anmeldung erforderlich, um Benachrichtigungseinstellungen zu speichern.
              </p>
            </div>
          )}

          <ToggleRow
            icon={Bell}
            label="KI-Wochenbericht"
            description="Automatische Depot-Analyse per E-Mail (jeden Montag)"
            isActive={weeklyDigest}
            column="weekly_digest_enabled"
          />
          <ToggleRow
            icon={Target}
            label="Markt-Updates"
            description="Sofortige Info bei wichtigen Kursänderungen in deinem Depot"
            isActive={autoNewsletter}
            column="newsletter_subscribed"
          />
        </div>

        {/* ── Session & Account actions ── */}
        {account ? (
          <div className="space-y-3">
            {/* Logout – muted */}
            <button
              onClick={async () => { if (sb) await sb.auth.signOut(); window.location.reload(); }}
              className="w-full flex items-center justify-center gap-3 p-5 bg-slate-100 text-slate-600 rounded-[28px] font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all border border-slate-200"
            >
              <LogOut className="w-4 h-4" /> Abmelden & Session beenden
            </button>

            {/* Danger zone separator */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Gefahrenzone</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            {/* Delete Account – strong red */}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center justify-center gap-3 p-5 bg-rose-600 text-white rounded-[28px] font-black uppercase tracking-widest text-[10px] hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20"
            >
              <Trash2 className="w-4 h-4" /> Konto löschen
            </button>
          </div>
        ) : (
          <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-xl shadow-blue-500/20 text-center">
            <h4 className="font-black text-lg mb-2">Cloud-Features nutzen</h4>
            <p className="text-xs text-blue-100 mb-6 leading-relaxed">
              Registrieren Sie sich, um Ihr Portfolio auf allen Geräten zu synchronisieren
              und wöchentliche KI-Analysen per E-Mail zu erhalten.
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
    </>
  );
};

export default Settings;
