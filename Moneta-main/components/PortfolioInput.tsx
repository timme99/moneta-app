
import React, { useState, useRef } from 'react';
import { Plus, Trash2, Upload, Download, Save, X, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { PortfolioHolding } from '../types';
import { parseCSV, holdingsToPortfolioText, generateCSVTemplate } from '../services/csvService';

interface PortfolioInputProps {
  holdings: PortfolioHolding[];
  onSave: (holdings: PortfolioHolding[]) => void;
  onAnalyze: (text: string) => void;
  isLoading?: boolean;
}

const PortfolioInput: React.FC<PortfolioInputProps> = ({ holdings: initialHoldings, onSave, onAnalyze, isLoading }) => {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(
    initialHoldings.length > 0 ? initialHoldings : [{ name: '', isin: '', ticker: '', quantity: 1, buyPrice: 0 }]
  );
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'manual' | 'csv'>('manual');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addRow = () => {
    setHoldings([...holdings, { name: '', isin: '', ticker: '', quantity: 1, buyPrice: 0 }]);
  };

  const removeRow = (idx: number) => {
    if (holdings.length <= 1) return;
    setHoldings(holdings.filter((_, i) => i !== idx));
  };

  const updateHolding = (idx: number, field: keyof PortfolioHolding, value: string | number) => {
    const updated = [...holdings];
    (updated[idx] as any)[field] = value;
    setHoldings(updated);
  };

  const handleSave = () => {
    const valid = holdings.filter(h => h.name.trim() !== '');
    if (valid.length === 0) return;
    onSave(valid);
  };

  const handleAnalyze = () => {
    const valid = holdings.filter(h => h.name.trim() !== '');
    if (valid.length === 0) return;
    onSave(valid);
    const text = holdingsToPortfolioText(valid);
    onAnalyze(text);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvErrors([]);
    setCsvSuccess(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const result = parseCSV(content);

      if (result.errors.length > 0) {
        setCsvErrors(result.errors);
      }

      if (result.holdings.length > 0) {
        setHoldings(result.holdings);
        setCsvSuccess(`${result.holdings.length} Positionen aus ${result.rowCount} Zeilen importiert.`);
        setActiveTab('manual');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moneta_portfolio_vorlage.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Portfolio verwalten</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Positionen eingeben oder CSV importieren</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'manual'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white text-slate-400 border border-slate-200 hover:border-blue-300'
              }`}
            >
              Manuell
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'csv'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white text-slate-400 border border-slate-200 hover:border-blue-300'
              }`}
            >
              CSV Import
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'csv' ? (
        <div className="p-6 md:p-8 space-y-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-[24px] p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
          >
            <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4 group-hover:text-blue-500 transition-colors" />
            <p className="text-sm font-bold text-slate-700 mb-1">CSV-Datei hier ablegen oder klicken</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Unterstützt: CSV, TSV (Trade Republic, Scalable, comdirect, etc.)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleCSVUpload}
            className="hidden"
          />

          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-blue-600 text-sm font-bold hover:underline"
          >
            <Download className="w-4 h-4" />
            CSV-Vorlage herunterladen
          </button>

          {csvErrors.length > 0 && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl space-y-2">
              {csvErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-rose-700 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {csvSuccess && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 p-4 rounded-2xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-800">{csvSuccess}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 md:p-8 space-y-4">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-12 gap-3 text-[9px] font-black uppercase tracking-widest text-slate-400 px-2">
            <span className="col-span-3">Name / Bezeichnung</span>
            <span className="col-span-2">ISIN</span>
            <span className="col-span-2">Ticker</span>
            <span className="col-span-2">Anzahl</span>
            <span className="col-span-2">Kaufpreis</span>
            <span className="col-span-1"></span>
          </div>

          {/* Rows */}
          {holdings.map((holding, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <input
                value={holding.name}
                onChange={(e) => updateHolding(idx, 'name', e.target.value)}
                placeholder="z.B. Apple Inc."
                className="col-span-1 md:col-span-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                value={holding.isin || ''}
                onChange={(e) => updateHolding(idx, 'isin', e.target.value)}
                placeholder="ISIN"
                className="col-span-1 md:col-span-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                value={holding.ticker || ''}
                onChange={(e) => updateHolding(idx, 'ticker', e.target.value)}
                placeholder="Ticker"
                className="col-span-1 md:col-span-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type="number"
                value={holding.quantity}
                onChange={(e) => updateHolding(idx, 'quantity', parseFloat(e.target.value) || 0)}
                placeholder="Stk."
                min="0"
                step="any"
                className="col-span-1 md:col-span-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type="number"
                value={holding.buyPrice || ''}
                onChange={(e) => updateHolding(idx, 'buyPrice', parseFloat(e.target.value) || 0)}
                placeholder="Preis"
                min="0"
                step="0.01"
                className="col-span-1 md:col-span-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => removeRow(idx)}
                  disabled={holdings.length <= 1}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addRow}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-sm font-bold text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Position hinzufügen
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-white border border-slate-200 rounded-[20px] text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-blue-600 hover:text-blue-600 transition-all"
        >
          <Save className="w-4 h-4" />
          Portfolio speichern
        </button>
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 rounded-[20px] text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Speichern & Analysieren
        </button>
      </div>
    </div>
  );
};

export default PortfolioInput;
