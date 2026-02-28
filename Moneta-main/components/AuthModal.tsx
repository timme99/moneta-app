
import React, { useState } from 'react';
import { X, Mail, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import type { UserAccount } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: UserAccount) => void; // wird von App via onAuthStateChange übernommen
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail]               = useState('');
  const [sent, setSent]                 = useState(false);
  const [isEmailLoading, setEmailLoad]  = useState(false);
  const [isGoogleLoading, setGoogleLoad] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  if (!isOpen) return null;

  const sb = getSupabaseBrowser();

  // ── Magic Link ─────────────────────────────────────────────────────────────
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb || !email.trim()) return;
    setEmailLoad(true);
    setError(null);
    const { error: err } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setEmailLoad(false);
    if (err) setError(err.message);
    else     setSent(true);
  };

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    if (!sb) return;
    setGoogleLoad(true);
    setError(null);
    const { error: err } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      setError(err.message);
      setGoogleLoad(false);
    }
    // Erfolg: Seite wird zu Google weitergeleitet – kein weiterer Code nötig
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300 border border-white/20">

        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Anmelden</h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Sichere dein Depot und erhalte KI-Analysen per E-Mail
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8">
          {sent ? (
            /* ── Bestätigung nach Magic Link ── */
            <div className="text-center space-y-5 py-4">
              <div className="flex justify-center">
                <div className="bg-emerald-50 p-5 rounded-[28px] border border-emerald-100">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900">E-Mail verschickt!</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Bitte prüfe dein Postfach für <span className="font-bold text-slate-700">{email}</span>
                  {' '}und klicke auf den Magic Link.
                </p>
                <p className="text-[11px] text-slate-400 font-medium">
                  Du wirst automatisch eingeloggt – dieses Fenster kann geschlossen werden.
                </p>
              </div>
              <button
                onClick={() => { setSent(false); setEmail(''); setError(null); }}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                Andere E-Mail-Adresse verwenden
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* ── Google Button ── */}
              {sb ? (
                <button
                  onClick={handleGoogle}
                  disabled={isGoogleLoading || isEmailLoading}
                  className="w-full flex items-center justify-center gap-3 py-4 px-6 border border-slate-200 rounded-[20px] text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 shadow-sm"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  ) : (
                    /* Google-Logo SVG */
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Weiter mit Google
                </button>
              ) : (
                <div className="text-center text-xs text-amber-600 bg-amber-50 p-3 rounded-2xl border border-amber-100 font-medium">
                  Supabase nicht konfiguriert – bitte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY setzen.
                </div>
              )}

              {/* ── Divider ── */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">oder per E-Mail</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              {/* ── Magic Link Form ── */}
              <form onSubmit={handleMagicLink} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="deine@email.de"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm font-medium transition-all"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-rose-600 text-xs font-bold bg-rose-50 p-3 rounded-2xl border border-rose-100">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isEmailLoading || isGoogleLoading || !sb}
                  className="w-full bg-slate-900 text-white py-4 rounded-[20px] font-black uppercase tracking-[0.15em] text-[10px] flex items-center justify-center gap-3 hover:bg-blue-600 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50"
                >
                  {isEmailLoading
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <><Mail className="w-4 h-4" /> Magic Link senden <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              <p className="text-center text-[10px] text-slate-400 font-medium">
                Kein Passwort nötig · Sicher per Einmal-Link
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
