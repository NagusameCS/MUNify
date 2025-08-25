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

CORS / Allowed origins
You can limit which origins may call the web app by setting a script property named `munify_allowed_origins` with a comma-separated list of allowed origins (for example: `https://yourusername.github.io`).

To set the property in Apps Script editor: `PropertiesService.getScriptProperties().setProperty('munify_allowed_origins', 'https://yourusername.github.io')` or set it programmatically in your deployment script.

Per-user provisioning (beta)
---------------------------------
The static site includes a browser-driven provisioning flow that attempts to create a spreadsheet and an Apps Script project under the signed-in user's account. This flow is experimental and has caveats (OAuth consent, manifest/deployment quirks). To use it from GH Pages:

1. Make sure the site is hosted on GitHub Pages (e.g. https://<yourusername>.github.io/MUNify or similar).
2. The provisioning code reads the template files from the GH Pages URLs:
	- `/apps_script/user_template/Code.js`
	- `/apps_script/user_template/appsscript.json`
	Ensure those files are accessible at `https://<yourusername>.github.io/MUNify/apps_script/user_template/Code.js` etc.
3. On the site Settings, click "Provision user API". The browser will prompt for consent for the required scopes. Follow the prompt.
4. The provisioning flow will return `{ spreadsheetId, projectId, deploymentId }` if successful. Open the Apps Script project at `https://script.google.com/home/projects/PROJECT_ID` to inspect and manually deploy if necessary.

Notes and troubleshooting
- If the Apps Script deployment step fails, manually open the created project and deploy a web app (this resolves common programmatic deployment issues).
- OAuth verification: if you use these provisioning scopes in production, you may need to set up an OAuth consent screen and verification for sensitive scopes.
- Consider a server-backed provisioning service if you need a more robust, user-friendly flow.
