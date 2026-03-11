<p align="center">
  <img src="assets/clawnet-logo.png" width="360" height="360" alt="Clawnet" />
</p>

<p>Stealth browser for AI agents. One install — anti-detection, residential proxies, CAPTCHA solving.</p>

## The problem

AI agents that use Playwright or Puppeteer get blocked. Every major website runs anti-bot detection, and a default automated browser fails on dozens of signals simultaneously.

### How websites detect automated browsers

**Browser fingerprint**

| Signal | What it reveals | Default Playwright |
|--------|-----------------|--------------------|
| `navigator.webdriver` | Automation flag | `true` — instant ban |
| `chrome.runtime` | Chrome extension API | Missing — flags headless |
| `navigator.plugins` | Installed plugins | Empty array — no real browser has zero plugins |
| `navigator.languages` | Language preferences | Often `['en-US']` regardless of IP location |
| `navigator.connection` | Network info (effectiveType, rtt, downlink) | Missing or wrong — real browsers always have it |
| `navigator.hardwareConcurrency` | CPU cores | Default value doesn't match claimed device |
| `navigator.platform` | OS identifier | Mismatches between UA string and actual platform |
| Screen resolution | Device dimensions | 800x600 or 0x0 in headless — no real device has that |

**Network fingerprint**

| Signal | What it reveals | Default Playwright |
|--------|-----------------|--------------------|
| IP reputation | Datacenter vs residential | Datacenter IPs are flagged instantly — AWS, GCP, Azure IPs are in blocklists |
| IP geolocation | Physical location | Mismatches timezone/locale — IP says Virginia but `Intl.DateTimeFormat` says UTC |
| WebRTC leak | Real IP behind proxy | Leaks actual IP through STUN requests even with proxy configured |
| TLS fingerprint (JA3/JA4) | TLS handshake pattern | Headless Chrome has a distinct TLS signature |
| HTTP headers | Header order, values | Missing or wrong `sec-ch-ua`, `sec-fetch-*` headers |

**Behavioral fingerprint**

| Signal | What it reveals | Default Playwright |
|--------|-----------------|--------------------|
| Mouse movement | Human vs bot | `page.click()` teleports cursor — zero movement, zero time |
| Typing speed | Human vs bot | `page.type()` sends all chars at uniform 0ms intervals |
| Scroll pattern | Human vs bot | `page.evaluate('scrollBy')` — instant jump, no inertia |
| Navigation pattern | Browsing history | Direct URL access with no referrer, no cookie history, no tab behavior |
| Timing | Request cadence | Millisecond-precise actions with no pauses — humans don't work at 10ms intervals |

**Active challenges**

| System | Used by | What it does |
|--------|---------|--------------|
| Cloudflare Bot Management | ~20% of all websites | JavaScript challenge + Turnstile CAPTCHA + behavioral analysis |
| DataDome | E-commerce, travel, ticketing | Real-time fingerprint + mouse/keyboard analysis |
| PerimeterX (HUMAN) | Airlines, banking, retail | Device fingerprint + behavioral biometrics |
| Akamai Bot Manager | Enterprise sites | TLS fingerprint + browser fingerprint + behavioral |
| reCAPTCHA v2/v3 | Google services, forms | Image challenge (v2) or invisible risk scoring (v3) |
| hCaptcha | Cloudflare free tier, many sites | Image classification challenge |
| Cloudflare Turnstile | Growing adoption | Invisible challenge with proof-of-work |

A default Playwright browser fails **all of these simultaneously**. Setting `navigator.webdriver = false` alone doesn't help — sites check 50+ signals and flag inconsistencies between them.

## How Clawnet solves this

Clawnet uses **PinchTab** — a CLI-driven browser automation tool that controls Chromium with anti-detection baked in. Your AI agent runs shell commands to navigate, read pages, and interact with elements. Clawnet adds residential proxies and CAPTCHA solving on top.

