/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // HTML-Entry
    './index.html',
    // Root-Level TS/TSX (App.tsx, index.tsx, types.ts, constants.tsx, …)
    './*.{ts,tsx}',
    // Alle Komponenten
    './components/**/*.{ts,tsx}',
    // Services & Lib (Klassen kommen meist aus Komponenten, aber sicher ist sicher)
    './services/**/*.ts',
    './lib/**/*.ts',
  ],

  // ── Safelist für dynamisch aufgebaute Klassen ─────────────────────────────
  // Tailwinds Content-Scanner kann Template-Literals nicht auflösen, z. B.:
  //   `bg-${color}-50`  `text-${color}-600`  (DashboardSummary.tsx)
  // Diese Klassen müssen explizit erlaubt bleiben, damit PurgeCSS sie nicht
  // aus dem finalen Build entfernt.
  safelist: [
    // bg-<color>-50 / text-<color>-600  (SummaryCard)
    { pattern: /^bg-(emerald|blue|amber|purple)-(50|100|200)$/ },
    { pattern: /^text-(emerald|blue|amber|purple)-(500|600|700)$/ },
    // border- Varianten (im Fall zukünftiger Erweiterungen)
    { pattern: /^border-(emerald|blue|amber|purple)-(100|200)$/ },
  ],

  theme: {
    extend: {
      // Inter wird bereits per Google Fonts geladen; hier nur als fontFamily-Alias
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },

  plugins: [],
};
