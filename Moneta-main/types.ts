
export interface ETF {
  id: string;
  name: string;
  isin: string;
  ticker: string;
  ter: number;
  fundSize: string;
  category: string;
  oneYearReturn: number;
  threeYearReturn: number;
  riskScore: number;
  lastPrice?: number;
  priceChangePercent?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  image?: string;
  fileData?: {
    name: string;
    type: string;
    base64: string;
  };
}

export interface PerformanceDataPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface HoldingEntry {
  name: string;
  weight: number;
  isin?: string;
  ticker?: string;
  decision: 'Kaufen' | 'Halten' | 'Verkaufen';
  reason: string;
  currentPrice?: string;
  trend?: string;
  ter?: number;
  assetClass?: string;
  dailyChange?: number;
  totalReturn?: number;
  value?: number;
}

export interface PortfolioAnalysisReport {
  holdings: HoldingEntry[];
  sectors: { name: string; value: number }[];
  regions: { name: string; value: number }[];
  performance_history: PerformanceDataPoint[];
  summary: string;
  strengths: string[];
  considerations: string[];
  diversification_score: number;
  risk_level: 'low' | 'medium' | 'high';
  context: string;
  score: number;
  gaps: string[];
  news: {
    title: string;
    source: string;
    snippet: string;
    url?: string;
    ticker?: string;
    importance: 'hoch' | 'mittel' | 'niedrig';
    impact_emoji: string;
  }[];
  nextSteps: { action: string; description: string }[];
  textResponse?: string;
  lastMarketUpdate?: string;
  totalValue?: number;
  totalDailyChange?: number;
  totalDailyChangePercent?: number;
  weightedTER?: number;
  riskMetrics?: RiskMetrics;
}

export interface RiskMetrics {
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  valueAtRisk: number;
  beta: number;
  trackingError: number;
  sortinoRatio: number;
  informationRatio: number;
}

export interface PortfolioHealthReport {
  health_score: number;
  status: string;
  color: string;
  summary: string;
  factors: {
    diversification: HealthFactor;
    cost_efficiency: HealthFactor;
    risk_balance: HealthFactor;
    allocation_drift: HealthFactor;
  };
  top_strength: string;
  top_consideration: string;
}

export interface HealthFactor {
  score: number;
  note: string;
}

export interface PortfolioSavingsReport {
  current_annual_costs: string;
  optimized_annual_costs: string;
  potential_savings: string;
  savings_percentage: string;
  breakdown: SavingsBreakdownItem[];
  explanation: string;
  considerations: string[];
  pro_feature_note?: string;
}

export interface SavingsBreakdownItem {
  current_etf: string;
  current_ter: string;
  alternative: string;
  alternative_ter: string;
  annual_saving: string;
  your_amount?: string;
}

export interface DashboardSummaryInsight {
  greeting: string;
  key_insight: string;
  action_items: string[];
  mood: 'positive' | 'neutral' | 'attention';
  fun_fact?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  isLoggedIn: boolean;
  portfolioData?: {
    report: PortfolioAnalysisReport | null;
    health: PortfolioHealthReport | null;
    savings: PortfolioSavingsReport | null;
  };
  settings: {
    autoNewsletter: boolean;
    weeklyDigest: boolean;
    cloudSync: boolean;
  };
}

export interface UserProfile extends UserAccount {
  age: number;
  riskTolerance: 'conservative' | 'balanced' | 'aggressive';
  investmentHorizon: number;
  monthlyInvestment: number;
  experience: 'none' | 'basic' | 'expert';
  isPremium: boolean;
  freeAnalysesRemaining: number;
  newsletterSubscribed: boolean;
}

export interface NewsImpactReport {
  relevance: 'high' | 'medium' | 'low';
  impact_summary: string;
  context: string;
  perspectives: {
    bullish: string;
    bearish: string;
  };
  affected_holdings: [
    {
      ticker: string;
      your_exposure: string;
    }
  ];
  educational_note: string;
}

export interface ETFComparison {
  etfs: {
    name: string;
    isin: string;
    key_facts: {
      ter: string;
      size: string;
      replication: string;
    };
    strengths: string[];
    considerations: string[];
  }[];
  comparison_summary: string;
}

export interface StrategyExplanation {
  strategy_name: string;
  description: string;
  typical_allocation: Record<string, string>;
  common_reasons: string[];
  considerations: string[];
  historical_context: string;
  alternatives: string[];
}
