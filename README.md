MUNify
======

Modern Model UN registration + form designer leveraging Google Sheets & Apps Script.

Features
--------
- Visual form designer (editable HTML preview + code view)
- Google Sign-In (ID token only; no persistent refresh tokens stored)
- Automatic or manual setup of a backing Google Sheet
- Lightweight Apps Script Web App endpoint (register, append, invite, redeem)
- Invite tokens (24h) to whitelist additional collaborators
- Sheet picker & optional automatic provisioning (beta)
- Minimal, responsive UI built with Tailwind
- Global ESC key closes confirmation overlays (UX convenience)
 - Toggleable dark mode (persists; respects system preference until changed)

Guided Setup Flow (Hosted / GitHub Pages)
----------------------------------------
1. Open the site root (`index.html`). Click Get Started to open Settings.
2. Use the Guided Wizard: Sign In → Sheet → Endpoint → Finish.
   - Sheet step: select an existing spreadsheet or create a new one.
   - Endpoint step: verify & register an existing Apps Script Web App URL OR Provision (beta) a personal script.
3. At Finish you'll see Sheet ID, Key, and (if available) Apps Script URL. Copy/export as needed.
4. Open Designer, customize your form, then share `form/#<KEY>`; invite collaborators if needed.

Building CSS (Tailwind)
-----------------------
This project uses Tailwind for styling. For production, build a local CSS bundle and remove the temporary CDN (optional performance hardening):

```bash
npm install
npm run build:css
```

Development watch mode:

```bash
npm run watch:css
```

Local Preview
-------------
Use any simple static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Google Integration Details
--------------------------
Terminology:
- ID Token: Short-lived Google Identity Services token; validated server-side to obtain user email.
- Key: Short opaque identifier created during register; maps to a Sheet + whitelist.
- Apps Script URL: Your deployed Web App endpoint (ends in `/exec`).

Flows:
1. Manual Register
   - Deploy `apps_script/Code.js` & `appsscript.json` as a Web App (Execute as you, anyone with link can access).
   - Paste Web App URL into Settings and click Register. A Sheet is created server-side; key saved locally.
2. Automatic Setup
   - Runs sign-in, optional sheet selection, register (if Web App URL known) or attempts provisioning.
3. Provision (Beta)
   - Uses Script API & Sheets API to create a personal project + spreadsheet. (Some deployments may still require manual Web App deployment for URL acquisition; current beta stores project + deployment IDs.)

Data Stored Locally (localStorage)
- `munify_config`: JSON with `idToken`, `sheetId`, optional `key`, etc.
- `munifyAppsScriptUrl`: User-provided or site default Apps Script URL.
- `munifyFormCode`: Saved HTML for designed form.
- `munifyTheme`: User-selected theme ("light" or "dark"). Remove this key to revert to system preference.

Security Notes
--------------
- No refresh tokens stored; only short-lived ID tokens retrieved when needed.
- Server validates ID token audience, issuer, expiry, and email verification.
- Whitelisting ensures only approved emails can append delegate rows.
- Rate limiting (basic) in Apps Script reduces rapid repeated submissions.
- Storage migration: legacy `munifyScriptUrl` automatically migrated to `munifyAppsScriptUrl` on load.

Invite Tokens
-------------
Owner can create a 24h token (Settings → Create Invite). Others visit `invite/#<TOKEN>` and redeem while signed-in to join whitelist.

Form Sharing
------------
After setup: share `form/#<KEY>` or just `form/` (if using hash-based key separation). Users must be whitelisted or redeem an invite first.

Troubleshooting
---------------
- not_whitelisted: Use an invite token or ensure you registered endpoint.
- Verification failed: Confirm Web App deployment uses correct access & copy the `/exec` URL (not `/dev`).
- Lost key: Re-run Quick Setup (generates a new mapping) or export key beforehand.

Directory Overview
------------------
- `index.html` – Landing (navigation + background globe) pointing to unified Settings flow.
- `settings/` – Single canonical configuration area: sheet picker, provisioning, endpoint management.
- `design/` – Form designer (preview + code editing & save/reset).
- `form/` – Public delegate form (consumes key & sheet ID).
- `invite/` – Invite token redemption.
- `apps_script/` – Server-side Apps Script sources (deploy as Web App).
- `assets/js/auth.js` – Auth + register + provisioning + advanced helpers.
- `assets/js/ui.js` – Toast & confirm utilities.
 - `assets/js/theme.js` – Theme manager (applies `[data-theme]`).
 - `assets/css/theme.css` – Dark mode overrides.

Extending
---------
You can add additional endpoints in `apps_script/Code.js` (e.g., read delegates subset) and expose UI buttons that call them through fetch.

Planned Enhancements (Ideas)
----------------------------
- Export submissions as CSV client-side
- Role-based permissions (owner vs editor)
- Dedicated CLI/Action for provisioning

GitHub Pages
------------
Designed to be hosted under the repo path (relative URLs). Ensure `earth.glb` and built CSS are deployed.

License
-------
GPLv3. See `LICENSE`.
