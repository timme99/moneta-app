/**
 * UpgradeModal – Paywall-Dialog für Premium-Features.
 *
 * Wird angezeigt wenn ein Free-User ein Premium-Feature aufrufen will.
 * Listet die Vorteile auf und leitet zu Stripe Checkout weiter.
 *
 * Props:
 *  isOpen    – ob der Modal sichtbar ist
 *  onClose   – schließt den Modal
 *  feature   – Optional: welches Feature hat den Modal getriggert (für Headline)
 *  userId    – für Stripe Checkout Session
 */

import React from 'react';
import { X, Zap, TrendingUp, Shield, Bell, FileText, BarChart3, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  userId?: string | null;
}

const PREMIUM_FEATURES = [
  { icon: TrendingUp,  label: 'Historische Performance',   desc: 'Depotwert-Chart über 12 Monate' },
  { icon: Shield,      label: 'Steuer-Optimierer',          desc: 'FIFO-Berechnung + Verlustverrechnung' },
  { icon: Bell,        label: 'Kurs-Alerts',                desc: 'Email-Benachrichtigung bei Kursänderungen' },
  { icon: BarChart3,   label: 'Unbegrenzte KI-Analysen',   desc: 'Kein Tageslimit mehr' },
  { icon: FileText,    label: 'Broker-Imports',             desc: 'Trade Republic, Scalable & mehr' },
  { icon: Zap,         label: 'Unbegrenzte Holdings',       desc: 'Mehr als 5 Positionen verwalten' },
];

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, feature, userId }) => {
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleUpgrade = async (plan: 'monthly' | 'yearly') => {
    setIsLoading(true);
    try {
      const resp = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId }),
      });
      if (resp.ok) {
        const { url } = await resp.json();
        if (url) window.location.href = url;
      } else {
        // Fallback: Kontakt-Mail wenn Stripe noch nicht konfiguriert
        window.open('mailto:hello@moneta.app?subject=Premium%20Upgrade', '_blank');
      }
    } catch {
      window.open('mailto:hello@moneta.app?subject=Premium%20Upgrade', '_blank');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-8 pb-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
            <Zap className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-black leading-tight">
            {feature ? `${feature} ist Premium` : 'Upgrade auf Premium'}
          </h2>
          <p className="text-blue-100 text-xs font-medium mt-1">
            Alle Features – für weniger als ein Kaffee im Monat.
          </p>
        </div>

        {/* Features */}
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

        {/* Pricing */}
        <div className="px-6 pb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleUpgrade('monthly')}
              disabled={isLoading}
              className="flex flex-col items-center justify-center py-4 px-3 border-2 border-slate-200 hover:border-blue-300 rounded-[20px] transition-all group disabled:opacity-50"
            >
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Monatlich</span>
              <span className="text-2xl font-black text-slate-900 mt-1">4,99€</span>
              <span className="text-[9px] text-slate-400 font-medium">pro Monat</span>
            </button>
            <button
              onClick={() => handleUpgrade('yearly')}
              disabled={isLoading}
              className="flex flex-col items-center justify-center py-4 px-3 border-2 border-blue-600 bg-blue-50 hover:bg-blue-100 rounded-[20px] transition-all relative disabled:opacity-50"
            >
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap">
                2 Monate gratis
              </span>
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Jährlich</span>
              <span className="text-2xl font-black text-blue-700 mt-1">39€</span>
              <span className="text-[9px] text-blue-500 font-medium">pro Jahr</span>
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Weiterleitung zu Stripe…
            </div>
          )}

          <p className="text-center text-[9px] text-slate-400 font-medium">
            Jederzeit kündbar · Keine versteckten Kosten · DSGVO-konform
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
