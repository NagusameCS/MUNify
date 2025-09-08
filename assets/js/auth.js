// Minimal MUNify auth + setup helper (uses Google OAuth2 token client for API access)
(function(){
  const CLIENT_ID = '73123638661-ai7rhojisdd2kq7oc64out0t9s57k2d7.apps.googleusercontent.com';
  const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
  ].join(' ');

  // Additional scopes for provisioning a user Apps Script project
  const PROVISION_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.deployments'
  ].join(' ');

  function save(obj){ localStorage.setItem('munify_config', JSON.stringify(obj)); }
  function load(){ try { return JSON.parse(localStorage.getItem('munify_config')||'{}'); } catch(e){ return {}; } }

  // One-time storage key migration (legacy keys -> new canonical keys)
  (function migrateStorage(){
    try {
      const legacyScript = localStorage.getItem('munifyScriptUrl');
      if (legacyScript && !localStorage.getItem('munifyAppsScriptUrl')) {
        localStorage.setItem('munifyAppsScriptUrl', legacyScript);
        localStorage.removeItem('munifyScriptUrl');
      }
    } catch(e) { /* ignore */ }
  })();

  // Read a site-level default Apps Script URL from a meta tag (optional)
  function siteAppsScriptUrl() {
    try {
      const m = document.querySelector('meta[name="munify-apps-script-url"]');
      if (m && m.content && m.content.trim()) return m.content.trim();
    } catch(e){}
    return null;
  }

  // Token client (initialized lazily)
  let tokenClient = null;
  function ensureTokenClient(){
    if (tokenClient) return tokenClient;
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      console.warn('Google OAuth2 client not available yet');
      return null;
    }
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        // callback is handled per-request in getAccessToken
      }
    });
    return tokenClient;
  }

  // Request an OAuth access token for the requested scopes (returns access_token)
  function requestOAuthToken(scopes) {
    return new Promise((resolve, reject) => {
      const client = ensureTokenClient();
      if (!client) return reject(new Error('OAuth client not initialized'));
      // override scope for this request
      client.requestAccessToken({ scope: scopes, prompt: '' , callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        resolve(resp.access_token || resp.accessToken || resp);
      }});
    });
  }

  async function requestAccess(){
    // Request an ID token (no access tokens stored client-side)
    return new Promise((resolve, reject)=>{
      if (!window.google || !window.google.accounts || !window.google.accounts.id) return reject(new Error('Google Identity not loaded'));
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r)=>{
        try { const cfg = load(); cfg.idToken = r.credential; save(cfg); } catch(e){ console.warn('Could not save idToken', e); }
        resolve(r.credential);
      }});
      try { window.google.accounts.id.prompt(); } catch(e){ /* ignore */ }
    });
  }

  // Helper: if user has signed in and no local key exists, attempt automatic registration
  async function autoRegisterIfNeeded() {
    const cfg = load();
    if (cfg && cfg.key) return { status: 'already_configured' };
    let appsScriptUrl = localStorage.getItem('munifyAppsScriptUrl') || siteAppsScriptUrl();
    const idToken = cfg && cfg.idToken;
    if (!idToken) return { status: 'no_id_token' };
    // ensure id token is valid / refresh if needed
    try {
      const refreshed = await ensureValidIdToken();
      if (refreshed) {
        const nc = load(); appsScriptUrl = appsScriptUrl || localStorage.getItem('munifyAppsScriptUrl') || siteAppsScriptUrl();
      }
    } catch(e) { /* continue; we'll attempt with existing token */ }
    // Try automatic register with a small retry/backoff in case of transient failures
    if (appsScriptUrl && registerWithServer) {
      const user = decodeJwt(idToken) || {};
      const title = 'MUNify - ' + (user.email || user.name || 'User');
      let attempt = 0;
      const maxAttempts = 3;
      let lastErr = null;
      while (attempt < maxAttempts) {
        try {
          // perform a quick health-check before trying the register endpoint
          const ok = await checkAppsScriptHealth(appsScriptUrl).catch(e => false);
          if (!ok && attempt === 0) {
            // if the site-level URL exists but health fails, fall back to local storage URL if any
            const localUrl = localStorage.getItem('munifyAppsScriptUrl');
            if (localUrl && localUrl !== appsScriptUrl) appsScriptUrl = localUrl;
          }
          const res = await registerWithServer(appsScriptUrl, title);
          return { status: 'registered', result: res };
        } catch (e) {
          lastErr = e;
          attempt++;
          const backoff = 250 * attempt;
          await new Promise(r => setTimeout(r, backoff));
        }
      }
      return { status: 'error', error: lastErr };
    }

    // fallback: try per-user provisioning if available
    if (typeof provisionUserApi === 'function') {
      try {
        const user = decodeJwt(idToken) || {};
        const res = await provisionUserApi('MUNify - User API');
        if (res && res.spreadsheetId) {
          const cfg2 = load(); cfg2.sheetId = res.spreadsheetId; save(cfg2);
          return { status: 'provisioned', result: res };
        }
        return { status: 'provisioned_no_id', result: res };
      } catch (e) { return { status: 'error', error: e }; }
    }

    return { status: 'no_action' };
  }

  // Quick health-check for an Apps Script web app: call ?action=pong or a simple GET and expect JSON/200
  async function checkAppsScriptHealth(appsScriptUrl) {
    try {
      const u = new URL(appsScriptUrl);
      u.searchParams.set('action', 'ping');
      const res = await fetch(u.toString(), { method: 'GET', mode: 'cors' });
      if (!res.ok) return false;
      // if it returns JSON with {ok:true} that's ideal; accept any 2xx
      return true;
    } catch (e) { return false; }
  }

  // Ensure the stored ID token is present and not near expiry. If it's missing or expiring
  // within `thresholdSec` seconds, attempt to call requestAccess() to get a fresh token.
  async function ensureValidIdToken(thresholdSec = 300) {
    try {
      const cfg = load();
      let token = cfg && cfg.idToken;
      if (!token) {
        const newTok = await requestAccess();
        return !!newTok;
      }
      const decoded = decodeJwt(token);
      if (!decoded || !decoded.exp) return !!(await requestAccess());
      const now = Math.floor(Date.now() / 1000);
      if ((decoded.exp - now) < thresholdSec) {
        const newTok = await requestAccess();
        return !!newTok;
      }
      return true;
    } catch (e) {
      console.warn('ensureValidIdToken failed', e);
      return false;
    }
  }

  function getIdToken(){ const c=load(); return c.idToken || null; }

  function decodeJwt(token){ try { const p = token.split('.')[1]; return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/'))); } catch(e){return null;} }
  function getUserEmail(){ const t = decodeJwt(load().idToken); return t && (t.email || t.preferred_username) || null; }

  // Server-side register: ask Apps Script to create the spreadsheet and return key + sheetId
  async function registerWithServer(appsScriptUrl, title){
    const idToken = getIdToken();
    if (!idToken) throw new Error('Not signed in');
    const res = await fetch(appsScriptUrl + '?action=register', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ id_token: idToken, title: title }) });
    const j = await res.json();
    if (!res.ok || j.error) throw new Error(j.error || 'register_failed');
    const cfg = load(); cfg.key = j.key; cfg.sheetId = j.sheetId; save(cfg);
    return j;
  }

  // Provision a user-owned Apps Script web app + spreadsheet.
  // Returns { spreadsheetId, projectId, deploymentId, webAppUrl? }
  async function provisionUserApi(title) {
    // 1) obtain access token with required scopes
    const accessToken = await requestOAuthToken(PROVISION_SCOPES);
    if (!accessToken) throw new Error('Could not obtain access token');

    // 2) create a new spreadsheet in user's Drive
    const sheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { title: title || ('MUNify - ' + (getUserEmail() || 'Form')) } })
    });
    if (!sheetRes.ok) {
      const txt = await sheetRes.text(); throw new Error('Sheets create failed: ' + txt);
    }
    const sheetJson = await sheetRes.json();
    const spreadsheetId = sheetJson.spreadsheetId || sheetJson.spreadsheetId || sheetJson.spreadsheetId;

    // 3) create a new Apps Script project under the user's account
    const projRes = await fetch('https://script.googleapis.com/v1/projects', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'MUNify API' })
    });
    if (!projRes.ok) { const t = await projRes.text(); throw new Error('Script project create failed: ' + t); }
    const projJson = await projRes.json();
    const projectId = projJson.scriptId;

    // 4) upload template files into the project
    // Fetch the local template files from the repo path '/apps_script/user_template/Code.js' and 'appsscript.json'
    // Note: when served from GH Pages these files are accessible at /apps_script/user_template/...
    const codeResp = await fetch('/apps_script/user_template/Code.js');
    const codeText = await codeResp.text();
    const manifestResp = await fetch('/apps_script/user_template/appsscript.json');
    const manifestText = await manifestResp.text();

    const updateRes = await fetch(`https://script.googleapis.com/v1/projects/${projectId}/content`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [ { name: 'Code', type: 'SERVER_JS', source: codeText }, { name: 'appsscript', type: 'JSON', source: manifestText } ] })
    });
    if (!updateRes.ok) { const t = await updateRes.text(); throw new Error('Script update content failed: ' + t); }

    // 5) create a deployment (web app)
    const depBody = {
      deploymentConfig: {
        description: 'MUNify web app',
        manifestFileName: 'appsscript'
      }
    };
    const deployRes = await fetch(`https://script.googleapis.com/v1/projects/${projectId}/deployments`, {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(depBody)
    });
    if (!deployRes.ok) { const t = await deployRes.text(); throw new Error('Script deploy failed: ' + t); }
    const deployJson = await deployRes.json();
    // Attempt to extract web app URL from entry points (if present)
    let webAppUrl = null;
    try {
      if (deployJson.entryPoints && Array.isArray(deployJson.entryPoints)) {
        const web = deployJson.entryPoints.find(e => (e.entryPointType||e.type) === 'WEB_APP');
        if (web && (web.url || web.webApp && web.webApp.url)) webAppUrl = web.url || (web.webApp && web.webApp.url);
      }
    } catch (e) { /* ignore parse failures */ }

    // Persist discovered URL for unified flow
    if (webAppUrl) {
      try { localStorage.setItem('munifyAppsScriptUrl', webAppUrl); } catch(e) {}
    }

    const result = { spreadsheetId, projectId, deploymentId: deployJson.deploymentId, webAppUrl: webAppUrl || null, deployInfo: deployJson };
    // Save sheetId into config if not already present
    try { const cfg = load(); if (spreadsheetId && !cfg.sheetId) { cfg.sheetId = spreadsheetId; save(cfg); } } catch(e) {}
    return result;
  }

  // create an invite token (server issues 24h token by default)
  async function createInvite(appsScriptUrl, key, ttlSeconds){
    const idToken = getIdToken(); if (!idToken) throw new Error('Not signed in');
    const body = { id_token: idToken, key: key };
    if (typeof ttlSeconds === 'number') body.ttl = ttlSeconds;
    const res = await fetch(appsScriptUrl + '?action=invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || 'invite_failed'); return j;
  }

  // redeem an invite token to add the signed-in user to the whitelist
  async function redeemInvite(appsScriptUrl, token){
    const idToken = getIdToken(); if (!idToken) throw new Error('Not signed in');
    const res = await fetch(appsScriptUrl + '?action=redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_token: idToken, token: token }) });
    const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || 'redeem_failed'); return j;
  }

  function cryptoRandom(len){ const bytes=new Uint8Array(len); crypto.getRandomValues(bytes); return Array.from(bytes).map(b=>('0'+b.toString(16)).slice(-2)).join(''); }

  // client no longer initializes sheets directly; server does it during register

  // no client-side batch updates anymore

  function exportKeyFile(){ const cfg=load(); if (!cfg.key) throw new Error('No key configured'); const payload={key:cfg.key,created:new Date().toISOString(),email:getUserEmail()}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`munify-key-${cfg.key}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

  function getConfig(){ return load(); }

  // append via server instead of using Sheets API directly
  async function appendViaServer(appsScriptUrl, key, values){
    const idToken = getIdToken(); if (!idToken) throw new Error('Not signed in');
    const res = await fetch(appsScriptUrl + '?action=append', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ id_token: idToken, key: key, values: values }) });
    const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || 'append_failed'); return j;
  }

  // Insert new advanced integration helpers below
  if (!window.MUNauthAdvanced) {
    window.MUNauthAdvanced = {};
  }

  // Return stored config object (reuse existing getConfig if present)
  const _getCfg = window.MUNauth && window.MUNauth.getConfig ? window.MUNauth.getConfig : () => ({})

  // Acquire an access token for generic Drive/Sheets/Script scopes (silent if possible)
  async function getAccessToken(scopesOverride){
    try {
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) throw new Error('OAuth2 client not loaded');
      const scopes = scopesOverride || [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/spreadsheets.readonly'
      ].join(' ');
      return await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: '73123638661-ai7rhojisdd2kq7oc64out0t9s57k2d7.apps.googleusercontent.com',
          scope: scopes,
          callback: (resp) => { if (resp && resp.access_token) resolve(resp.access_token); else reject(new Error(resp.error || 'no_access_token')); }
        });
        client.requestAccessToken({ prompt: '' });
      });
    } catch (e){ console.warn('getAccessToken failed', e); throw e; }
  }

  // List spreadsheets (basic) using Drive search: mimeType spreadsheet & user owns or can edit.
  async function listSpreadsheets(limit=50){
    const token = await getAccessToken('https://www.googleapis.com/auth/drive.metadata.readonly');
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${limit}&fields=files(id,name,modifiedTime,owners(displayName,emailAddress))`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token }});
    if (!res.ok) throw new Error('Could not list spreadsheets');
    const data = await res.json();
    return data.files || [];
  }

  // Store chosen sheetId & name in munify_config
  function setSheet(sheetId, name){
    const cfg = _getCfg();
    cfg.sheetId = sheetId; if (name) cfg.sheetName = name; localStorage.setItem('munify_config', JSON.stringify(cfg));
    return cfg;
  }

  // Fetch a small sample from Delegates sheet to verify access through Apps Script endpoint
  async function pullDelegates(appsScriptUrl, key){
    if (!appsScriptUrl) throw new Error('missing_apps_script_url');
    if (!key) throw new Error('missing_key');
    const cfg = _getCfg();
    const idToken = cfg.idToken; if (!idToken) throw new Error('not_signed_in');
    const url = appsScriptUrl + '?action=get&key=' + encodeURIComponent(key);
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('get_failed');
    const j = await res.json(); if (j.error) throw new Error(j.error);
    return j.mapping || {};
  }

  // Push row convenience wrapper (delegates) via existing appendViaServer
  async function pushDelegateRow(appsScriptUrl, key, row){
    if (!Array.isArray(row)) throw new Error('row_not_array');
    return window.MUNauth.appendViaServer(appsScriptUrl, key, row);
  }

  // Create a new spreadsheet (utility used by settings page)
  async function createSheet(title){
    const accessToken = await getAccessToken('https://www.googleapis.com/auth/spreadsheets');
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method:'POST', headers:{ Authorization:'Bearer '+accessToken, 'Content-Type':'application/json' }, body: JSON.stringify({ properties:{ title: title || ('MUNify Sheet ' + new Date().toISOString().slice(0,10)) } })
    });
    if (!res.ok) throw new Error('sheet_create_failed');
    const j = await res.json();
    if (j.spreadsheetId) setSheet(j.spreadsheetId, title);
    return j;
  }

  // Full automatic provisioning pipeline:
  // 1) Ensure ID token (sign in)
  // 2) (Optional) Sheet selection or creation
  // 3) Register with existing Apps Script OR provision a user-owned one
  // Returns structured result used by UI to display instructions
  async function runAutoSetup(opts={}){
    const result = { steps: [] };
    const pushStep = (name, status, detail) => { result.steps.push({ name, status, detail }); };
    try {
      // Step 1: Sign-in / ensure id token
      pushStep('sign_in', 'pending');
      await window.MUNauth.requestAccess();
      pushStep('sign_in', 'ok');

      const cfg = _getCfg();

      // Step 2: Sheet selection (if sheetId already chosen skip)
      if (!cfg.sheetId && opts.pickSheet) {
        pushStep('pick_sheet', 'pending');
        try {
          const sheets = await listSpreadsheets();
          if (!sheets.length) {
            pushStep('pick_sheet', 'empty', 'No spreadsheets found in Drive');
          } else {
            // choose first for auto mode unless opts.sheetId provided
            const chosen = opts.sheetId ? sheets.find(s=>s.id===opts.sheetId) : sheets[0];
            if (chosen) { setSheet(chosen.id, chosen.name); pushStep('pick_sheet', 'ok', chosen); }
            else pushStep('pick_sheet', 'skipped', 'Provided sheet not found');
          }
        } catch(e){ pushStep('pick_sheet', 'error', e.message || String(e)); }
      }

      // Step 3: Register with existing server (if Apps Script URL known) else provisioning
      const serverUrl = localStorage.getItem('munifyAppsScriptUrl') || opts.appsScriptUrl;
      if (serverUrl) {
        pushStep('register_server', 'pending', serverUrl);
        try {
          const title = 'MUNify - ' + (window.MUNauth.getUserEmail() || 'User');
          const reg = await window.MUNauth.registerWithServer(serverUrl, title);
          pushStep('register_server', 'ok', reg);
          result.key = reg.key; result.sheetId = reg.sheetId; result.appsScriptUrl = serverUrl;
        } catch(e){ pushStep('register_server', 'error', e.message || String(e)); }
      } else if (opts.allowProvision) {
        pushStep('provision_user', 'pending');
        try {
          const prov = await window.MUNauth.provisionUserApi('MUNify - User API');
          pushStep('provision_user', 'ok', prov);
          result.provision = prov; result.sheetId = prov.spreadsheetId; result.projectId = prov.projectId;
        } catch(e){ pushStep('provision_user', 'error', e.message || String(e)); }
      } else {
        pushStep('register_server', 'skipped', 'No server URL and provisioning disabled');
      }

      return result;
    } catch (e){
      pushStep('fatal', 'error', e.message || String(e));
      return result;
    }
  }

  window.MUNauthAdvanced.listSpreadsheets = listSpreadsheets;
  window.MUNauthAdvanced.setSheet = setSheet;
  window.MUNauthAdvanced.pullDelegates = pullDelegates;
  window.MUNauthAdvanced.pushDelegateRow = pushDelegateRow;
  window.MUNauthAdvanced.runAutoSetup = runAutoSetup;
  window.MUNauthAdvanced.createSheet = createSheet;
})();
