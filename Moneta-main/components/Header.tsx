
import React, { useState } from 'react';
import {
  TrendingUp, User, BarChart3, Search, MessageSquare,
  Settings as SettingsIcon, LogIn, Database, Calendar, FlaskConical, Menu, X,
} from 'lucide-react';
import type { UserAccount } from '../types';

interface HeaderProps {
  activeView: string;
  onViewChange: (view: string) => void;
  userAccount?: UserAccount | null;
  onLoginClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ activeView, onViewChange, userAccount, onLoginClick }) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const navItems = [
    { id: 'cockpit',   label: 'Cockpit',          icon: BarChart3 },
    { id: 'portfolio', label: 'Depot verwalten',   icon: Database },
    { id: 'earnings',  label: 'Earnings',          icon: Calendar },
    { id: 'scenarios', label: 'Szenarien',         icon: FlaskConical },
    { id: 'assistant', label: 'Assistent',         icon: MessageSquare },
    { id: 'discover',  label: 'Entdecken',         icon: Search },
  ];

  const handleNav = (id: string) => {
    onViewChange(id);
    setShowMobileMenu(false);
    setShowSettingsMenu(false);
  };

  return (
    <>
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-[100] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 md:h-20">

            {/* Logo */}
            <div className="flex items-center gap-4 md:gap-8">
              <button
                onClick={() => handleNav('cockpit')}
                className="flex-shrink-0 flex items-center gap-2 group"
              >
                <div className="bg-blue-600 p-2 md:p-2.5 rounded-[12px] md:rounded-[14px] group-hover:rotate-6 transition-transform shadow-lg shadow-blue-600/30">
                  <TrendingUp className="text-white w-4 h-4 md:w-5 md:h-5" />
                </div>
                <span className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter italic">
                  Mon<span className="text-blue-600">eta</span>
                </span>
              </button>

              {/* Desktop Nav */}
              <nav className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-[16px] transition-all ${
                      activeView === item.id
                        ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20'
                        : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 md:gap-4">

              {/* Account-Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  className={`flex items-center gap-2 transition-all p-1.5 rounded-[20px] ${showSettingsMenu ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                >
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-[10px] font-black uppercase tracking-tighter text-slate-900 leading-none">
                      {userAccount?.name ?? 'Mein Account'}
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${userAccount?.isLoggedIn ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {userAccount?.isLoggedIn ? 'Eingeloggt' : 'Nicht angemeldet'}
                    </span>
                  </div>
                  <div className={`w-9 h-9 md:w-11 md:h-11 rounded-[14px] md:rounded-[18px] flex items-center justify-center text-white shadow-lg transition-all ${userAccount?.isLoggedIn ? 'bg-blue-600' : 'bg-slate-900'}`}>
                    <User className="w-4 h-4 md:w-5 md:h-5" />
                  </div>
                </button>

                {showSettingsMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSettingsMenu(false)} />
                    <div className="absolute right-0 mt-3 w-60 bg-white rounded-[28px] shadow-2xl border border-slate-100 py-3 z-20 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                      {!userAccount?.isLoggedIn && onLoginClick && (
                        <button
                          onClick={() => { onLoginClick(); setShowSettingsMenu(false); }}
                          className="w-full px-6 py-3 flex items-center gap-3 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all"
                        >
                          <LogIn className="w-4 h-4" /> Anmelden / Registrieren
                        </button>
                      )}
                      {navItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleNav(item.id)}
                          className={`w-full px-6 py-3 flex items-center gap-3 text-sm font-bold transition-all ${
                            activeView === item.id
                              ? 'text-blue-600 bg-blue-50'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-blue-600'
                          }`}
                        >
                          <item.icon className="w-4 h-4" /> {item.label}
                        </button>
                      ))}
                      <div className="mx-4 my-1 border-t border-slate-100" />
                      <button
                        onClick={() => handleNav('settings')}
                        className={`w-full px-6 py-3 flex items-center gap-3 text-sm font-bold transition-all ${
                          activeView === 'settings'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-blue-600'
                        }`}
                      >
                        <SettingsIcon className="w-4 h-4" /> Einstellungen
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile Hamburger */}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="lg:hidden p-2 text-slate-400 hover:text-slate-900 transition-colors"
              >
                {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-slate-100 bg-white/95 backdrop-blur-md pb-4">
            <nav className="max-w-7xl mx-auto px-4 pt-3 grid grid-cols-3 gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-[18px] text-[9px] font-black uppercase tracking-widest transition-all ${
                    activeView === item.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-400 hover:text-slate-900 bg-slate-50'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => handleNav('settings')}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-[18px] text-[9px] font-black uppercase tracking-widest transition-all ${
                  activeView === 'settings'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-900 bg-slate-50'
                }`}
              >
                <SettingsIcon className="w-5 h-5" />
                Einstellungen
              </button>
            </nav>
          </div>
        )}
      </header>
    </>
  );
};

export default Header;
