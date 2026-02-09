
import React, { useState } from 'react';
import ETFSearch from './ETFSearch';
import ETFList from './ETFList';
import Strategies from './Strategies';
import { Search, Compass, Target, Zap } from 'lucide-react';

const Discover: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'search' | 'strategies'>('search');

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Compass className="w-5 h-5 text-blue-600" />
            <span className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">Markt-Analysen</span>
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter leading-none">Entdecke <span className="text-blue-600">Möglichkeiten</span></h1>
        </div>
        
        <div className="flex bg-slate-100 p-1.5 rounded-[24px] w-fit">
          <button 
            onClick={() => setActiveSubTab('search')}
            className={`flex items-center gap-2 px-6 py-3 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === 'search' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Search className="w-4 h-4" /> Markt-Scanner
          </button>
          <button 
            onClick={() => setActiveSubTab('strategies')}
            className={`flex items-center gap-2 px-6 py-3 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === 'strategies' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Target className="w-4 h-4" /> Strategien
          </button>
        </div>
      </div>

      <div className="space-y-16">
        {activeSubTab === 'search' ? (
          <>
            <section>
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" /> Aktuelle Trends
                </h3>
              </div>
              <ETFList />
            </section>
            
            <section className="pt-8">
              <ETFSearch />
            </section>
          </>
        ) : (
          <section>
            <Strategies />
          </section>
        )}
      </div>
    </div>
  );
};

export default Discover;
