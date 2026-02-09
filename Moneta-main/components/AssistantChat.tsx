
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, Paperclip, X, Camera, FileText, BarChart3, MessageSquarePlus, Image as ImageIcon } from 'lucide-react';
// Fix: Updated import name to analyzePortfolio
import { getFinancialAdvice, analyzePortfolio } from '../services/geminiService';
import { ChatMessage, PortfolioAnalysisReport } from '../types';

interface AssistantChatProps {
  // Fix: Changed signature to any to match raw JSON from AI
  onAnalysisComplete?: (data: any) => void;
  isPremium?: boolean;
}

const AssistantChat: React.FC<AssistantChatProps> = ({ onAnalysisComplete, isPremium }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Willkommen! Ich kann Ihr Depot via CSV, Foto oder Textnachricht analysieren. Was möchten Sie tun?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{name: string, type: string, base64: string} | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingFile, isLoading]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingFile({
          name: file.name,
          type: file.type || 'application/octet-stream',
          base64: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async (textOnly: boolean = false) => {
    if ((!pendingFile && !textOnly) || isLoading) return;

    setIsLoading(true);
    try {
      const inputData = textOnly 
        ? { text: input } 
        : { text: input || "Analysiere diese Datei", fileBase64: pendingFile?.base64, fileType: pendingFile?.type };

      // Fix: analyzePortfolio returns the master analysis JSON. Removed extra isPremium argument.
      const masterData = await analyzePortfolio(inputData);
      
      setMessages(prev => [...prev, {
        role: 'user',
        content: textOnly ? input : `Analysiere mein Portfolio: ${pendingFile?.name || 'Text-Input'}`,
        timestamp: new Date(),
        fileData: pendingFile ? { name: pendingFile.name, type: pendingFile.type, base64: pendingFile.base64 } : undefined
      }]);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: masterData.summary || "Analyse abgeschlossen. Ich habe die Daten gegen Yahoo Finance Kurse geprüft.",
        timestamp: new Date()
      }]);

      if (onAnalysisComplete) {
        onAnalysisComplete(masterData);
      }
      setPendingFile(null);
      setInput('');
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Fehler bei der Analyse. Bitte prüfen Sie das Format oder die Internetverbindung.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendText = async () => {
    if (!input.trim() || isLoading) return;

    // Detect if user is sending a portfolio as text
    if (input.toLowerCase().includes('depot') || input.toLowerCase().includes('portfolio') || input.toLowerCase().includes('isin')) {
      startAnalysis(true);
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Fix: Map roles from 'assistant' to 'model' for Gemini API compatibility
    const history = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.fileData ? [{ text: m.content }, { inlineData: { mimeType: m.fileData.type, data: m.fileData.base64.split(',')[1] } }] : [{ text: m.content }]
    }));

    // Fix: Removed extra isPremium argument from getFinancialAdvice call.
    const response = await getFinancialAdvice(input, history);
    setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden">
      <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-tight">Moneta AI</h3>
            <p className="text-[9px] text-blue-400 font-black uppercase tracking-widest">Yahoo Finance Live Sync</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 text-xs shadow-sm ${
              msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
            }`}>
              {msg.fileData && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-white/10 rounded-lg border border-white/5">
                  <FileText className="w-3 h-3" />
                  <span className="text-[9px] font-bold truncate">{msg.fileData.name}</span>
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        
        {pendingFile && !isLoading && (
          <div className="animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600">
                    {pendingFile.type.includes('image') ? <Camera className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-900 truncate max-w-[150px] uppercase tracking-tight">{pendingFile.name}</p>
                    <p className="text-[9px] text-blue-600 font-bold uppercase">Bereit zur Analyse</p>
                  </div>
                </div>
                <button onClick={() => setPendingFile(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <button onClick={() => startAnalysis(false)} className="w-full bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-xl">
                <BarChart3 className="w-4 h-4" /> Start Yahoo Sync
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="relative">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">KI prüft Yahoo Finance Daten...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-white">
        <div className="flex items-center gap-2 mb-3">
           <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-2 px-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100 transition-all">
             <FileText className="w-3.5 h-3.5 text-slate-400" />
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">CSV / PDF</span>
           </button>
           <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-2 px-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-100 transition-all">
             <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Screenshot</span>
           </button>
        </div>
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".pdf,.csv,image/*" className="hidden" />
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Nachricht oder Depot-Liste..."
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-xs transition-all"
          />
          <button onClick={handleSendText} disabled={isLoading || !input.trim()} className="p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssistantChat;
