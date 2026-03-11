/**
 * captcha-inject.js — Standalone CAPTCHA detection and token injection
 *
 * These are JavaScript snippets designed to be executed via PinchTab's
 * `pinchtab eval` command or `POST /tabs/{tabId}/evaluate` endpoint.
 *
 * Usage from CLI:
 *   # Detect CAPTCHA type and sitekey
 *   pinchtab eval "$(cat scripts/captcha-detect.js)"
 *
 *   # Inject solved token (replace TOKEN and TYPE)
 *   pinchtab eval "(function(){ var type='recaptcha'; var token='03AFY_a8...'; ... })()"
 *
 * The detection and injection are separate steps because solving happens
 * externally via Clawnet's /captcha/solve API.
 */

// ── DETECTION SNIPPET ──────────────────────────────────────────────────────
// Copy this into `pinchtab eval` to detect CAPTCHA type and sitekey.
// Returns JSON: { type, sitekey, version } or null

const DETECT_CAPTCHA = `
(function() {
  // reCAPTCHA v2/v3
  var rc = document.querySelector('.g-recaptcha, [data-sitekey]');
  if (rc) {
    var sitekey = rc.getAttribute('data-sitekey') || rc.getAttribute('data-key');
    var version = rc.getAttribute('data-version') || (typeof window.grecaptcha !== 'undefined' && 'v2');
    return JSON.stringify({ type: 'recaptcha', sitekey: sitekey, version: version === 'v3' ? 'v3' : 'v2' });
  }

  // hCaptcha
  var hc = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
  if (hc) {
    return JSON.stringify({ type: 'hcaptcha', sitekey: hc.getAttribute('data-sitekey') || hc.getAttribute('data-hcaptcha-sitekey') });
  }

  // Cloudflare Turnstile
  var ts = document.querySelector('.cf-turnstile, [data-cf-turnstile-sitekey]');
  if (ts) {
    return JSON.stringify({ type: 'turnstile', sitekey: ts.getAttribute('data-sitekey') || ts.getAttribute('data-cf-turnstile-sitekey') });
  }

  // Fallback: check script sources for sitekey patterns
  var scripts = Array.from(document.scripts).map(function(s) { return s.src + s.textContent; }).join(' ');
  var rcMatch = scripts.match(/(?:sitekey|data-sitekey)['":\\s]+([A-Za-z0-9_-]{40,})/);
  if (rcMatch) {
    return JSON.stringify({ type: 'recaptcha', sitekey: rcMatch[1], version: 'v2' });
  }

  return JSON.stringify(null);
})()
`.trim();


// ── INJECTION SNIPPET BUILDER ──────────────────────────────────────────────
// Call buildInjectSnippet(type, token) to get a JS string for pinchtab eval.

function buildInjectSnippet(type, token) {
  // Escape token for safe embedding in JS string
  const safeToken = token.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return `
(function() {
  var type = '${type}';
  var token = '${safeToken}';

  if (type === 'recaptcha' || type === 'turnstile') {
    var ta = document.querySelector('#g-recaptcha-response, [name="g-recaptcha-response"]');
    if (ta) {
      ta.style.display = 'block';
      ta.value = token;
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    }
    try {
      var clients = window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients;
      if (clients) {
        Object.values(clients).forEach(function(c) {
          Object.values(c).forEach(function(w) {
            if (w && typeof w.callback === 'function') w.callback(token);
          });
        });
      }
    } catch(e) {}
  }

  if (type === 'hcaptcha') {
    var hta = document.querySelector('[name="h-captcha-response"], #h-captcha-response');
    if (hta) {
      hta.style.display = 'block';
      hta.value = token;
      hta.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (type === 'turnstile') {
    var inp = document.querySelector('[name="cf-turnstile-response"]');
    if (inp) {
      inp.value = token;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  return 'injected';
})()
`.trim();
}

module.exports = { DETECT_CAPTCHA, buildInjectSnippet };
