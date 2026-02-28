/**
 * browser.js — Pets Browser for AI Agents v1.0.0
 *
 * Stealth browser with residential proxies from 10+ countries.
 * Appears as iPhone 15 Pro or Desktop Chrome to every website.
 * Bypasses Cloudflare, DataDome, PerimeterX out of the box.
 *
 * Service: https://clawpets.io
 *
 * Usage:
 *   const { launchBrowser, solveCaptcha } = require('./browser');
 *   const { browser, page } = await launchBrowser({ country: 'us' });
 *
 * Zero-config: launchBrowser() auto-registers a new agent on first call.
 * No env vars required. Credentials are saved to ~/.pets-browser/agent-credentials.json.
 *
 * Proxy config via env vars (optional — BYO mode):
 *   PB_PROXY_PROVIDER  — decodo | brightdata | iproyal | nodemaven (default: decodo)
 *   PB_PROXY_USER      — proxy username
 *   PB_PROXY_PASS      — proxy password
 *   PB_PROXY_SERVER    — full override: http://host:port
 *   PB_PROXY_COUNTRY   — country code: ro, us, de, gb, fr, nl, sg... (default: us)
 *   PB_PROXY_SESSION   — Decodo sticky port 10001-49999 (unique IP per user)
 *   PB_NO_PROXY        — set to "1" to disable proxy entirely
 *
 * Service credentials (optional — auto-generated if not set):
 *   PB_API_URL         — Pets Browser API base URL (default: https://api.clawpets.io/pets-browser/v1)
 *   PB_AGENT_TOKEN     — Full auth token: PB1.<agentId>.<agentSecret>
 *   PB_AGENT_ID        — Agent UUID (alternative to token)
 *   PB_AGENT_SECRET    — Agent secret (alternative to token)
 *
 * CAPTCHA:
 *   TWOCAPTCHA_KEY     — 2captcha.com API key (BYO)
 */

// ─── PLAYWRIGHT RESOLVER ──────────────────────────────────────────────────────

function _requirePlaywright() {
  const tries = [
    () => require('playwright'),
    () => require(`${__dirname}/../node_modules/playwright`),
    () => require(`${__dirname}/../../node_modules/playwright`),
    () => require(`${process.env.HOME || '/root'}/.openclaw/workspace/node_modules/playwright`),
    () => require('./node_modules/playwright'),
  ];
  for (const fn of tries) {
    try { return fn(); } catch (_) {}
  }
  throw new Error(
    '[pets-browser] playwright not found.\n' +
    'Run: npm install playwright && npx playwright install chromium'
  );
}

const { chromium } = _requirePlaywright();

// ─── COUNTRY CONFIGS ──────────────────────────────────────────────────────────

