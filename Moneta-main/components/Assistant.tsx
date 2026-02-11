
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, X, Camera, FileText, BarChart3, Image as ImageIcon, ShieldCheck, AlertCircle } from 'lucide-react';
import { getFinancialAdvice, analyzePortfolio } from '../services/geminiService';
import { ChatMessage } from '../types';

interface AssistantProps {
  onAnalysisComplete?: (data: any) => void;
}

const Assistant: React.FC<AssistantProps> = ({ onAnalysisComplete }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Willkommen bei Moneta. Wie kann ich dir heute bei deinem Depot helfen?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{name: string, type: string, base64: string} | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

  const handleSendText = async () => {
    if (!input.trim() || isLoading) return;
    setLimitWarning(null);

    const isAnalysis = input.toLowerCase().match(/(depot|portfolio|isin|aktien)/);
    const userMsg: ChatMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      if (isAnalysis) {
        const masterData = await analyzePortfolio({ text: input });
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: masterData.summary || "Analyse abgeschlossen.",
          timestamp: new Date()
        }]);
        if (onAnalysisComplete) onAnalysisComplete(masterData);
      } else {
        // Fix: Map role 'assistant' to 'model' for Gemini API compatibility
        const history = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        const response = await getFinancialAdvice(input, history);
        setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
      }
    } catch (error: any) {
      const msg = error.message.includes(':') ? error.message.split(':')[1] : "Fehler.";
      setLimitWarning(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: msg, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-4xl mx-auto bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden">
      <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-black text-lg tracking-tight">Moneta Assistent</h3>
            <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">KI-Sicherheits-Proxy aktiv</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-[32px] p-6 text-sm ${
              msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 border border-slate-200'
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed font-medium">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && <div className="text-slate-400 text-xs font-black uppercase animate-pulse">KI denkt nach...</div>}
      </div>

      {limitWarning && (
        <div className="mx-6 mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="w-4 h-4" />
          {limitWarning}
        </div>
      )}

      <div className="p-6 border-t border-slate-100 bg-white">
        <div className="flex gap-3">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Frag mich etwas zu deinem Depot..."
            className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-[24px] focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-medium"
          />
          <button onClick={handleSendText} disabled={isLoading || !input.trim()} className="p-4 bg-blue-600 text-white rounded-[24px] hover:bg-blue-700 transition-all">
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Assistant;
