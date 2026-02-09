
import React, { useState } from 'react';
import { TrendingUp, Bell, User, BarChart3, Search, MessageSquare, Settings as SettingsIcon } from 'lucide-react';

interface HeaderProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const Header: React.FC<HeaderProps> = ({ activeView, onViewChange }) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const navItems = [
    { id: 'cockpit', label: 'Cockpit', icon: BarChart3 },
    { id: 'assistant', label: 'Assistent', icon: MessageSquare },
    { id: 'discover', label: 'Entdecken', icon: Search },
  ];

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-[100] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-12">
            <button 
              onClick={() => onViewChange('cockpit')}
              className="flex-shrink-0 flex items-center gap-2 group"
            >
              <div className="bg-blue-600 p-2.5 rounded-[14px] group-hover:rotate-6 transition-transform shadow-lg shadow-blue-600/30">
                <TrendingUp className="text-white w-5 h-5" />
              </div>
              <span className="text-2xl font-black text-slate-900 tracking-tighter italic">
                Mon<span className="text-blue-600">eta</span>
              </span>
            </button>
            
            <nav className="hidden md:flex items-center gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`flex items-center gap-3 px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-[20px] transition-all ${
                    activeView === item.id 
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' 
                      : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 pr-4 border-r border-slate-100">
              <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
              </button>
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className={`flex items-center gap-3 pl-2 transition-all p-1.5 rounded-[22px] ${showSettingsMenu ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-tighter text-slate-900 leading-none">Mein Account</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest mt-1 text-emerald-500">
                    Sicher & Lokal
                  </span>
                </div>
                <div className="w-11 h-11 bg-slate-900 rounded-[18px] flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-all">
                  <User className="w-5 h-5" />
                </div>
              </button>

              {showSettingsMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSettingsMenu(false)}></div>
                  <div className="absolute right-0 mt-3 w-56 bg-white rounded-[28px] shadow-2xl border border-slate-100 py-3 z-20 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <button 
                      onClick={() => { onViewChange('settings'); setShowSettingsMenu(false); }}
                      className="w-full px-6 py-3 flex items-center gap-3 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-all"
                    >
                      <SettingsIcon className="w-4 h-4" /> Einstellungen
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
