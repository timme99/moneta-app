/**
 * UpgradeModal – Wartelisten-Dialog für kommende Premium-Features.
 *
 * Premium ist aktuell noch nicht verfügbar. Nutzer können sich auf die
 * Warteliste eintragen und werden informiert, sobald Premium startet.
 *
 * Props:
 *  isOpen    – ob der Modal sichtbar ist
 *  onClose   – schließt den Modal (X-Button, Backdrop-Klick, ESC)
 *  feature   – Optional: welches Feature hat den Modal getriggert
 *  userId    – für späteren Checkout (noch nicht aktiv)
 */

import React, { useEffect } from 'react';
import { X, Zap, TrendingUp, Shield, Bell, FileText, BarChart3, CheckCircle2, Clock } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  userId?: string | null;
}

const PREMIUM_FEATURES = [
  { icon: TrendingUp, label: 'Historische Performance',  desc: 'Depotwert-Chart über 12 Monate' },
  { icon: Shield,     label: 'Steuer-Optimierer',         desc: 'FIFO-Berechnung + Verlustverrechnung' },
  { icon: Bell,       label: 'Kurs-Alerts',               desc: 'Email-Benachrichtigung bei Kursänderungen' },
  { icon: BarChart3,  label: 'Unbegrenzte KI-Analysen',  desc: 'Kein Tageslimit – alle Szenarien mit KI' },
  { icon: FileText,   label: 'Broker-Imports',            desc: 'Trade Republic, Scalable & mehr' },
  { icon: Zap,        label: 'Unbegrenzte Holdings',      desc: 'Mehr als 5 Positionen verwalten' },
];

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, feature }) => {
  // ESC-Taste schließt den Modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-8 pb-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
            <Zap className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-black leading-tight">
            {feature ? `${feature} – Premium-Feature` : 'Premium-Features'}
          </h2>
          <p className="text-blue-100 text-xs font-medium mt-1">
            Diese Funktionen sind bald verfügbar – trage dich jetzt ein.
          </p>
        </div>

        {/* Feature-Liste */}
        <div className="px-6 py-4 space-y-3">
          {PREMIUM_FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-7 h-7 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900">{label}</span>
                <p className="text-[10px] text-slate-400 font-medium">{desc}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 ml-auto mt-0.5" />
            </div>
          ))}
        </div>

        {/* Warteliste CTA */}
        <div className="px-6 pb-6 space-y-3">
          {/* Status-Hinweis */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700 font-medium leading-snug">
              <strong>Bezahlte Funktionen sind aktuell noch nicht verfügbar.</strong><br />
              Wir arbeiten daran – trage dich auf die Warteliste ein und wir melden uns als Erste.
            </p>
          </div>

          <a
            href="mailto:hello@moneta.app?subject=Warteliste%20Premium&body=Ich%20m%C3%B6chte%20auf%20die%20Warteliste%20f%C3%BCr%20Moneta%20Premium."
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            <Zap className="w-4 h-4" />
            Hier auf Warteliste eintragen
          </a>

          <p className="text-center text-[9px] text-slate-400 font-medium">
            Kein Spam · Nur eine Nachricht wenn Premium startet · DSGVO-konform
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
