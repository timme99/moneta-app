
import React, { useState } from 'react';
import {
  BarChart3, Search, MessageSquare,
  Settings as SettingsIcon, LogIn, Calendar, FlaskConical, User,
} from 'lucide-react';
import type { UserAccount } from '../types';
import Logo from './atoms/Logo';

interface HeaderProps {
  activeView: string;
  onViewChange: (view: string) => void;
  userAccount?: UserAccount | null;
  onLoginClick?: () => void;
  /** Synced display name from profiles.full_name – overrides auth metadata */
  displayName?: string;
}

const Header: React.FC<HeaderProps> = ({
  activeView, onViewChange, userAccount, onLoginClick, displayName,
}) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Avatar: prefer displayName, then account name, then email prefix
  const resolvedName = displayName || userAccount?.name || userAccount?.email?.split('@')[0] || '';
  const avatarLetter = resolvedName[0]?.toUpperCase() || 'M';

  const navItems = [
    { id: 'cockpit',   label: 'Cockpit',    icon: BarChart3 },
    { id: 'earnings',  label: 'Earnings',   icon: Calendar },
    { id: 'scenarios', label: 'Szenarien',  icon: FlaskConical },
    { id: 'assistant', label: 'Assistent',  icon: MessageSquare },
    { id: 'discover',  label: 'Entdecken',  icon: Search },
  ];

  const bottomNavItems = [
    { id: 'cockpit',   label: 'Cockpit',   icon: BarChart3 },
    { id: 'earnings',  label: 'Earnings',  icon: Calendar },
    { id: 'scenarios', label: 'Szenarien', icon: FlaskConical },
    { id: 'assistant', label: 'KI-Chat',   icon: MessageSquare },
    { id: 'settings',  label: 'Profil',    icon: SettingsIcon },
  ];

  const handleNav = (id: string) => {
    onViewChange(id);
    setShowSettingsMenu(false);
  };

  return (
    <>
      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <header className="bg-moneta-offwhite/90 backdrop-blur-md border-b border-moneta-forest/10 sticky top-0 z-[100] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 md:h-20">

            {/* Logo + slogan */}
            <div className="flex items-center gap-4 md:gap-8">
              <button
                onClick={() => handleNav('cockpit')}
                className="flex-shrink-0 flex items-center gap-2 group min-h-[44px]"
                aria-label="Moneta – Zur Startseite"
              >
                {/* Mobile: icon only */}
                <Logo
                  variant="icon"
                  className="md:hidden h-9"
                  onClick={undefined}
                />
                {/* Desktop: color horizontal logo + slogan */}
                <div className="hidden md:flex flex-col">
                  <Logo
                    variant="color-horizontal"
                    className="h-10 group-hover:opacity-90 transition-opacity"
                    onClick={undefined}
                  />
                </div>
              </button>

              {/* Desktop nav – hidden on mobile (bottom tab handles it) */}
              <nav className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-[16px] transition-all min-h-[44px] ${
                      activeView === item.id
                        ? 'bg-moneta-forest text-white shadow-xl shadow-moneta-forest/20'
                        : 'text-moneta-obsidian/50 hover:text-moneta-obsidian hover:bg-moneta-forest/5'
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Right side – account avatar / dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className={`flex items-center gap-2.5 transition-all p-1.5 rounded-[20px] min-h-[44px] ${
                  showSettingsMenu ? 'bg-moneta-forest/5' : 'hover:bg-moneta-forest/5'
                }`}
              >
                {/* Name + status label (hidden on very small screens) */}
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-tighter text-moneta-obsidian leading-none">
                    {resolvedName || 'Mein Account'}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${
                    userAccount?.isLoggedIn ? 'text-moneta-growth' : 'text-moneta-obsidian/40'
                  }`}>
                    {userAccount?.isLoggedIn ? 'Eingeloggt' : 'Nicht angemeldet'}
                  </span>
                </div>

                {/* Avatar circle */}
                <div className={`w-9 h-9 md:w-11 md:h-11 rounded-[14px] md:rounded-[18px] flex items-center justify-center shadow-lg transition-all text-white font-black text-sm md:text-base ${
                  userAccount?.isLoggedIn ? 'bg-moneta-forest' : 'bg-moneta-obsidian'
                }`}>
                  {userAccount?.isLoggedIn
                    ? <span className="leading-none">{avatarLetter}</span>
                    : <User className="w-4 h-4 md:w-5 md:h-5" />}
                </div>
              </button>

              {/* Account dropdown */}
              {showSettingsMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSettingsMenu(false)} />
                  <div className="absolute right-0 mt-3 w-64 bg-moneta-offwhite rounded-[28px] shadow-2xl border border-moneta-forest/10 py-3 z-20 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    {!userAccount?.isLoggedIn && onLoginClick && (
                      <button
                        onClick={() => { onLoginClick(); setShowSettingsMenu(false); }}
                        className="w-full px-6 py-3 flex items-center gap-3 text-sm font-bold text-moneta-forest hover:bg-moneta-forest/5 transition-all min-h-[48px]"
                      >
                        <LogIn className="w-4 h-4 shrink-0" /> Anmelden / Registrieren
                      </button>
                    )}

                    {userAccount?.isLoggedIn && (
                      <div className="px-6 py-3 border-b border-moneta-forest/10 mb-1">
                        <p className="text-xs font-black text-moneta-obsidian truncate">{resolvedName}</p>
                        <p className="text-[10px] text-moneta-obsidian/40 font-medium truncate">{userAccount.email}</p>
                      </div>
                    )}

                    {/* Desktop: full nav in dropdown */}
                    <div className="lg:block hidden">
                      {navItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleNav(item.id)}
                          className={`w-full px-6 py-3 flex items-center gap-3 text-sm font-bold transition-all min-h-[48px] ${
                            activeView === item.id
                              ? 'text-moneta-forest bg-moneta-forest/5'
                              : 'text-moneta-obsidian/70 hover:bg-moneta-forest/5 hover:text-moneta-forest'
                          }`}
                        >
                          <item.icon className="w-4 h-4 shrink-0" /> {item.label}
                        </button>
                      ))}
                      <div className="mx-4 my-1 border-t border-moneta-forest/10" />
                    </div>

                    {/* Mobile: only items not in bottom tab bar */}
                    <div className="lg:hidden block">
                      {[
                        { id: 'discover', label: 'Entdecken', icon: Search },
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleNav(item.id)}
                          className={`w-full px-6 py-3 flex items-center gap-3 text-sm font-bold transition-all min-h-[48px] ${
                            activeView === item.id
                              ? 'text-moneta-forest bg-moneta-forest/5'
                              : 'text-moneta-obsidian/70 hover:bg-moneta-forest/5 hover:text-moneta-forest'
                          }`}
                        >
                          <item.icon className="w-4 h-4 shrink-0" /> {item.label}
                        </button>
                      ))}
                      <div className="mx-4 my-1 border-t border-moneta-forest/10" />
                    </div>

                    <button
                      onClick={() => handleNav('settings')}
                      className={`w-full px-6 py-3 flex items-center gap-3 text-sm font-bold transition-all min-h-[48px] ${
                        activeView === 'settings'
                          ? 'text-moneta-forest bg-moneta-forest/5'
                          : 'text-moneta-obsidian/70 hover:bg-moneta-forest/5 hover:text-moneta-forest'
                      }`}
                    >
                      <SettingsIcon className="w-4 h-4 shrink-0" /> Einstellungen
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Fixed bottom tab bar (mobile only, < lg) ─────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[90] bg-moneta-offwhite/95 backdrop-blur-md border-t border-moneta-forest/10 safe-area-pb">
        <div className="flex items-stretch">
          {bottomNavItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors relative ${
                  isActive ? 'text-moneta-forest' : 'text-moneta-obsidian/40 hover:text-moneta-obsidian/70'
                }`}
              >
                <item.icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className={`text-[9px] font-black uppercase tracking-widest leading-tight ${
                  isActive ? 'text-moneta-forest' : ''
                }`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-moneta-forest rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Header;
