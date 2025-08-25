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
        const cfg = load(); cfg.idToken = r.credential; save(cfg);
        resolve(r.credential);
      }});
      try { window.google.accounts.id.prompt(); } catch(e){ /* ignore */ }
    });
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
    // Create a new version first
    const versionRes = await fetch(`https://script.googleapis.com/v1/projects/${projectId}/versions`, {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ versionNumber: 1, description: 'Initial MUNify deployment' })
    });
    // Note: the versions create endpoint may reject manual versionNumber; fall back to deploy directly if that fails
    // Try to create a deployment
    const depBody = {
      deploymentConfig: {
        description: 'MUNify web app',
        manifestFileName: 'appsscript',
        versionNumber: 1
      }
    };
    const deployRes = await fetch(`https://script.googleapis.com/v1/projects/${projectId}/deployments`, {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(depBody)
    });
    if (!deployRes.ok) { const t = await deployRes.text(); throw new Error('Script deploy failed: ' + t); }
    const deployJson = await deployRes.json();

    // Web app URL is not always returned; provide projectId + deploymentId to the caller
    return { spreadsheetId, projectId, deploymentId: deployJson.deploymentId, deployInfo: deployJson };
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

  window.MUNauth = { requestAccess, registerWithServer, appendViaServer, exportKeyFile, getUserEmail, getConfig, createInvite, redeemInvite, provisionUserApi };
})();
