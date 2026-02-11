
import React, { useState } from 'react';
import { MOCK_ETFS } from '../constants';
import { Zap, X, Loader2, Scale, Info } from 'lucide-react';
import { compareETFs } from '../services/geminiService';
import { ETFComparison } from '../types';

const ComparisonModal = ({ comparison, onClose }: { comparison: ETFComparison, onClose: () => void }) => (
  <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-4">
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-white/20 animate-in zoom-in duration-300">
      <div className="sticky top-0 bg-white/80 backdrop-blur-md px-10 py-6 border-b border-slate-100 flex items-center justify-between z-10">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Vergleich der Anlagen</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Einfach & Neutral erklärt</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
      </div>
      <div className="p-10 space-y-10">
        <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
          <div className="flex items-center gap-2 mb-2 text-blue-700">
            <Scale className="w-5 h-5" />
            <h3 className="font-bold uppercase text-[10px] tracking-widest">Die Zusammenfassung</h3>
          </div>
          <p className="text-sm font-medium text-blue-900 leading-relaxed">{comparison.comparison_summary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {comparison.etfs.map((etf, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm hover:shadow-md transition-shadow">
              <h4 className="text-xl font-black text-slate-900 mb-1">{etf.name}</h4>
              <p className="text-[10px] font-mono text-slate-400 uppercase mb-6">Kennnummer: {etf.isin}</p>
              
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-50 p-3 rounded-2xl text-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Jährliche Kosten</span>
                  <span className="text-xs font-black text-slate-900">{etf.key_facts.ter}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl text-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Fonds-Größe</span>
                  <span className="text-xs font-black text-slate-900">{etf.key_facts.size}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl text-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Bauart</span>
                  <span className="text-xs font-black text-slate-900">{etf.key_facts.replication}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Was dafür spricht
                  </h5>
                  <ul className="space-y-2">
                    {etf.strengths.map((s, j) => (
                      <li key={j} className="text-[11px] font-medium text-slate-600 flex gap-2">
                        <div className="w-1 h-1 bg-emerald-500 rounded-full mt-1.5 shrink-0" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const ETFSearch: React.FC = () => {
  const [selectedETFs, setSelectedETFs] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ETFComparison | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const toggleSelection = (isin: string) => {
    setSelectedETFs(prev => 
      prev.includes(isin) ? prev.filter(i => i !== isin) : [...prev, isin]
    );
  };

  const handleCompare = async () => {
    if (selectedETFs.length < 2) return;
    setIsComparing(true);
    try {
      const result = await compareETFs(selectedETFs);
      setComparison(result);
    } catch (e) {
      alert("Fehler beim Vergleich.");
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Markt-Scanner</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">Anlagen finden</h2>
          <p className="text-sm text-slate-500 font-medium">Suchen Sie nach passenden Bausteinen für Ihr Depot.</p>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto relative z-10">
          {selectedETFs.length >= 2 && (
            <button 
              onClick={handleCompare}
              disabled={isComparing}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/30"
            >
              {isComparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
              {selectedETFs.length} Anlagen vergleichen
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                <th className="px-8 py-4 w-12"></th>
                <th className="px-8 py-4">Name der Anlage</th>
                <th className="px-8 py-4">Thema</th>
                <th className="px-8 py-4">
                  <div className="flex items-center gap-1">
                    Kosten p.a.
                    <div className="group/cost relative">
                      <Info className="w-3 h-3 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[9px] rounded-lg opacity-0 group-hover/cost:opacity-100 transition-opacity pointer-events-none z-50">
                        Das sind die Gebühren, die der Anbieter jedes Jahr direkt von deinem Anlagevermögen einbehält.
                      </div>
                    </div>
                  </div>
                </th>
                <th className="px-8 py-4">Erfolg (1 Jahr)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_ETFS.map(etf => (
                <tr key={etf.id} className={`group hover:bg-slate-50 transition-colors cursor-pointer ${selectedETFs.includes(etf.isin) ? 'bg-blue-50/50' : ''}`} onClick={() => toggleSelection(etf.isin)}>
                  <td className="px-8 py-5">
                    <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${selectedETFs.includes(etf.isin) ? 'bg-blue-600 border-blue-600' : 'border-slate-200 group-hover:border-blue-400'}`}>
                      {selectedETFs.includes(etf.isin) && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-sm">{etf.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">Kennnummer: {etf.isin}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">{etf.category}</span>
                  </td>
                  <td className="px-8 py-5 text-sm font-black text-slate-900">{etf.ter.toFixed(2)}%</td>
                  <td className="px-8 py-5 text-sm font-black text-emerald-600">+{etf.oneYearReturn}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {comparison && <ComparisonModal comparison={comparison} onClose={() => setComparison(null)} />}
    </div>
  );
};

export default ETFSearch;
