
import React, { useState, useRef } from 'react';
import { Sparkles, Zap, Layout, Send, Loader2, ShieldAlert, ImageIcon, FileText, Database, CheckCircle2, AlertCircle } from 'lucide-react';

interface EmptyStateProps {
  onAnalyzeText: (text: string) => void;
  onUploadClick: () => void;
  onManagePortfolio?: () => void;
  isLoading?: boolean;
  onImageImport?: (file: File) => void;
  onExcelImport?: (file: File) => void;
  importStatus?: { loading: boolean; message: string; error: string };
}

const EmptyState: React.FC<EmptyStateProps> = ({
  onAnalyzeText, onUploadClick, onManagePortfolio, isLoading,
  onImageImport, onExcelImport, importStatus,
}) => {
  const [input, setInput] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const examples = [
    "Ich habe 20 Mercedes Aktien",
    "Mein MSCI World ETF",
    "Apple & Microsoft Depot"
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onAnalyzeText(input);
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="text-center space-y-6 pt-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full border border-emerald-100">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Intelligenter Anlage-Assistent</span>
        </div>
        <h1 className="text-6xl font-black text-slate-900 tracking-tighter leading-none">
          Analysiere dein <span className="text-emerald-600">Vermögen</span>
        </h1>
        <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium leading-relaxed">
          Dein smarter Begleiter für ETFs und Vermögensaufbau. Analysiere Gebühren, Klumpenrisiken und Marktchancen mit modernster KI-Technologie in Sekundenschnelle.
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-800 to-emerald-600 rounded-[32px] blur opacity-10 group-hover:opacity-25 transition duration-1000"></div>
          <div className="relative bg-white border border-slate-200 rounded-[32px] p-2 flex items-center shadow-2xl">
            <div className="pl-6 text-slate-400">
              <Zap className="w-6 h-6" />
            </div>
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="z.B. 10x Allianz, Apple und MSCI World..."
              className="flex-1 px-4 py-6 bg-transparent border-none focus:ring-0 text-lg font-medium text-slate-900 placeholder:text-slate-300"
              disabled={isLoading}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-slate-900 text-white p-5 rounded-[24px] hover:bg-emerald-600 transition-all flex items-center gap-2 group/btn disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
            </button>
          </div>
        </form>

        <div className="flex flex-col items-center mt-8 gap-4">
           <div className="flex flex-wrap justify-center gap-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(ex);
                  onAnalyzeText(ex);
                }}
                className="px-4 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-emerald-600 hover:text-emerald-600 transition-all shadow-sm"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <button
          onClick={() => onImageImport ? imageInputRef.current?.click() : onUploadClick()}
          disabled={importStatus?.loading}
          className="bg-white border border-slate-200 p-8 rounded-[32px] hover:border-emerald-200 hover:shadow-xl transition-all group flex flex-col items-center text-center disabled:opacity-60"
        >
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-700 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            {importStatus?.loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageIcon className="w-6 h-6" />}
          </div>
          <h3 className="font-black text-slate-900 mb-1">Foto-Check</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Screenshot hochladen</p>
        </button>

        <button
          onClick={() => onExcelImport ? excelInputRef.current?.click() : onUploadClick()}
          disabled={importStatus?.loading}
          className="bg-white border border-slate-200 p-8 rounded-[32px] hover:border-emerald-400 hover:shadow-xl transition-all group flex flex-col items-center text-center disabled:opacity-60"
        >
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            {importStatus?.loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileText className="w-6 h-6" />}
          </div>
          <h3 className="font-black text-slate-900 mb-1">CSV Import</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Broker-Daten nutzen</p>
        </button>

        <button
          onClick={() => onAnalyzeText("Beispiel-Depot: MSCI World, S&P 500, Apple")}
          className="bg-white border border-slate-200 p-8 rounded-[32px] hover:border-emerald-600 hover:shadow-xl transition-all group flex flex-col items-center text-center"
        >
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-700 mb-4 group-hover:bg-emerald-100 group-hover:text-white transition-colors">
            <Layout className="w-6 h-6" />
          </div>
          <h3 className="font-black text-slate-900 mb-1">Demo-Daten</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Vorschau testen</p>
        </button>

        {onManagePortfolio && (
          <button
            onClick={onManagePortfolio}
            className="bg-white border border-slate-200 p-8 rounded-[32px] hover:border-emerald-500 hover:shadow-xl transition-all group flex flex-col items-center text-center md:col-span-3"
          >
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-900 mb-1">Depot verwalten</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Aktien & ETFs mit Autocomplete · Watchlist · KI-Analyse
            </p>
          </button>
        )}
      </div>

      {/* Import-Status */}
      {importStatus && !importStatus.loading && (importStatus.message || importStatus.error) && (
        <div className={`max-w-xl mx-auto flex items-center gap-3 px-6 py-4 rounded-[24px] border text-sm font-bold ${
          importStatus.message
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : 'bg-rose-50 border-rose-100 text-rose-700'
        }`}>
          {importStatus.message
            ? <CheckCircle2 className="w-5 h-5 shrink-0" />
            : <AlertCircle className="w-5 h-5 shrink-0" />}
          {importStatus.message || importStatus.error}
        </div>
      )}

      {/* Versteckte File-Inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && onImageImport) onImageImport(f); e.target.value = ''; }}
      />
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && onExcelImport) onExcelImport(f); e.target.value = ''; }}
      />

      <div className="max-w-xl mx-auto bg-rose-50 border border-rose-100 p-6 rounded-[32px] flex items-start gap-4 shadow-sm">
        <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-black text-rose-900 uppercase tracking-widest">Wichtiger Risikohinweis</p>
          <p className="text-[11px] text-rose-700 font-medium leading-relaxed">
            Moneta ist ein privates Hobby-Projekt. Alle Analysen sind rein informativ und stellen keine Anlageberatung dar. 
            Investieren an der Börse ist mit Risiken verbunden. Handeln Sie eigenverantwortlich.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
