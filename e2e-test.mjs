/**
 * E2E-Test für moneta-invest.de
 * Testet: Health → Stock-Quotes (US, DE, ETF/ISIN) → Rate-Limit-Handling
 *
 * Aufruf: node e2e-test.mjs
 */

const BASE = 'https://www.moneta-invest.de';

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m✔\x1b[0m';
const RED    = '\x1b[31m✘\x1b[0m';
const YELLOW = '\x1b[33m⚠\x1b[0m';
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM    = (s) => `\x1b[2m${s}\x1b[0m`;

let passed = 0, failed = 0, warned = 0;

function ok(label, detail = '')  { passed++; console.log(`  ${GREEN} ${label}${detail ? DIM(' → ' + detail) : ''}`); }
function fail(label, detail = '') { failed++; console.log(`  ${RED} ${label}${detail ? DIM(' → ' + detail) : ''}`); }
function warn(label, detail = '') { warned++; console.log(`  ${YELLOW} ${label}${detail ? DIM(' → ' + detail) : ''}`); }

async function get(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res  = await fetch(url, { headers: { 'Accept': 'application/json', ...opts.headers }, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

function section(title) {
  console.log(`\n${BOLD('══ ' + title + ' ══')}`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testHealth() {
  section('1 · Health Check');
  const { status, body } = await get('/api/health');

  if (status === 200) ok('Endpoint erreichbar (HTTP 200)');
  else fail(`Endpoint nicht erreichbar: HTTP ${status}`);

  // Env-Var-Checks aus dem Body auslesen
  for (const [key, val] of Object.entries(body?.checks ?? {})) {
    const v = val;
    if (v?.ok) ok(`${key}`, v.message);
    else        fail(`${key}`, v?.message ?? 'fehlt');
  }

  if (body.status === 'OK')    ok('Gesamt-Status: OK');
  else if (body.status)        fail(`Gesamt-Status: ${body.status}`, body.hint ?? '');
}

async function testStockQuote(label, params, expectations = {}) {
  const qs  = new URLSearchParams(params).toString();
  const { status, body } = await get(`/api/stocks?${qs}`);

  if (status === 200 && body.price > 0) {
    ok(`${label}`, `${body.symbol}  Kurs=${body.price}  Δ=${body.change?.toFixed(2)}  Währ=${body.currency}`);
    if (expectations.currency && body.currency !== expectations.currency)
      warn(`Währung erwartet ${expectations.currency}, bekommen ${body.currency}`);
    if (body._cached) warn('Antwort aus Cache (24h)', new Date(body._cachedAt).toLocaleString('de-DE'));
    return true;
  }

  if (status === 429 || body.limitReached) {
    warn(`${label}: Rate-Limit erreicht`, 'Cache-Fallback wird genutzt');
    if (body.price > 0) ok('Cache-Fallback liefert Preis', body.price);
    return null;
  }

  if (status === 404 || body.error?.includes('Keine Kursdaten')) {
    fail(`${label}: Kein Kurs gefunden`, body.error ?? '');
    return false;
  }

  fail(`${label}: HTTP ${status}`, JSON.stringify(body).slice(0, 120));
  return false;
}

async function testStockQuotes() {
  section('2 · Aktien-Kurse (api/stocks)');

  // US-Aktien
  await testStockQuote('Apple   (AAPL)',      { symbol: 'AAPL' },      { currency: 'USD' });
  await testStockQuote('Microsoft (MSFT)',    { symbol: 'MSFT' },      { currency: 'USD' });
  await testStockQuote('NVIDIA (NVDA)',       { symbol: 'NVDA' },      { currency: 'USD' });

  // Deutsche Aktien (XETRA)
  await testStockQuote('SAP (SAP.DEX)',       { symbol: 'SAP.DEX' },   { currency: 'EUR' });
  await testStockQuote('Siemens (SIE.DEX)',   { symbol: 'SIE.DEX' },   { currency: 'EUR' });

  // ETFs via ISIN
  await testStockQuote('MSCI World ISIN',     { isin: 'IE00B4L5Y983' }, { currency: 'USD' });
  await testStockQuote('S&P500 ETF ISIN',     { isin: 'IE00B5BMR087' }, { currency: 'USD' });
}

async function testNewsMode() {
  section('3 · News-Sentiment (mode=chat)');
  const { status, body } = await get('/api/stocks?symbol=AAPL&mode=chat');

  if (status === 200 && Array.isArray(body.comments)) {
    ok(`News-Feed erhalten`, `${body.comments.length} Einträge`);
    if (body.comments.length > 0) ok('Erster Eintrag', body.comments[0].slice(0, 80) + '…');
  } else if (status === 429 || body.limitReached) {
    warn('News-Sentiment: Rate-Limit');
  } else {
    fail(`News-Sentiment fehlgeschlagen: HTTP ${status}`, body.error ?? '');
  }
}

async function testFinancialDataNoAuth() {
  section('4 · Financial-Data Endpoint (Auth-Check)');
  const { status, body } = await get('/api/financial-data?q=Apple');

  if (status === 401) {
    ok('Auth-Guard greift korrekt (HTTP 401 ohne Token)');
  } else if (status === 200) {
    warn('Endpoint antwortet ohne Auth – prüfe Bearer-Token-Guard');
  } else {
    warn(`Unerwarteter Status: HTTP ${status}`, body.error ?? '');
  }
}

async function testCorsHeaders() {
  section('5 · CORS-Header');
  const res = await fetch(`${BASE}/api/stocks?symbol=AAPL`, {
    method: 'OPTIONS',
    headers: { 'Origin': 'https://example.com' },
    signal: AbortSignal.timeout(10_000),
  });

  if (res.headers.get('access-control-allow-origin') === '*') ok('Access-Control-Allow-Origin: *');
  else fail('Access-Control-Allow-Origin fehlt oder falsch', res.headers.get('access-control-allow-origin'));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(BOLD(`\n🧪  Moneta E2E-Test  →  ${BASE}`));
  console.log(DIM(`   ${new Date().toLocaleString('de-DE')}\n`));

  try {
    await testHealth();
    await testStockQuotes();
    await testNewsMode();
    await testFinancialDataNoAuth();
    await testCorsHeaders();
  } catch (e) {
    console.error(`\n${RED} Unerwarteter Fehler:`, e.message);
    failed++;
  }

  // ── Zusammenfassung ──────────────────────────────────────────────────────
  console.log(`\n${BOLD('══ Ergebnis ══')}`);
  console.log(`  ${GREEN} Bestanden : ${passed}`);
  console.log(`  ${RED} Fehlge.   : ${failed}`);
  console.log(`  ${YELLOW} Warnungen : ${warned}`);
  console.log();

  if (failed === 0) console.log(BOLD('  ✅  Alle kritischen Tests bestanden!\n'));
  else              console.log(BOLD('  ❌  Es gibt fehlgeschlagene Tests – siehe oben.\n'));

  process.exit(failed > 0 ? 1 : 0);
}

main();
