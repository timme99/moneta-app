/** PostCSS-Konfiguration für Vite + Tailwind CSS v3
 *
 * .cjs-Extension nötig, weil package.json "type":"module" setzt.
 * Vite und postcss-load-config unterstützen beide .cjs als CommonJS-Fallback.
 *
 * Plugins:
 *   tailwindcss  – erzeugt Utility-Klassen aus tailwind.config.cjs
 *   autoprefixer – ergänzt Vendor-Prefixe für ältere Browser
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
