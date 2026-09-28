# Inquiry relay — deploy once

The site's inquiry card sends through this Google Apps Script. It emails you
from your own Gmail, to your own Gmail, with the visitor's address as Reply-To.
Until `SITE.inquiryEndpoint` is set in `scripts/jh-chrome.js`, the card stays on
the mail-app route, so nothing breaks while this is undeployed.

## Steps (about ten minutes, signed in as the Gmail that receives hi@)

1. Go to <https://script.google.com> → **New project**. Name it
   `johnhanacek.com inquiry relay`.
2. Delete the starter code and paste in all of [`Code.gs`](./Code.gs).
3. **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, then **Authorize access**. Google warns that the app is
   unverified because you wrote it: **Advanced → Go to … (unsafe)** → **Allow**.
   It asks to send email as you. That is the only permission it needs.
5. Copy the **Web app URL**. It ends in `/exec`.
6. Paste it into `scripts/jh-chrome.js`:
   `inquiryEndpoint: 'https://script.google.com/macros/s/…/exec'`,
   bump `version`, and run `node scripts/sync-version.mjs`.
7. Check it: open the URL in a browser. It should answer
   `{"ok":true,"service":"johnhanacek.com inquiry relay"}`.

## Optional

- **A Gmail filter** on `subject:"[Inquiry"` OR `subject:"[Hiring]"` → label
  *Inquiries*, never send to spam, star it.
- **Script Property `TO`** (Project Settings → Script Properties) redirects the
  mail somewhere other than the script owner's Gmail.
- **Editing the script later:** Deploy → **Manage deployments** → edit the
  existing deployment → Version: *New version*. That keeps the same URL. A
  *New deployment* makes a new URL, which the site would not know about.

## What it refuses

| Case | Response | Sent? |
|---|---|---|
| Hidden honeypot field filled, or Send under 3 s after the card appeared | `ok: true` (a bot is not told why) | no |
| Missing or malformed email | `error: email` | no |
| Paragraph under 20 characters, or over 6,000 | `error: short` / `long` | no |
| Their paragraph missing from the composed body | `error: bad-request` | no |
| More than 3 per email address, or 30 in total, in an hour | `error: rate` | no |
| Gmail's daily quota spent (100 recipients a day on a consumer account) | `error: quota` | no |

On any error the card offers the mail-app route and Copy, so a visitor is never
stuck.

## If spam gets through

Add Cloudflare Turnstile: a free, invisible check. It needs a Cloudflare
account, but not a DNS move. The page would render the widget, and this
script would verify its token with one `UrlFetchApp` call before sending.
