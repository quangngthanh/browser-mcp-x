# BrowserMCP Pro — LemonSqueezy Setup (10 min)

This document explains how to provision a LemonSqueezy account, create the
BrowserMCP Pro product, and obtain an API key for backend management.

The extension code calls LemonSqueezy's public License API directly
(`/v1/licenses/validate`, `/v1/licenses/activate`) — no server-side key
generation, no shared secret in the repo. This is the right model for
selling one-time-purchase software with proper license enforcement.

---

## 1. Create the LemonSqueezy store (5 min)

1. Go to https://www.lemonsqueezy.com and click **Sign up**.
2. Verify your email (you'll get a confirmation link).
3. After login, LemonSqueezy prompts you to create a store:
   - **Store name:** `Tabtii`
   - **URL:** `https://tabtii.lemonsqueezy.com` (the `tabtii` slug is taken
     only if someone else grabbed it; otherwise pick the closest available)
4. Complete the payout setup (bank account or PayPal). This is required before
   you can charge real money. LemonSqueezy holds the funds until you reach
   the payout threshold.
5. Fill in the tax / business profile. As a German/EU seller LemonSqueezy
   will collect VAT on digital sales for EU customers (VAT MOSS) by default.
   For B2B customers (other EU businesses with a valid VAT ID) you can
   enable reverse-charge to bill them net.

---

## 2. Create the BrowserMCP Pro product (3 min)

1. In your LemonSqueezy dashboard: **Products → New product**.
2. **Name:** `BrowserMCP Pro`
3. **Description (short):** "Unlock 10 advanced browser-control tools for AI
   agents: highlight, wait_for_element, click_by_id, type_by_id, click_text,
   hover, drag_and_drop, handle_dialog, get_markdown, get_interactive_elements.
   One-time purchase, lifetime updates."
4. **Price:** `$9.00 USD` (or pick your currency — LemonSqueezy auto-converts
   to ~140 currencies at checkout).
5. **Type:** `One-time payment`.
6. **Quantity limits:** leave default (no minimum, no maximum per order).
7. **Cover image:** upload the 1280×640 promo tile from
   `webstore/promo-templates/marquee-promo-1400x560.html` rendered to PNG
   (or any clean product mockup).

---

## 3. Enable License Keys on the product (1 min)

1. Open the product detail page.
2. Click **Product options** (or the gear icon) → **License keys**.
3. Toggle **"Generate license keys"** → ON.
4. **Activation limit:** `1` (each key works on one machine, which is what
   most users want for a personal license).
5. **Auto-expires after:** leave blank (lifetime license).
6. Save.

From now on, every successful purchase automatically:
- Generates a unique 32-char license key (groups of 8, hyphenated)
- Emails the key to the buyer (configurable in the "Receipts" section)
- Logs the purchase + key in your LemonSqueezy dashboard

---

## 4. Get the checkout URL (10 sec)

1. In the product detail page, click **Share** → copy the **Direct checkout
   link** (looks like `https://tabtii.lemonsqueezy.com/buy/<product-id>`).
2. Open `docs/index.html`, find line ~599:
   ```html
   <a class="btn btn-amber" href="https://tabtii.lemonsqueezy.com/buy/..." ...>
   ```
3. Replace `...` with your actual product ID and commit.

You can also use LemonSqueezy's "Buy button" to generate embeddable HTML if
you want a card-style checkout on the landing page.

---

## 5. (Optional) Get the API key — only if you want server-side admin (2 min)

You only need this if you want to:
- Query sales/license stats from a script
- Programmatically issue refunds
- Build a license-management dashboard

1. Dashboard → **Settings → API**.
2. Click **Create new API key**.
3. **Name:** `BrowserMCP Server`
4. **Scopes:** leave defaults; you don't need anything beyond `read` for analytics.
5. Copy the key (starts with `lemonsqueezy_…`) and store it in your password
   manager. **It is only shown once.**

If you don't need any of the above, skip this step — the extension works
entirely against LemonSqueezy's public License API, which needs no auth.

---

## 6. End-to-end smoke test (3 min, after section 3)

1. From a logged-out Chrome window, visit your checkout URL.
2. Use LemonSqueezy's **Test mode** (toggle in the dashboard top right)
   to simulate a purchase with the test card `4242 4242 4242 4242`.
3. LemonSqueezy sends a receipt email with the license key (or shows it
   directly in the success page).
4. In the BrowserMCP extension popup, paste the key, click **Pro aktivieren**.
5. The Pro badge should turn green within ~2 seconds. The "highlight" tool
   (or any other Pro tool) is now usable from your MCP client.

---

## Troubleshooting

- **"License key invalid" at activation** — check the key format
  (32 chars in 4 groups of 8, hyphenated). If the buyer copy-pasted with
  extra whitespace, strip it first.
- **"Instance limit reached"** — buyer used the key on a different machine.
  Tell them to deactivate the old instance first (or, in your dashboard,
  manually reset the activations for that key).
- **Key emails not arriving** — check LemonSqueezy → Settings → Receipts.
  Make sure "License key" is included in the receipt template.
- **VAT concerns** — LemonSqueezy handles EU VAT MOSS by default. For
  non-EU sales no VAT is added. For US sales, sales tax is calculated
  based on the buyer's state (where required by law).

---

## Recap — what lives where

| Component | Where | Sensitive? |
|-----------|-------|------------|
| Product definition, price, description | LemonSqueezy dashboard | No |
| Activation limit (1 per key) | LemonSqueezy dashboard | No |
| License keys (per purchase) | LemonSqueezy dashboard | **Yes** — buyers' keys, treat as PII |
| API key (only for server-side admin) | Your password manager / `~/.config/lemonsqueezy` | **Yes** — never commit |
| Checkout URL | `docs/index.html` (public) | No |
| Validation logic | `background.js` (public) | No |
| Activation cache | `chrome.storage.local` on the user's machine | No |

The earlier (insecure) offline SHA-256 keygen has been removed. The public
secret `bmcp_2...salt` from the old `tools/keygen.py` is now irrelevant
and not used anywhere in the new code path.
