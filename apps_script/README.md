MUNify Apps Script web app

What this provides
- A small Apps Script web app that stores mappings between a short key and a Google Sheet ID.
- Endpoints for registering a mapping (owner), appending delegate rows (whitelist-checked), issuing 24h invite tokens and redeeming them.

Deployment
1. Open Google Apps Script (script.google.com) and create a new project.
2. Copy the contents of `Code.js` into the project script file.
3. In Project Settings enable `Execute the app as: Me` and `Who has access: Anyone` (or set to `Anyone with the link` depending on needs).
4. Deploy -> New deployment -> Select type: Web app. Set access to "Anyone" or "Anyone with Google account" as required.
5. Save the deployment URL. Use that URL from the static site to call endpoints.

Endpoints
- GET    /?action=get&key=KEY
- POST   /?action=register  { key, sheetId, id_token }
- POST   /?action=append    { key, id_token, values: [...] }
- POST   /?action=invite    { key, id_token } -> returns inviteToken
- POST   /?action=redeem    { token, id_token }

Notes
- This is a simple reference implementation. For production, consider adding stronger auth, rate-limits, and logging.
