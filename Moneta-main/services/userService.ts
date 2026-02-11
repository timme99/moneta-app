
import { UserAccount, PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport, PortfolioHolding } from '../types';

const DB_KEY = 'moneta_db_mock';
const USERS_KEY = 'moneta_users';
const LIMIT_KEY = 'moneta_daily_limit';
const SESSION_KEY = 'moneta_session';

// Simple hash function for password (client-side demo - in production use bcrypt on server)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'moneta_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getAllUsers(): Record<string, UserAccount> {
  const data = localStorage.getItem(USERS_KEY);
  return data ? JSON.parse(data) : {};
}

function saveAllUsers(users: Record<string, UserAccount>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export const userService = {
  getDailyCredits(): number {
    const data = localStorage.getItem(LIMIT_KEY);
    if (!data) return 3;
    const { date, credits } = JSON.parse(data);
    const today = new Date().toDateString();
    if (date !== today) return 3;
    return credits;
  },

  useCredit(): boolean {
    let credits = this.getDailyCredits();
    if (credits <= 0) return false;
    credits -= 1;
    localStorage.setItem(LIMIT_KEY, JSON.stringify({
      date: new Date().toDateString(),
      credits
    }));
    return true;
  },

  async register(email: string, name: string, password: string): Promise<UserAccount> {
    const users = getAllUsers();

    // Check if email already exists
    const existingUser = Object.values(users).find(u => u.email === email);
    if (existingUser) {
      throw new Error('Ein Konto mit dieser E-Mail existiert bereits. Bitte melden Sie sich an.');
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    const newUser: UserAccount = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
      email,
      name,
      passwordHash,
      isLoggedIn: true,
      portfolio: [],
      settings: {
        autoNewsletter: true,
        weeklyDigest: true,
        dailyEmail: false,
        dailyEmailTime: '08:00',
        cloudSync: true
      },
      createdAt: now,
      lastLogin: now
    };

    users[newUser.id] = newUser;
    saveAllUsers(users);
    localStorage.setItem(SESSION_KEY, newUser.id);
    localStorage.setItem(DB_KEY, JSON.stringify(newUser));

    return newUser;
  },

  async login(email: string, password: string): Promise<UserAccount> {
    const users = getAllUsers();
    const passwordHash = await hashPassword(password);

    const user = Object.values(users).find(u => u.email === email);
    if (!user) {
      throw new Error('Kein Konto mit dieser E-Mail gefunden.');
    }

    if (user.passwordHash !== passwordHash) {
      throw new Error('Falsches Passwort. Bitte versuchen Sie es erneut.');
    }

    user.isLoggedIn = true;
    user.lastLogin = new Date().toISOString();
    users[user.id] = user;
    saveAllUsers(users);
    localStorage.setItem(SESSION_KEY, user.id);
    localStorage.setItem(DB_KEY, JSON.stringify(user));

    return user;
  },

  logout() {
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (sessionId) {
      const users = getAllUsers();
      if (users[sessionId]) {
        users[sessionId].isLoggedIn = false;
        saveAllUsers(users);
      }
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(DB_KEY);
  },

  // Legacy compat
  async authenticate(email: string, name: string): Promise<UserAccount> {
    try {
      return await this.login(email, 'legacy_default');
    } catch {
      return await this.register(email, name, 'legacy_default');
    }
  },

  async savePortfolio(
    userId: string,
    report: PortfolioAnalysisReport | null,
    health: PortfolioHealthReport | null,
    savings: PortfolioSavingsReport | null
  ) {
    const users = getAllUsers();
    if (users[userId]) {
      users[userId].portfolioData = { report, health, savings };
      saveAllUsers(users);
    }
    const userData = localStorage.getItem(DB_KEY);
    if (userData) {
      const user = JSON.parse(userData);
      user.portfolioData = { report, health, savings };
      localStorage.setItem(DB_KEY, JSON.stringify(user));
    }
  },

  async saveHoldings(userId: string, holdings: PortfolioHolding[]) {
    const users = getAllUsers();
    if (users[userId]) {
      users[userId].portfolio = holdings;
      saveAllUsers(users);
    }
    const userData = localStorage.getItem(DB_KEY);
    if (userData) {
      const user = JSON.parse(userData);
      user.portfolio = holdings;
      localStorage.setItem(DB_KEY, JSON.stringify(user));
    }
  },

  async updateSettings(userId: string, settings: Partial<UserAccount['settings']>) {
    const users = getAllUsers();
    if (users[userId]) {
      users[userId].settings = { ...users[userId].settings, ...settings };
      saveAllUsers(users);
    }
    const userData = localStorage.getItem(DB_KEY);
    if (userData) {
      const user = JSON.parse(userData);
      user.settings = { ...user.settings, ...settings };
      localStorage.setItem(DB_KEY, JSON.stringify(user));
    }
  },

  async fetchUserData(): Promise<UserAccount | null> {
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (sessionId) {
      const users = getAllUsers();
      if (users[sessionId]) {
        localStorage.setItem(DB_KEY, JSON.stringify(users[sessionId]));
        return users[sessionId];
      }
    }
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : null;
  }
};
