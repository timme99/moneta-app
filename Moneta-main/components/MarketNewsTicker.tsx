/**
 * MarketNewsTicker – KI-Nachrichten als lesbares Card-Grid.
 *
 * Ersetzt das alte scrollende Ticker-Banner durch max. 3 statische Karten,
 * die auf Klick die volle Meldung öffnen.
 *
 * Importance-Kodierung:
 *   hoch   → rotes Badge
 *   mittel → blaues Badge
 *   niedrig → slate Badge
 */

import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { PortfolioAnalysisReport } from '../types';

interface MarketNewsTickerProps {
  news:         PortfolioAnalysisReport['news'];
  onNewsClick:  (news: any) => void;
  isPremium?:   boolean;
}

const IMPORTANCE_STYLE: Record<string, { badge: string; border: string }> = {
  hoch:    { badge: 'bg-rose-100 text-rose-700',    border: 'border-rose-100'  },
  mittel:  { badge: 'bg-blue-100 text-blue-700',    border: 'border-blue-100'  },
  niedrig: { badge: 'bg-slate-100 text-slate-500',  border: 'border-slate-200' },
};

const MarketNewsTicker: React.FC<MarketNewsTickerProps> = ({ news, onNewsClick }) => {
  if (!news?.length) return null;

  const shown = news.slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.18em]">
          Markt-Signale
        </h3>
        <span className="text-[9px] font-bold text-slate-400">{news.length} Meldung{news.length !== 1 ? 'en' : ''}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shown.map((item, i) => {
          const { badge, border } = IMPORTANCE_STYLE[item.importance] ?? IMPORTANCE_STYLE.niedrig;
          return (
            <button
              key={i}
              onClick={() => onNewsClick(item)}
              className={`bg-white border ${border} rounded-[20px] p-4 text-left hover:shadow-md transition-all group flex items-start gap-3`}
            >
              {/* Emoji */}
              <span className="text-2xl shrink-0 leading-none mt-0.5">{item.impact_emoji}</span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${badge}`}>
                    {item.importance}
                  </span>
                  {item.ticker && (
                    <span className="text-[9px] font-mono font-bold text-slate-400">{item.ticker}</span>
                  )}
                  <span className="text-[9px] text-slate-400 font-medium">{item.source}</span>
                </div>
                <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                  {item.title}
                </p>
                {item.snippet && (
                  <p className="text-[11px] text-slate-500 font-medium mt-1 line-clamp-2 leading-relaxed">
                    {item.snippet}
                  </p>
                )}
              </div>

              {/* Arrow */}
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MarketNewsTicker;