const COUNTRY_META = {
  ro: { locale: 'ro-RO', tz: 'Europe/Bucharest',  lat: 44.4268,  lon: 26.1025,   lang: 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7' },
  us: { locale: 'en-US', tz: 'America/New_York',   lat: 40.7128,  lon: -74.006,   lang: 'en-US,en;q=0.9' },
  uk: { locale: 'en-GB', tz: 'Europe/London',      lat: 51.5074,  lon: -0.1278,   lang: 'en-GB,en;q=0.9' },
  gb: { locale: 'en-GB', tz: 'Europe/London',      lat: 51.5074,  lon: -0.1278,   lang: 'en-GB,en;q=0.9' },
  de: { locale: 'de-DE', tz: 'Europe/Berlin',      lat: 52.5200,  lon: 13.4050,   lang: 'de-DE,de;q=0.9,en;q=0.8' },
  nl: { locale: 'nl-NL', tz: 'Europe/Amsterdam',   lat: 52.3676,  lon: 4.9041,    lang: 'nl-NL,nl;q=0.9,en;q=0.8' },
  jp: { locale: 'ja-JP', tz: 'Asia/Tokyo',         lat: 35.6762,  lon: 139.6503,  lang: 'ja-JP,ja;q=0.9,en;q=0.8' },
  fr: { locale: 'fr-FR', tz: 'Europe/Paris',       lat: 48.8566,  lon: 2.3522,    lang: 'fr-FR,fr;q=0.9,en;q=0.8' },
  ca: { locale: 'en-CA', tz: 'America/Toronto',    lat: 43.6532,  lon: -79.3832,  lang: 'en-CA,en;q=0.9' },
  au: { locale: 'en-AU', tz: 'Australia/Sydney',   lat: -33.8688, lon: 151.2093,  lang: 'en-AU,en;q=0.9' },
  sg: { locale: 'en-SG', tz: 'Asia/Singapore',     lat: 1.3521,   lon: 103.8198,  lang: 'en-SG,en;q=0.9' },
  br: { locale: 'pt-BR', tz: 'America/Sao_Paulo',  lat: -23.5505, lon: -46.6333,  lang: 'pt-BR,pt;q=0.9,en;q=0.8' },
  in: { locale: 'en-IN', tz: 'Asia/Kolkata',       lat: 28.6139,  lon: 77.2090,   lang: 'en-IN,en;q=0.9,hi;q=0.8' },
};

// ─── DEVICE PROFILES ─────────────────────────────────────────────────────────

function buildDevice(mobile, country = 'us') {
  const meta = COUNTRY_META[country.toLowerCase()] || COUNTRY_META.us;

  if (mobile) {
    return {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: meta.locale,
      timezoneId: meta.tz,
      geolocation: { latitude: meta.lat, longitude: meta.lon, accuracy: 50 },
      colorScheme: 'light',
      extraHTTPHeaders: {
        'Accept-Language': meta.lang,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
      },
    };
  }

  return {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: meta.locale,
    timezoneId: meta.tz,
    geolocation: { latitude: meta.lat, longitude: meta.lon, accuracy: 50 },
    colorScheme: 'light',
    extraHTTPHeaders: {
      'Accept-Language': meta.lang,
      'sec-ch-ua': '"Google Chrome";v="134", "Chromium";v="134", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  };
}

// ─── PROXY PRESETS ────────────────────────────────────────────────────────────

const PROXY_PRESETS = {
  decodo: {
    serverTemplate: (country, port) => `http://${country}.decodo.com:${port}`,
    usernameTemplate: (user) => user,
    defaultCountry: 'us',
    stickyPortMin: 10001,
    stickyPortMax: 49999,
  },
  brightdata: {
    server: 'http://brd.superproxy.io:33335',
    usernameTemplate: (user, country, session) =>
      `${user}-country-${country}-session-${session}`,
    defaultCountry: 'us',
  },
  iproyal: {
    server: 'http://geo.iproyal.com:12321',
    usernameTemplate: (user) => user,
    passwordTemplate: (pass, country, session) =>
      `${pass}_country-${country}_session-${session}_lifetime-30m`,
    defaultCountry: 'us',
  },
  nodemaven: {
    server: 'http://rp.nodemavenio.com:10001',
    usernameTemplate: (user, country, session) =>
      `${user}-country-${country}-session-${session}`,
    defaultCountry: 'us',
  },
};

function makeProxy(sessionId = null, country = null) {
  if (process.env.PB_NO_PROXY === '1') return null;

  const cty = (country || process.env.PB_PROXY_COUNTRY || 'us').toLowerCase();

  // 1. Full manual BYO override — explicit env vars take priority
  if (process.env.PB_PROXY_SERVER && process.env.PB_PROXY_USER) {
    return {
      server:   process.env.PB_PROXY_SERVER,
      username: process.env.PB_PROXY_USER,
      password: process.env.PB_PROXY_PASS || '',
    };
  }

  // 2. BYO provider (decodo / brightdata / iproyal / nodemaven via PB_PROXY_PROVIDER)
  //    Only activates when BOTH provider AND credentials are set.
  //    Without PB_PROXY_USER/PB_PROXY_PASS, falls through to managed mode.
  const providerName = process.env.PB_PROXY_PROVIDER;
  const providerUser = process.env.PB_PROXY_USER?.trim();
  const providerPass = process.env.PB_PROXY_PASS?.trim();
  if (providerName && PROXY_PRESETS[providerName] && providerUser && providerPass) {
    const preset = PROXY_PRESETS[providerName];
    const user = providerUser;
    const pass = providerPass;
    // Decodo: port-based sticky sessions
    if (preset.serverTemplate) {
      const portMin = preset.stickyPortMin || 10001;
      const portMax = preset.stickyPortMax || 49999;
      const randomPort = () => Math.floor(Math.random() * (portMax - portMin + 1)) + portMin;
      const parsePort = (v) => { const n = parseInt(v, 10); return (Number.isFinite(n) && n >= portMin && n <= portMax) ? n : null; };
      const port = parsePort(sessionId) ?? parsePort(process.env.PB_PROXY_SESSION) ?? randomPort();
      const server = preset.serverTemplate(cty, port);
      const username = preset.usernameTemplate(user, cty, port);
      const password = preset.passwordTemplate ? preset.passwordTemplate(pass, cty, port) : pass;
      return { server, username, password };
    }
    // Other providers: session-string based
    const sid = sessionId || process.env.PB_PROXY_SESSION || Math.random().toString(36).slice(2, 10);
    const server = preset.server;
    const username = preset.usernameTemplate(user, cty, sid);
    const password = preset.passwordTemplate ? preset.passwordTemplate(pass, cty, sid) : pass;
    return { server, username, password };
  }

  // 3. Managed mode — stable agentId:agentSecret against our forward proxy.
  //    Credentials never change so Chromium context never needs restarting for proxy reasons.
  //    Country is encoded in username as "agentId|country" and parsed server-side.
  //    Access is gated on _proxyAllowed, which is set by getCredentials() from the server's
  //    sessionGranted flag. If trial is exceeded, we return null so the browser runs without
  //    the managed proxy (will get CAPTCHAs) rather than receiving 407 from the forward proxy.
  const apiUrl = process.env.PB_API_URL || DEFAULT_API_URL;

  if (!_proxyAllowed) {
    // Trial expired or getCredentials() hasn't been called yet / returned sessionGranted=false
    return null;
  }

  const creds = resolveAgentCredentials();
  if (!creds) {
    console.warn('[pets-browser] No agent credentials found. Set PB_AGENT_TOKEN or run: npm install pets-browser');
    return null;
  }

  try {
    const proxyHost = new URL(apiUrl).hostname;
    const proxyPort = process.env.PB_PROXY_PORT || '8080';
    return {
      server:   `http://${proxyHost}:${proxyPort}`,
      username: `${creds.agentId}|${cty}`,  // forward proxy splits on '|' to get country
      password: creds.agentSecret,
    };
  } catch (_) {
    console.warn('[pets-browser] Could not parse PB_API_URL for managed proxy host.');
    return null;
  }
}

// ─── AGENT CREDENTIALS ───────────────────────────────────────────────────────

const _path   = require('path');
const _fs     = require('fs');
const _os     = require('os');
const _crypto = require('crypto');

const DEFAULT_API_URL = 'https://api.clawpets.io/pets-browser/v1';

const CREDENTIALS_FILE = _path.join(_os.homedir(), '.pets-browser', 'agent-credentials.json');
const PROFILES_DIR = _path.join(_os.homedir(), '.pets-browser', 'profiles');
const DEFAULT_PROFILE_NAME = (process.env.PB_PROFILE || 'default').trim() || 'default';

// Active browser instances keyed by profile name (for reuse mode)
// Value: { browser, ctx, proxyEnabled }
const _activeBrowsers = new Map();
const AGENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AGENT_SECRET_RE = /^[A-Za-z0-9_-]{32,200}$/;
let _cachedDockerRuntime = null;
let _sandboxModeLogged = false;

// Whether the managed forward proxy is allowed for the current process.
// Set by getCredentials() from the server's sessionGranted flag.
// makeProxy() returns null in managed mode when false, so expired-trial agents
// launch without the managed proxy (no stealth) rather than getting 407 errors.
let _proxyAllowed = false;

function isDockerRuntime() {
  if (_cachedDockerRuntime !== null) {
    return _cachedDockerRuntime;
  }

  const forced = process.env.PB_RUNTIME_DOCKER?.trim().toLowerCase();
  if (forced === '1' || forced === 'true' || forced === 'yes') {
    _cachedDockerRuntime = true;
    return true;
  }
  if (forced === '0' || forced === 'false' || forced === 'no') {
    _cachedDockerRuntime = false;
    return false;
  }

  if (process.platform !== 'linux') {
    _cachedDockerRuntime = false;
    return false;
  }

  try {
    if (_fs.existsSync('/.dockerenv')) {
      _cachedDockerRuntime = true;
      return true;
    }
  } catch (_) {}

  const markers = /(docker|containerd|kubepods|podman|lxc)/i;
  try {
    const cgroup = _fs.readFileSync('/proc/1/cgroup', 'utf-8');
    if (markers.test(cgroup)) {
      _cachedDockerRuntime = true;
      return true;
    }
  } catch (_) {}

  try {
    const cgroupSelf = _fs.readFileSync('/proc/self/cgroup', 'utf-8');
    if (markers.test(cgroupSelf)) {
      _cachedDockerRuntime = true;
      return true;
    }
  } catch (_) {}

  _cachedDockerRuntime = false;
  return false;
}

function shouldDisableSandbox() {
  const forced = process.env.PB_CHROMIUM_NO_SANDBOX?.trim().toLowerCase();
  if (forced === '1' || forced === 'true' || forced === 'yes') return true;
  if (forced === '0' || forced === 'false' || forced === 'no') return false;
  return isDockerRuntime();
}

function logSandboxMode(disableSandbox) {
  if (_sandboxModeLogged) return;
  _sandboxModeLogged = true;
  if (disableSandbox) {
    console.log('[pets-browser] Chromium sandbox disabled (container runtime detected).');
  } else {
    console.log('[pets-browser] Chromium sandbox enabled (host runtime detected).');
  }
}

/**
 * Load agent credentials saved during install.
 * Returns { agentId, agentSecret } or null if not found/invalid.
 */
function loadAgentCredentials() {
  try {
    if (!_fs.existsSync(CREDENTIALS_FILE)) return null;
    const data = JSON.parse(_fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    if (AGENT_ID_RE.test(data.agentId || '') && AGENT_SECRET_RE.test(data.agentSecret || '')) {
      return {
        agentId: data.agentId,
        agentSecret: data.agentSecret,
      };
    }
    return null;
  } catch (_) {
    return null;
  }
}

function buildAgentToken(agentId, agentSecret) {
  return `PB1.${agentId}.${agentSecret}`;
}

/**
 * Resolve agent credentials from any supported source.
 * Priority: PB_AGENT_TOKEN > PB_AGENT_ID+PB_AGENT_SECRET > credentials file.
 * Returns { agentId, agentSecret } or null.
 */
function resolveAgentCredentials() {
  // 1. PB_AGENT_TOKEN=PB1.<agentId>.<agentSecret>
  const directToken = process.env.PB_AGENT_TOKEN?.trim();
  if (directToken && directToken.startsWith('PB1.')) {
    const parts = directToken.split('.');
    if (parts.length === 3 && AGENT_ID_RE.test(parts[1]) && AGENT_SECRET_RE.test(parts[2])) {
      return { agentId: parts[1], agentSecret: parts[2] };
    }
  }

  // 2. PB_AGENT_ID + PB_AGENT_SECRET
  const envAgentId = process.env.PB_AGENT_ID?.trim();
  const envAgentSecret = process.env.PB_AGENT_SECRET?.trim();
  if (AGENT_ID_RE.test(envAgentId || '') && AGENT_SECRET_RE.test(envAgentSecret || '')) {
    return { agentId: envAgentId, agentSecret: envAgentSecret };
  }

  // 3. Saved file (~/.pets-browser/agent-credentials.json)
  return loadAgentCredentials();
}

function resolveAgentToken() {
  const creds = resolveAgentCredentials();
  return creds ? buildAgentToken(creds.agentId, creds.agentSecret) : null;
}

/**
 * Auto-register a new agent with the Pets Browser API.
 * Generates credentials, registers with the server, and saves to disk.
 * Called automatically by launchBrowser() when no credentials are found.
 *
 * @param {string} apiUrl — API base URL
 * @returns {{ agentId, agentSecret, recoveryCode } | null}
 */
async function autoRegisterAgent(apiUrl) {
  const agentId = _crypto.randomUUID();
  const agentSecret = _crypto.randomBytes(32).toString('base64url');
  const recoveryCode = _crypto.randomBytes(24).toString('base64url');

  console.log('[pets-browser] No credentials found. Auto-registering new agent...');

  try {
    const resp = await fetch(`${apiUrl.replace(/\/$/, '')}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, agentSecret, recoveryCode }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(`[pets-browser] Auto-registration failed (HTTP ${resp.status}): ${text}`);
      return null;
    }

    const data = await resp.json();
    console.log(`[pets-browser] Agent registered. Trial: ${data.trialLimit ?? 1} free session(s).`);
  } catch (err) {
    console.warn(`[pets-browser] Auto-registration failed: ${err.message}`);
    return null;
  }

  // Save credentials to disk
  const creds = {
    agentId,
    agentSecret,
    recoveryCode,
    createdAt: new Date().toISOString(),
  };

  try {
    _fs.mkdirSync(_path.dirname(CREDENTIALS_FILE), { recursive: true, mode: 0o700 });
    _fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
    console.log(`[pets-browser] Credentials saved to ${CREDENTIALS_FILE}`);
  } catch (err) {
    console.warn(`[pets-browser] Could not save credentials to disk: ${err.message}`);
  }

  // Set env vars for current process so resolveAgentCredentials() picks them up
  process.env.PB_AGENT_ID = agentId;
  process.env.PB_AGENT_SECRET = agentSecret;

  return creds;
}

// ─── SERVICE CREDENTIALS ──────────────────────────────────────────────────────

/**
 * Fetch managed credentials from Pets Browser API (proxy + captcha keys).
 *
 * Authentication: uses PB1.<agentId>.<agentSecret> token from:
 * 1) PB_AGENT_TOKEN
 * 2) PB_AGENT_ID + PB_AGENT_SECRET
 * 3) ~/.pets-browser/agent-credentials.json
 *
 * If agent has a subscription or trial remaining, returns managed
 * Decodo proxy + 2captcha credentials.
 * Falls back gracefully — agent can still use BYO credentials via env vars.
 *
 * @returns {{ ok: boolean, proxy?, captcha?, trialRemaining? }}
 */
async function getCredentials() {
  const apiUrl = process.env.PB_API_URL || DEFAULT_API_URL;

  // Resolve agent auth token
  const agentToken = resolveAgentToken();

  if (!apiUrl || !agentToken) {
    console.warn('[pets-browser] No API config. Using BYO credentials from env vars.');
    return { ok: false, reason: 'no_api_config' };
  }

  try {
    const resp = await fetch(`${apiUrl.replace(/\/$/, '')}/credentials`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${agentToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(`[pets-browser] Credentials API returned ${resp.status}: ${text}`);
      return { ok: false, reason: 'api_error', status: resp.status };
    }

    const data = await resp.json();

    // Update managed proxy access permission.
    // sessionGranted=true  → server granted a managed proxy session (trial or subscription).
    // sessionGranted=false → trial exceeded; makeProxy() will return null so the browser
    //                        launches without proxy rather than hammering the forward proxy.
    if (typeof data.sessionGranted === 'boolean') {
      _proxyAllowed = data.sessionGranted;
    }

    // Apply proxy credentials — BYO mode only.
    // Managed proxy now uses stable agentId:agentSecret via makeProxy() directly,
    // so no env vars needed and no TTL to track.
    if (data.proxy && data.proxy.source === 'byo') {
      if (data.proxy.server)   process.env.PB_PROXY_SERVER   = data.proxy.server;
      if (data.proxy.username) process.env.PB_PROXY_USER     = data.proxy.username;
      if (data.proxy.password) process.env.PB_PROXY_PASS     = data.proxy.password;
      if (data.proxy.provider) process.env.PB_PROXY_PROVIDER = data.proxy.provider;
      if (data.proxy.country)  process.env.PB_PROXY_COUNTRY  = data.proxy.country;
    } else if (!data.proxy) {
      // Server revoked BYO keys — clear any cached BYO credentials
      delete process.env.PB_PROXY_SERVER;
      delete process.env.PB_PROXY_USER;
      delete process.env.PB_PROXY_PASS;
    }

    // Apply or revoke captcha key
    if (data.captcha && data.captcha.apiKey) {
      process.env.TWOCAPTCHA_KEY = data.captcha.apiKey;
    } else {
      delete process.env.TWOCAPTCHA_KEY;
    }

    // Show trial status and upgrade link
    if (typeof data.trialRemainingMs === 'number' && !data.subscriptionActive) {
      if (data.trialRemainingMs <= 0) {
        if (data.upgradeUrl) {
          console.log(`[pets-browser] Trial expired. Subscribe to continue: ${data.upgradeUrl}`);
        } else {
          console.log('[pets-browser] Trial expired. Subscribe at https://petsbrowser.dev or use BYO keys.');
        }
      } else {
        const mins = Math.ceil(data.trialRemainingMs / 60_000);
        const display = mins >= 60
          ? `${Math.floor(mins / 60)}h ${mins % 60}m`
          : `${mins}m`;
        console.log(`[pets-browser] Trial: ${display} remaining.`);
      }
    }

    return { ok: true, ...data };
  } catch (err) {
    console.warn('[pets-browser] Failed to fetch credentials:', err.message);
    return { ok: false, reason: 'network_error', error: err.message };
  }
}

// ─── HUMAN BEHAVIOR ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function humanMouseMove(page, toX, toY, fromX = null, fromY = null) {
  const startX = fromX ?? rand(100, 300);
  const startY = fromY ?? rand(200, 600);
  const cp1x = startX + rand(-80, 80), cp1y = startY + rand(-60, 60);
  const cp2x = toX   + rand(-50, 50), cp2y = toY   + rand(-40, 40);
  const steps = rand(12, 25);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(Math.pow(1-t,3)*startX + 3*Math.pow(1-t,2)*t*cp1x + 3*(1-t)*t*t*cp2x + t*t*t*toX);
    const y = Math.round(Math.pow(1-t,3)*startY + 3*Math.pow(1-t,2)*t*cp1y + 3*(1-t)*t*t*cp2y + t*t*t*toY);
    await page.mouse.move(x, y);
    await sleep(t < 0.2 || t > 0.8 ? rand(8, 20) : rand(2, 8));
  }
}

async function humanClick(page, x, y) {
  await humanMouseMove(page, x, y);
  await sleep(rand(50, 180));
  await page.mouse.down();
  await sleep(rand(40, 100));
  await page.mouse.up();
  await sleep(rand(100, 300));
}

async function humanType(page, selector, text) {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (box) await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(rand(200, 500));
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(rand(60, 220));
    if (Math.random() < 0.08) await sleep(rand(400, 900));
  }
  await sleep(rand(200, 400));
}

async function humanScroll(page, direction = 'down', amount = null) {
  const scrollAmount = amount || rand(200, 600);
  const delta = direction === 'down' ? scrollAmount : -scrollAmount;
  const vp = page.viewportSize();
  await humanMouseMove(page, rand(100, vp.width - 100), rand(200, vp.height - 200));
  const steps = rand(4, 10);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta / steps + rand(-5, 5));
    await sleep(rand(30, 80));
  }
  await sleep(rand(200, 800));
}

async function humanRead(page, minMs = 1500, maxMs = 4000) {
  await sleep(rand(minMs, maxMs));
  if (Math.random() < 0.3) await humanScroll(page, 'down', rand(50, 150));
}

// ─── 2CAPTCHA SOLVER ──────────────────────────────────────────────────────────

async function solveCaptcha(page, opts = {}) {
  const {
    apiKey   = process.env.TWOCAPTCHA_KEY,
    action   = 'verify',
    minScore = 0.7,
    timeout  = 120000,
    verbose  = false,
  } = opts;

  const log = verbose ? (...a) => console.log('[captcha]', ...a) : () => {};
  const pageUrl = page.url();

  // Auto-detect captcha type
  const detected = await page.evaluate(() => {
    const rc = document.querySelector('.g-recaptcha, [data-sitekey]');
    if (rc) {
      const sitekey = rc.getAttribute('data-sitekey') || rc.getAttribute('data-key');
      const version = rc.getAttribute('data-version') || (typeof window.grecaptcha !== 'undefined' && 'v2');
      return { type: 'recaptcha', sitekey, version: version === 'v3' ? 'v3' : 'v2' };
    }
    const hc = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
    if (hc) return { type: 'hcaptcha', sitekey: hc.getAttribute('data-sitekey') || hc.getAttribute('data-hcaptcha-sitekey') };
    const ts = document.querySelector('.cf-turnstile, [data-cf-turnstile-sitekey]');
    if (ts) return { type: 'turnstile', sitekey: ts.getAttribute('data-sitekey') || ts.getAttribute('data-cf-turnstile-sitekey') };
    const scripts = [...document.scripts].map(s => s.src + s.textContent).join(' ');
    const rcMatch = scripts.match(/(?:sitekey|data-sitekey)['":\s]+([A-Za-z0-9_-]{40,})/);
    if (rcMatch) return { type: 'recaptcha', sitekey: rcMatch[1], version: 'v2' };
    return null;
  });

  if (!detected || !detected.sitekey) throw new Error('[captcha] No captcha detected on page.');
  log(`Detected ${detected.type} v${detected.version || ''}`, detected.sitekey.slice(0, 20) + '...');

  // Map client captcha types to server types
  const typeMap = {
    'recaptcha': detected.version === 'v3' ? 'recaptcha-v3' : 'recaptcha-v2',
    'hcaptcha': 'hcaptcha',
    'turnstile': 'turnstile',
  };
  const serverType = typeMap[detected.type] || 'recaptcha-v2';

  let token = null;

  // Try server-side solving first (managed mode — no API key needed)
  const apiUrl = process.env.PB_API_URL || DEFAULT_API_URL;
  const agentToken = resolveAgentToken();

  if (apiUrl && agentToken) {
    log('Using server-side captcha solving...');
    try {
      const resp = await fetch(`${apiUrl.replace(/\/$/, '')}/captcha/solve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${agentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          challenge: {
            type: serverType,
            siteKey: detected.sitekey,
            pageUrl,
          },
        }),
        signal: AbortSignal.timeout(timeout),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.solved && data.token) {
          token = data.token;
          log('Server solved captcha');
        } else {
          log(`Server returned no solution: ${JSON.stringify(data)}`);
        }
      } else {
        log(`Server captcha solve failed (HTTP ${resp.status})`);
      }
    } catch (err) {
      log(`Server captcha error: ${err.message}`);
    }
  }

  // Fallback: direct 2captcha call (BYO mode)
  if (!token) {
    if (!apiKey) {
      throw new Error('[captcha] No API key and server-side solving failed. Set TWOCAPTCHA_KEY env or use managed mode.');
    }
    log('Falling back to direct 2captcha...');

    let submitUrl = `https://2captcha.com/in.php?key=${apiKey}&json=1&pageurl=${encodeURIComponent(pageUrl)}&googlekey=${encodeURIComponent(detected.sitekey)}`;
    if (detected.type === 'recaptcha') {
      submitUrl += `&method=userrecaptcha`;
      if (detected.version === 'v3') submitUrl += `&version=v3&action=${action}&min_score=${minScore}`;
    } else if (detected.type === 'hcaptcha') {
      submitUrl += `&method=hcaptcha&sitekey=${encodeURIComponent(detected.sitekey)}`;
    } else if (detected.type === 'turnstile') {
      submitUrl += `&method=turnstile&sitekey=${encodeURIComponent(detected.sitekey)}`;
    }

    const submitResp = await fetch(submitUrl);
    const submitData = await submitResp.json();
    if (!submitData.status || submitData.status !== 1) throw new Error(`[captcha] Submit failed: ${JSON.stringify(submitData)}`);
    const taskId = submitData.request;
    log(`Task submitted: ${taskId}`);

    const maxAttempts = Math.floor(timeout / 5000);
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(i === 0 ? 15000 : 5000);
      const pollResp = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
      const pollData = await pollResp.json();
      if (pollData.status === 1) { token = pollData.request; log('Solved!'); break; }
      if (pollData.request !== 'CAPCHA_NOT_READY') throw new Error(`[captcha] Poll error: ${JSON.stringify(pollData)}`);
      log(`Waiting... ${i + 1}/${maxAttempts}`);
    }
    if (!token) throw new Error('[captcha] Timeout waiting for captcha solution');
  }

  // Inject token into page
  await page.evaluate(({ type, token }) => {
    if (type === 'recaptcha' || type === 'turnstile') {
      const ta = document.querySelector('#g-recaptcha-response, [name="g-recaptcha-response"]');
      if (ta) { ta.style.display = 'block'; ta.value = token; ta.dispatchEvent(new Event('change', { bubbles: true })); }
      try {
        const clients = window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients;
        if (clients) Object.values(clients).forEach(c => Object.values(c).forEach(w => { if (w && typeof w.callback === 'function') w.callback(token); }));
      } catch (_) {}
    }
    if (type === 'hcaptcha') {
      const ta = document.querySelector('[name="h-captcha-response"], #h-captcha-response');
      if (ta) { ta.style.display = 'block'; ta.value = token; ta.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (type === 'turnstile') {
      const inp = document.querySelector('[name="cf-turnstile-response"]');
      if (inp) { inp.value = token; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }, { type: detected.type, token });

  log('Token injected');
  return { token, type: detected.type, sitekey: detected.sitekey };
}

// ─── LAUNCH ───────────────────────────────────────────────────────────────────

/**
 * Apply stealth anti-detection scripts to a browser context.
 */
async function applyStealthScripts(ctx, mobile, locale) {
  await ctx.addInitScript((m) => {
    Object.defineProperty(navigator, 'webdriver',           { get: () => false });
    Object.defineProperty(navigator, 'maxTouchPoints',      { get: () => m.mobile ? 5 : 0 });
    Object.defineProperty(navigator, 'platform',            { get: () => m.mobile ? 'iPhone' : 'Win32' });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => m.mobile ? 6 : 8 });
    Object.defineProperty(navigator, 'language',            { get: () => m.locale });
    Object.defineProperty(navigator, 'languages',           { get: () => [m.locale, 'en'] });
    if (m.mobile) {
      Object.defineProperty(screen, 'width',       { get: () => 393 });
      Object.defineProperty(screen, 'height',      { get: () => 852 });
      Object.defineProperty(screen, 'availWidth',  { get: () => 393 });
      Object.defineProperty(screen, 'availHeight', { get: () => 852 });
    }
    // WebRTC leak protection
    if (window.RTCPeerConnection) {
      const OrigRTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function(...args) {
        if (args[0] && args[0].iceServers) args[0].iceServers = [];
        return new OrigRTC(...args);
      };
      window.RTCPeerConnection.prototype = OrigRTC.prototype;
    }
    // Navigator connection
    if (navigator.connection) {
      try {
        Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
        Object.defineProperty(navigator.connection, 'rtt',           { get: () => 50 });
        Object.defineProperty(navigator.connection, 'downlink',      { get: () => 10 });
      } catch (_) {}
    }
    // Chrome runtime stub
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = { connect: () => {}, sendMessage: () => {} };
  }, { mobile, locale });
}

/**
 * Build a result object returned by launchBrowser().
 */
function buildResult(browser, ctx, page) {
  return {
    browser, ctx, page,
    humanClick, humanMouseMove, humanType, humanScroll, humanRead,
    solveCaptcha: (captchaOpts) => solveCaptcha(page, captchaOpts),
    sleep, rand,
  };
}

/**
 * Launch a stealth browser with residential proxy and device fingerprint.
 *
 * @param {Object}  opts
 * @param {string}  opts.country   — 'us'|'ro'|'gb'|'de'|'nl'|'jp'|'fr'|'ca'|'au'|'sg' (default: 'us')
 * @param {boolean} opts.mobile    — iPhone 15 Pro (true) or Desktop Chrome (false). Default: true
 * @param {boolean} opts.useProxy  — Enable residential proxy. Default: true
 * @param {boolean} opts.headless  — Headless mode. Default: true
 * @param {string}  opts.session   — Sticky session ID / Decodo port (unique IP per value)
 * @param {string}  opts.profile   — Persistent profile name. Saves cookies/localStorage between launches.
 *                                   Default: "default". Pass null for ephemeral.
 * @param {boolean} opts.reuse     — Reuse running browser for this profile. Proxy mode must match
 *                                   the existing live context. Default: true
 *
 * @returns {{ browser, ctx, page, humanClick, humanMouseMove, humanType, humanScroll, humanRead, solveCaptcha, sleep, rand }}
 */
async function launchBrowser(opts = {}) {
  const {
    country  = null,
    mobile   = true,
    useProxy = true,
    headless = true,
    session  = null,
    profile  = DEFAULT_PROFILE_NAME,
    reuse    = true,
  } = opts;
  const normalizedProfile = typeof profile === 'string' ? profile.trim() : profile;
  const profileName = normalizedProfile === '' ? DEFAULT_PROFILE_NAME : normalizedProfile;

  const cty = country || process.env.PB_PROXY_COUNTRY || 'us';

  // ── Reuse: return existing browser if alive ──
  // Reuse is only safe when requested proxy mode matches the live context.
  // Playwright cannot swap proxy config on an already running context.
  if (reuse && profileName) {
    const active = _activeBrowsers.get(profileName);
    if (active) {
      const requestedProxyEnabled = Boolean(useProxy) && process.env.PB_NO_PROXY !== '1';
      const activeProxyEnabled = Boolean(active.proxyEnabled);
      if (requestedProxyEnabled !== activeProxyEnabled) {
        throw new Error(
          `[pets-browser] Reuse refused for profile "${profileName}": ` +
          `existing context proxy=${activeProxyEnabled ? 'on' : 'off'}, requested proxy=${requestedProxyEnabled ? 'on' : 'off'}. ` +
          'Close this profile (closeBrowser) or launch with reuse:false/new profile to change proxy mode.'
        );
      }

      try {
        active.ctx.pages(); // throws if context is dead
        const page = await active.ctx.newPage();
        console.log(`[pets-browser] Reusing browser for profile "${profileName}"`);
        return buildResult(active.browser, active.ctx, page);
      } catch (_) {
        // Context died — remove and fall through to fresh launch
        _activeBrowsers.delete(profileName);
      }
    }
  }

  // ── Fresh launch: ensure credentials exist and fetch managed config ──
  if (!resolveAgentCredentials()) {
    await autoRegisterAgent(process.env.PB_API_URL || DEFAULT_API_URL);
  }
  try {
    await getCredentials();
  } catch (e) {
    console.warn('[pets-browser] Could not fetch managed credentials:', e.message);
  }

  const device = buildDevice(mobile, cty);
  const meta   = COUNTRY_META[cty.toLowerCase()] || COUNTRY_META.us;
  const proxy  = useProxy ? makeProxy(session, cty) : null;

  // Fail-closed: refuse to launch without proxy unless explicitly opted out.
  // A silent fallback to no-proxy would expose the agent's real datacenter IP,
  // defeating the entire purpose of a stealth browser.
  // Users who intentionally want no proxy must set useProxy:false or PB_NO_PROXY=1.
  if (useProxy && !proxy && process.env.PB_NO_PROXY !== '1') {
    throw new Error(
      '[pets-browser] Proxy unavailable — auto-registration failed or trial/subscription expired. ' +
      'Set PB_NO_PROXY=1 to launch without proxy, or provide BYO credentials via PB_PROXY_SERVER/PB_PROXY_USER.'
    );
  }

  const disableSandbox = shouldDisableSandbox();
  logSandboxMode(disableSandbox);

  const launchArgs = [
    '--ignore-certificate-errors',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
  ];
  if (disableSandbox) {
    launchArgs.unshift('--disable-setuid-sandbox');
    launchArgs.unshift('--no-sandbox');
  }
  if (process.env.PB_DISABLE_WEB_SECURITY === '1') {
    launchArgs.push('--disable-web-security');
  }

  const ctxOpts = {
    ...device,
    ignoreHTTPSErrors: true,
    permissions: ['geolocation', 'notifications'],
  };
  if (proxy) ctxOpts.proxy = proxy;

  // ── Persistent profile: launchPersistentContext ──
  if (profileName) {
    const safeName = encodeURIComponent(profileName);
    const profileDir = _path.join(PROFILES_DIR, safeName);
    _fs.mkdirSync(profileDir, { recursive: true });

    const ctx = await chromium.launchPersistentContext(profileDir, {
      headless,
      args: launchArgs,
      ...ctxOpts,
    });

    await applyStealthScripts(ctx, mobile, meta.locale);
    const page = ctx.pages()[0] || await ctx.newPage();
    const browser = ctx.browser();
    const result = buildResult(browser, ctx, page);

    if (reuse) {
      _activeBrowsers.set(profileName, { browser, ctx, proxyEnabled: Boolean(proxy) });
    }

    console.log(`[pets-browser] Launched with persistent profile "${profileName}"`);
    return result;
  }

  // ── Ephemeral: standard launch (only when profile === null) ──
  const browser = await chromium.launch({
    headless,
    args: launchArgs,
  });

  const ctx = await browser.newContext(ctxOpts);
  await applyStealthScripts(ctx, mobile, meta.locale);
  const page = await ctx.newPage();

  return buildResult(browser, ctx, page);
}

/**
 * Close a reused browser by profile name.
 * No-op if the profile has no active browser.
 *
 * @param {string} profile — Profile name to close (default: 'default')
 */
async function closeBrowser(profile = 'default') {
  const active = _activeBrowsers.get(profile);
  if (!active) return;
  _activeBrowsers.delete(profile);
  try {
    await active.ctx.close();
  } catch (_) {}
}

// ─── SHADOW DOM UTILITIES ─────────────────────────────────────────────────────

async function shadowQuery(page, selector) {
  return page.evaluateHandle((sel) => {
    function q(root, s) {
      const el = root.querySelector(s); if (el) return el;
      for (const n of root.querySelectorAll('*')) if (n.shadowRoot) { const f = q(n.shadowRoot, s); if (f) return f; }
    }
    return q(document, sel) || null;
  }, selector);
}

async function shadowFill(page, selector, value) {
  await page.evaluate(({ sel, val }) => {
    function q(root, s) {
      const el = root.querySelector(s); if (el) return el;
      for (const n of root.querySelectorAll('*')) if (n.shadowRoot) { const f = q(n.shadowRoot, s); if (f) return f; }
    }
    const el = q(document, sel);
    if (!el) throw new Error('shadowFill: not found: ' + sel);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel: selector, val: value });
}

async function shadowClickButton(page, buttonText) {
  await page.evaluate((text) => {
    function find(root) {
      for (const b of root.querySelectorAll('button')) if (b.textContent.trim() === text) return b;
      for (const n of root.querySelectorAll('*')) if (n.shadowRoot) { const f = find(n.shadowRoot); if (f) return f; }
    }
    const btn = find(document);
    if (!btn) throw new Error('shadowClickButton: not found: ' + text);
    btn.click();
  }, buttonText);
}

async function dumpInteractiveElements(page) {
  return page.evaluate(() => {
    const res = [];
    function collect(root) {
      for (const el of root.querySelectorAll('input,textarea,button,select,[contenteditable]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0)
          res.push({ tag: el.tagName, name: el.name || '', id: el.id || '', type: el.type || '', text: el.textContent?.trim().slice(0, 25) || '', placeholder: el.placeholder?.slice(0, 25) || '' });
      }
      for (const n of root.querySelectorAll('*')) if (n.shadowRoot) collect(n.shadowRoot);
    }
    collect(document);
    return res;
  });
}

// ─── RICH TEXT EDITOR UTILITIES ───────────────────────────────────────────────

async function pasteIntoEditor(page, editorSelector, text) {
  const el = await page.$(editorSelector);
  if (!el) throw new Error('pasteIntoEditor: editor not found: ' + editorSelector);
  await el.click();
  await sleep(300);
  await page.evaluate((t) => {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }, text);
  await page.keyboard.press('Control+a');
  await sleep(100);
  await page.keyboard.press('Control+v');
  await sleep(500);
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  // Main
  launchBrowser, closeBrowser, getCredentials, autoRegisterAgent,

  // Human-like interaction
  humanClick, humanMouseMove, humanType, humanScroll, humanRead,

  // CAPTCHA
  solveCaptcha,

  // Shadow DOM utilities
  shadowQuery, shadowFill, shadowClickButton, dumpInteractiveElements,

  // Rich text editors
  pasteIntoEditor,

  // Internals (exposed for advanced users)
  makeProxy, buildDevice,

  // Helpers
  sleep, rand, COUNTRY_META,
};

// ─── QUICK TEST ───────────────────────────────────────────────────────────────
if (require.main === module) {
  const country = process.argv[2] || 'us';
  console.log(`Testing Pets Browser v1.0.0 — country: ${country.toUpperCase()}\n`);
  (async () => {
    const { browser, page } = await launchBrowser({ country, mobile: true });
    await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const info = JSON.parse(await page.textContent('body'));
    console.log(`IP:      ${info.ip}`);
    console.log(`Country: ${info.country} (${info.city})`);
    console.log(`Org:     ${info.org}`);
    console.log(`TZ:      ${info.timezone}`);
    const ua = await page.evaluate(() => navigator.userAgent);
    console.log(`UA:      ${ua.slice(0, 80)}...`);
    if (browser) {
      await browser.close();
    } else {
      await page.context().close();
    }
    console.log('\nPets Browser v1.0.0 is ready.');
  })().catch(console.error);
}