```
Agent → pinchtab CLI → Chromium (stealth) → Website
                         ↓
                    Clawnet proxy → Residential IP
```

### Anti-detection

PinchTab launches Chromium with stealth patches that pass fingerprint checks:

```
navigator.webdriver         → false
navigator.platform          → matches UA
navigator.hardwareConcurrency → matches device
navigator.languages         → matches proxy country
navigator.connection        → realistic values
chrome.runtime              → stub with connect() and sendMessage()
screen dimensions           → matches device profile
timezone                    → matches IP country
WebRTC                      → STUN servers stripped — no IP leak
```

### Residential proxies

Datacenter IPs get flagged. Clawnet routes through real residential IPs via Decodo:

13 countries with matching locale, timezone, and geolocation:

`us` `gb` `de` `nl` `fr` `jp` `ca` `au` `sg` `br` `in` `ro` `uk`

Each session gets a unique residential IP. The browser's locale, timezone, and geolocation all match the proxy country.

### CAPTCHA solving

Detects and solves CAPTCHAs via the Clawnet API:

1. Detect CAPTCHA type and sitekey on the page
2. Send challenge to `POST /captcha/solve` with agent token
3. API solves via 2captcha and returns solution token
4. Inject token into the page and trigger callbacks

Supports: **reCAPTCHA v2**, **reCAPTCHA v3**, **hCaptcha**, **Cloudflare Turnstile**.

### Human behavior

PinchTab's `type` command sends keystrokes one-by-one with realistic timing. Combined with residential IPs and consistent fingerprints, this passes behavioral analysis.

## Quick start

### Install

```bash
# 1. Install PinchTab CLI
curl -fsSL https://install.clawpets.io/install.sh | bash

# 2. Install Chromium (if not already installed)
brew install --cask chromium

# 3. Install Clawnet (registers agent credentials on postinstall)
npm install clawnet
```

On `npm install`:
1. Runs `postinstall.js` to generate agent credentials (`agentId` + `agentSecret` + `recoveryCode`)
2. Saves to `~/.clawnet/agent-credentials.json`
3. Registers with Clawnet API (starts a 2-hour free trial on first launch)

### Basic usage

```bash
# Start PinchTab with US residential proxy
./scripts/launch.sh us &

# Wait for Chromium to be ready
for i in $(seq 1 30); do
  pinchtab instances 2>/dev/null | grep -q '"running"' && break
  sleep 1
done

# Navigate
pinchtab nav https://example.com/login

# Read the page (accessibility tree with clickable refs)
pinchtab snap -i
# → textbox "Email" [ref=e2]
# → textbox "Password" [ref=e3]
# → button "Sign in" [ref=e4]

# Fill and submit
pinchtab fill e2 "user@example.com"
pinchtab type e3 "password123"
pinchtab click e4

# Take a screenshot
pinchtab ss
```

### Modes

| Mode | How it works | Cost |
|------|-------------|------|
| **Managed** | Agent authenticates with `agentId:agentSecret`; proxy and CAPTCHA secrets stay on server | 2-hour free trial, then subscription |
| **BYO** | You provide your own proxy + captcha keys via env vars | Free forever |
| **No proxy** | `CN_NO_PROXY=1` — direct connection, local testing | Free |

## PinchTab CLI reference

| Command | Description |
|---------|-------------|
| `pinchtab nav <url>` | Navigate to URL |
| `pinchtab snap` | Accessibility tree with `[ref=eN]` annotations |
| `pinchtab snap -i` | Interactive elements only (buttons, inputs, links) |
| `pinchtab snap -d` | Diff since last snapshot (saves tokens) |
| `pinchtab snap -c` | Compact format (most token-efficient) |
| `pinchtab text` | Clean readable text content |
| `pinchtab click <ref>` | Click element by ref |
| `pinchtab fill <ref> "value"` | Fill input (clears first) |
| `pinchtab type <ref> "value"` | Type keystroke-by-keystroke |
| `pinchtab select <ref> "option"` | Select dropdown option |
| `pinchtab hover <ref>` | Hover over element |
| `pinchtab press <key>` | Press keyboard key |
| `pinchtab scroll <ref\|px>` | Scroll to element or by pixels |
| `pinchtab ss` | Take screenshot (base64 JPEG) |
| `pinchtab ss -o file.jpg` | Save screenshot to file |
| `pinchtab eval "js"` | Execute JavaScript in page context |
| `pinchtab tabs` | List open tabs |
| `pinchtab tabs new <url>` | Open new tab |
| `pinchtab instances` | Check Chromium instance status |
| `pinchtab pdf -o page.pdf` | Export page as PDF |

