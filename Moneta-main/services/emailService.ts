// services/emailService.ts - Frontend Email Report Service

const EMAIL_SETTINGS_KEY = 'moneta_email_settings';

export interface EmailSettings {
  email: string;
  dailyReport: boolean;
  weeklyDigest: boolean;
  lastSent: string | null;
}

export const emailService = {
  getSettings(): EmailSettings {
    const data = localStorage.getItem(EMAIL_SETTINGS_KEY);
    if (!data) {
      return { email: '', dailyReport: false, weeklyDigest: false, lastSent: null };
    }
    return JSON.parse(data);
  },

  saveSettings(settings: EmailSettings): void {
    localStorage.setItem(EMAIL_SETTINGS_KEY, JSON.stringify(settings));
  },

  async sendDailyReport(email: string, holdings: any[], score: number, summary: string): Promise<{ success: boolean; message: string; html?: string }> {
    try {
      const response = await fetch('/api/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, holdings, score, summary })
      });

      const data = await response.json();

      if (response.ok) {
        // Update last sent timestamp
        const settings = this.getSettings();
        settings.lastSent = new Date().toISOString();
        this.saveSettings(settings);
        return { success: true, message: 'Bericht erfolgreich gesendet!' };
      }

      // If email sending failed but we got HTML back, show it as preview
      if (data.fallback && data.html) {
        return {
          success: false,
          message: 'E-Mail-Versand nicht konfiguriert. Bericht als Vorschau verfügbar.',
          html: data.html
        };
      }

      return { success: false, message: data.error || 'Fehler beim Senden' };
    } catch (error) {
      return { success: false, message: 'Server nicht erreichbar' };
    }
  },

  shouldSendToday(): boolean {
    const settings = this.getSettings();
    if (!settings.dailyReport || !settings.email) return false;

    if (!settings.lastSent) return true;

    const lastSent = new Date(settings.lastSent);
    const today = new Date();
    return lastSent.toDateString() !== today.toDateString();
  }
};
