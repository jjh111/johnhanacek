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

## If Send fails with a CORS error in the browser — the reliable fix

Seen 2026-09-28 twice, including after running `doGet` from the editor: the
URL answered GET, but every real send returned Google's HTML error page, "You
do not have permission to call MailApp.getRemainingDailyQuota". That page
carries no CORS header, so a browser reports it as CORS. The fix pins the
permissions down so nothing is left to Google's guesswork:

1. Replace the editor's code with the current [`Code.gs`](./Code.gs). It adds
   an `authorize` function.
2. **Project Settings** (gear, left rail) → tick **Show "appsscript.json"
   manifest file in editor**. Back in the editor, open `appsscript.json` and
   replace it with [`appsscript.json`](./appsscript.json). It declares the two
   permissions a send needs: send mail as you, and read your own address.
3. Pick **authorize** in the function dropdown → **Run** → **Review
   permissions → your account → Advanced → Go to … (unsafe) → Allow**. The
   Execution log must print `Mail quota left today: 100 · inquiries go to:
   <your gmail>`. If it prints an error, the permission is still missing.
4. **Deploy → Manage deployments** → pencil on the existing deployment →
   Version: **New version** → **Deploy**. Same URL.

### Earlier, shorter note

The script is not authorized to send mail yet. Deploying does not always ask
for the Gmail scope; running a function in the editor does.

The script is not authorized to send mail yet. Deploying does not always ask
for the Gmail scope; running a function in the editor does. Open the script,
pick **doGet** in the function dropdown, click **Run**, then **Review
permissions → your account → Advanced → Go to … (unsafe) → Allow**. No
redeploy is needed. (Seen 2026-09-28: the deployed URL answered GET but a
real POST returned Google's HTML error page, "You do not have permission to
call MailApp.getRemainingDailyQuota", which carries no CORS header, so the
browser reported CORS.)

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
