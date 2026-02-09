
import { UserAccount, PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport } from '../types';

const DB_KEY = 'moneta_db_mock';
const LIMIT_KEY = 'moneta_daily_limit';

export const userService = {
  getDailyCredits(): number {
    const data = localStorage.getItem(LIMIT_KEY);
    if (!data) return 3; // Standard: 3 Credits pro Tag
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

  async authenticate(email: string, name: string): Promise<UserAccount> {
    const mockUser: UserAccount = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      name,
      isLoggedIn: true,
      settings: {
        autoNewsletter: true,
        weeklyDigest: true,
        cloudSync: true
      }
    };
    localStorage.setItem(DB_KEY, JSON.stringify(mockUser));
    return mockUser;
  },

  async savePortfolio(
    userId: string, 
    report: PortfolioAnalysisReport | null,
    health: PortfolioHealthReport | null,
    savings: PortfolioSavingsReport | null
  ) {
    const userData = localStorage.getItem(DB_KEY);
    if (userData) {
      const user = JSON.parse(userData);
      user.portfolioData = { report, health, savings };
      localStorage.setItem(DB_KEY, JSON.stringify(user));
    }
  },

  async fetchUserData(): Promise<UserAccount | null> {
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : null;
  }
};
