
import React, { useState } from 'react';
import { X, Mail, User, Lock, ArrowRight, Loader2, ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { userService } from '../services/userService';
import { UserAccount } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: UserAccount) => void;
  initialMode?: 'login' | 'register';
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin, initialMode = 'register' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail('');
    setName('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (password.length < 6) {
          throw new Error('Das Passwort muss mindestens 6 Zeichen lang sein.');
        }
        if (password !== confirmPassword) {
          throw new Error('Die Passwörter stimmen nicht überein.');
        }
        const user = await userService.register(email, name, password);
        onLogin(user);
        onClose();
      } else {
        const user = await userService.login(email, password);
        onLogin(user);
        onClose();
      }
    } catch (e: any) {
      setError(e.message || 'Ein Fehler ist aufgetreten.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300 border border-white/20">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white">
              {mode === 'login' ? <Lock className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            {mode === 'login'
              ? 'Melden Sie sich an, um auf Ihr gespeichertes Portfolio zuzugreifen.'
              : 'Erstellen Sie ein Konto, um Ihr Portfolio dauerhaft zu speichern und tägliche Analysen per E-Mail zu erhalten.'
            }
          </p>

          {error && (
            <div className="flex items-center gap-3 bg-rose-50 p-4 rounded-2xl border border-rose-100">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span className="text-xs font-bold text-rose-800">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {mode === 'register' && (
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Vorname"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm transition-all"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-Mail Adresse"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm transition-all"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                minLength={6}
                className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {mode === 'register' && (
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Passwort bestätigen"
                  minLength={6}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm transition-all"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">
              Verschlüsselte Speicherung – Ihre Daten bleiben sicher
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 hover:bg-blue-600 transition-all shadow-xl shadow-slate-900/10"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={switchMode}
              className="text-sm text-blue-600 font-bold hover:underline"
            >
              {mode === 'login'
                ? 'Noch kein Konto? Jetzt registrieren'
                : 'Bereits registriert? Jetzt anmelden'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;