Full agent-facing documentation: [SKILL.md](./SKILL.md)

## CAPTCHA solving

```bash
# 1. Detect CAPTCHA on the page
pinchtab eval "(function(){ var rc=document.querySelector('[data-sitekey]'); return rc ? JSON.stringify({sitekey:rc.getAttribute('data-sitekey')}) : null; })()"

# 2. Solve via Clawnet API
CREDS_FILE="$HOME/.clawnet/agent-credentials.json"
AGENT_ID=$(python3 -c "import json; print(json.load(open('$CREDS_FILE'))['agentId'])")
AGENT_SECRET=$(python3 -c "import json; print(json.load(open('$CREDS_FILE'))['agentSecret'])")

curl -X POST https://api.clawpets.io/clawnet/v1/captcha/solve \
  -H "Authorization: Bearer CN1.${AGENT_ID}.${AGENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
    "challenge": {
      "type": "recaptcha-v2",
      "pageUrl": "https://example.com/login",
      "siteKey": "DETECTED_SITEKEY"
    }
  }'
# Response: {"solved":true,"token":"03AFY_a8..."}

# 3. Inject token into the page
pinchtab eval "(function(){ var ta=document.querySelector('#g-recaptcha-response'); if(ta){ta.value='SOLVED_TOKEN';} try{Object.values(window.___grecaptcha_cfg.clients).forEach(function(c){Object.values(c).forEach(function(w){if(w&&typeof w.callback==='function')w.callback('SOLVED_TOKEN');});});}catch(e){} return 'done'; })()"
```

Supported types: `recaptcha-v2`, `recaptcha-v3`, `hcaptcha`, `turnstile`

## Configuration

Copy `.env.example` → `.env`:

```bash
# Managed mode (subscription)
CN_API_URL=https://api.clawpets.io/clawnet/v1

# BYO mode (bring your own)
CN_PROXY_PROVIDER=decodo          # decodo | brightdata | iproyal | nodemaven
CN_PROXY_USER=
CN_PROXY_PASS=
CN_PROXY_COUNTRY=us
# CN_NO_PROXY=1                   # Disable proxy entirely

# CAPTCHA solving (BYO fallback only)
# TWOCAPTCHA_KEY=
```

## Supported countries

```bash
./scripts/launch.sh us    # United States
./scripts/launch.sh gb    # United Kingdom
./scripts/launch.sh de    # Germany
./scripts/launch.sh nl    # Netherlands
./scripts/launch.sh fr    # France
./scripts/launch.sh jp    # Japan
./scripts/launch.sh ca    # Canada
./scripts/launch.sh au    # Australia
./scripts/launch.sh sg    # Singapore
./scripts/launch.sh br    # Brazil
./scripts/launch.sh in    # India
./scripts/launch.sh ro    # Romania
```

## Credential model

- `agentId` — stable, identifies the subscription owner
- `agentSecret` — used for auth, rotated automatically on each `/credentials` call
- `recoveryCode` — can rotate `agentSecret` if the old secret is lost

Server enforces `1 subscriptionId = 1 agentId`.

### Trial

On the first API call, a **2-hour free trial** starts. After expiry, `launch.sh` shows an upgrade URL. Subscription activates automatically after payment (webhook).

## License

MIT
