/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // HTML-Entry
    './index.html',
    // Root-Level TS/TSX (App.tsx, index.tsx, types.ts, constants.tsx, …)
    './*.{ts,tsx}',
    // Alle Komponenten (inkl. atoms/molecules/organisms)
    './components/**/*.{ts,tsx}',
    // Services & Lib
    './services/**/*.ts',
    './lib/**/*.ts',
  ],

  // ── Safelist für dynamisch aufgebaute Klassen ─────────────────────────────
  safelist: [
    // Legacy dynamic classes (DashboardSummary.tsx)
    { pattern: /^bg-(emerald|blue|amber|purple)-(50|100|200)$/ },
    { pattern: /^text-(emerald|blue|amber|purple)-(500|600|700)$/ },
    { pattern: /^border-(emerald|blue|amber|purple)-(100|200)$/ },
    // Moneta brand token classes (used dynamically in future components)
    { pattern: /^(bg|text|border)-moneta-(forest|growth|deep|sage|obsidian|offwhite)$/ },
  ],

  theme: {
    extend: {
      // ── Brand Colors ───────────────────────────────────────────────────────
      colors: {
        'moneta-forest':   '#1D4C32', // Deep Forest — primary CTA, nav active
        'moneta-growth':   '#286743', // Growth Green — hover states
        'moneta-deep':     '#044E34', // Mon-Deep — chart lines, gradient fill
        'moneta-sage':     '#78A494', // Sage-Eta — AI pulse, secondary text
        'moneta-obsidian': '#212020', // Obsidian Black — dark surfaces, guest avatar
        'moneta-offwhite': '#F8F8F7', // Off-White — page background, card surfaces
      },

      // ── Typography Scale ──────────────────────────────────────────────────
      // Hierarchy: brand-title > brand-slogan > brand-body
      // Practical rem values for screen readability
      fontSize: {
        // Titles (Inter Black 900) — responsive: use text-3xl md:text-4xl lg:text-brand-title
        'brand-title':  ['2.5rem',   { lineHeight: '1.1',  fontWeight: '900' }],
        // Slogan / pull-quotes (Inter Light 300) — airy, medium
        'brand-slogan': ['1rem',     { lineHeight: '1.5',  fontWeight: '300' }],
        // Body copy (Inter Regular 400)
        'brand-body':   ['0.875rem', { lineHeight: '1.65', fontWeight: '400' }],
      },

      // ── Inter Font Family ─────────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },

      // ── Brand Animations ──────────────────────────────────────────────────
      keyframes: {
        // Sage pulse for Gemini AI Insights component while generating
        'pulse-sage': {
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 0 0 rgba(120, 164, 148, 0.4)',
          },
          '50%': {
            opacity: '0.85',
            boxShadow: '0 0 0 8px rgba(120, 164, 148, 0)',
          },
        },
      },
      animation: {
        'pulse-sage': 'pulse-sage 2s ease-in-out infinite',
      },
    },
  },

  plugins: [],
};
