
import React from 'react';
import { Sparkles, Zap, AlertTriangle, ArrowRight } from 'lucide-react';
import { PortfolioAnalysisReport } from '../types';

interface MarketNewsTickerProps {
  news: PortfolioAnalysisReport['news'];
  onNewsClick: (news: any) => void;
  isPremium?: boolean;
}

const MarketNewsTicker: React.FC<MarketNewsTickerProps> = ({ news, onNewsClick, isPremium }) => {
  if (!news || news.length === 0) return null;

  return (
    <div className="relative mb-8 group">
      {/* Premium Badge */}
      <div className="absolute -top-3 left-6 z-20 flex items-center gap-1.5 bg-slate-900 text-white px-3 py-1 rounded-full border border-white/20 shadow-xl">
        <Sparkles className="w-3 h-3 text-amber-400 fill-amber-400" />
        <span className="text-[8px] font-black uppercase tracking-[0.2em]">Premium KI-Radar</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-1 shadow-sm overflow-hidden flex items-center">
        {/* Label-Section */}
        <div className="hidden md:flex items-center gap-2 px-6 py-4 border-r border-slate-100 bg-slate-50/50 shrink-0">
          <Zap className="w-4 h-4 text-blue-600" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Live Signale</span>
        </div>

        {/* Ticker Content */}
        <div className="flex-1 overflow-hidden relative">
          <div className="flex items-center animate-ticker whitespace-nowrap">
            {news.map((item, i) => (
              <button
                key={i}
                onClick={() => onNewsClick(item)}
                className="flex items-center gap-3 px-8 py-4 hover:bg-slate-50 transition-colors group/item border-r border-slate-50 last:border-0"
              >
                <span className="text-xl">{item.impact_emoji}</span>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-black uppercase tracking-widest ${
                      item.importance === 'hoch' ? 'text-rose-600' : 'text-blue-600'
                    }`}>
                      {item.importance}e Relevanz
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                      • {item.source}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 group-hover/item:text-blue-600 transition-colors">
                    {item.title}
                  </span>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-300 group-hover/item:translate-x-1 transition-transform" />
              </button>
            ))}
            {/* Duplicate for seamless scrolling if many news */}
            {news.length > 2 && news.map((item, i) => (
              <button
                key={`dup-${i}`}
                onClick={() => onNewsClick(item)}
                className="hidden lg:flex items-center gap-3 px-8 py-4 hover:bg-slate-50 transition-colors group/item border-r border-slate-50 last:border-0"
              >
                <span className="text-xl">{item.impact_emoji}</span>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-black uppercase tracking-widest ${
                      item.importance === 'hoch' ? 'text-rose-600' : 'text-blue-600'
                    }`}>
                      {item.importance}e Relevanz
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                      • {item.source}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-900 group-hover/item:text-blue-600 transition-colors">
                    {item.title}
                  </span>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-300 group-hover/item:translate-x-1 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 30s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default MarketNewsTicker;
