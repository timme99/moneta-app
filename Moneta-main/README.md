<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1rShjUhMVUbWpcyO5V0yiVKPDDFMyfVmu

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Gemini API – Kostenschutz (Limits)

Die Anzahl der Gemini-Aufrufe pro Nutzer und Tag kannst du begrenzen, um Kosten zu kontrollieren. In [.env.local](.env.local) oder in den Umgebungsvariablen deines Hosts (z. B. Vercel) kannst du setzen:

| Variable | Standard | Bedeutung |
|----------|----------|-----------|
| `GEMINI_LIMIT_ANALYSIS` | 10 | Depot-Analysen pro Tag pro Nutzer |
| `GEMINI_LIMIT_CHAT` | 30 | Chat-Nachrichten pro Tag |
| `GEMINI_LIMIT_NEWS` | 15 | News-Impact-Anfragen pro Tag |
| `GEMINI_LIMIT_RESOLVE_TICKER` | 30 | Namens→Ticker-Auflösungen pro Tag |
| `GEMINI_DAILY_CAP` | 0 | Gesamt-Anfragen pro Tag (alle Typen); 0 = kein Gesamtlimit |

**Beispiel (strengere Limits):**
```env
GEMINI_LIMIT_ANALYSIS=5
GEMINI_LIMIT_CHAT=15
GEMINI_LIMIT_NEWS=5
GEMINI_LIMIT_RESOLVE_TICKER=10
GEMINI_DAILY_CAP=50
```

Setze einen Typ auf `0`, um ihn zu deaktivieren.

## Newsletter (Resend + Cron)

Der Newsletter- und KI-Wochenbericht-Versand nutzt [Resend](https://resend.com). Die Abonnenten-Liste kommt in Schritt 2 aus der Datenbank; die Schnittstelle ist vorbereitet.

### Umgebungsvariablen (z. B. in Vercel)

| Variable | Bedeutung |
|----------|-----------|
| `RESEND_API_KEY` | API-Key von Resend (z. B. aus dem Resend-Dashboard) |
| `FROM_EMAIL` | Absender, z. B. `Moneta <newsletter@deine-domain.de>` (optional; Standard: Resend-Test-Absender) |
| `APP_URL` | Basis-URL der App (z. B. `https://moneta.vercel.app`) für Links in E-Mails |
| `CRON_SECRET` | Geheimes Token für den Cron-Aufruf (min. 16 Zeichen); von Vercel automatisch an Cron-Requests angehängt |

### API

- **POST /api/newsletter/send**  
  - Test: `{ "to": ["email@example.com"], "subject": "...", "html": "..." }`  
  - Digest an alle Abonnenten: `{ "digest": true }` (Empfänger kommen aus `getSubscribersForDigest()`, nach DB-Anbindung aus der DB).

- **GET /api/cron/weekly-digest**  
  Wird von Vercel Cron aufgerufen (Montag 8:00 UTC). Prüft `Authorization: Bearer <CRON_SECRET>` und sendet den Wochenbericht an alle Abonnenten von `getSubscribersForDigest()`.

### Schritt 2: Datenbank

In `lib/subscribers.ts` die Funktionen `getSubscribersForDigest()` und `getSubscribersForNewsletter()` mit eurer DB-Abfrage füllen (z. B. Nutzer mit `settings.weeklyDigest === true`).
