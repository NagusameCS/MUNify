// Minimal MUNify auth + setup helper (uses Google OAuth2 token client for API access)
(function(){
  const CLIENT_ID = '73123638661-ai7rhojisdd2kq7oc64out0t9s57k2d7.apps.googleusercontent.com';
  const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
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

  async function requestAccess(){
    // Request both an ID token (for identity) and an access token (for APIs)
    return new Promise((resolve, reject)=>{
      if (!window.google || !window.google.accounts) return reject(new Error('Google Identity not loaded'));

      // ID token via One Tap / GSI - initialize to allow prompt
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r)=>{
        const cfg = load(); cfg.idToken = r.credential; save(cfg);
      }});
      // show prompt
      try { window.google.accounts.id.prompt(); } catch(e) { /* ignore */ }

      // Request OAuth access token
      const client = ensureTokenClient();
      if (!client) return reject(new Error('OAuth token client unavailable'));

      client.requestAccessToken({ prompt: 'consent' });

      // The initTokenClient callback isn't easily accessible here; poll storage for token set by a different flow
      // Instead we'll use the global callback pattern: override the client's callback
      tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        const cfg = load(); cfg.accessToken = resp.access_token; cfg.expiresAt = Date.now() + (resp.expires_in||0)*1000; save(cfg);
        resolve(resp);
      }});
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  function getAccessToken(){ const c=load(); if (c.accessToken && c.expiresAt && Date.now() < c.expiresAt-10000) return c.accessToken; return null; }

  async function ensureAccess(){
    const existing = getAccessToken();
    if (existing) return existing;
    await requestAccess();
    return getAccessToken();
  }

  function decodeJwt(token){ try { const p = token.split('.')[1]; return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/'))); } catch(e){return null;} }
  function getUserEmail(){ const t = decodeJwt(load().idToken); return t && (t.email || t.preferred_username) || null; }

  async function createSpreadsheet(title){
    const token = await ensureAccess();
    if (!token) throw new Error('No access token');

    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST', headers: { 'Authorization':'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.spreadsheet' })
    });
    if (!res.ok) { const txt = await res.text(); throw new Error('Drive API error: '+txt); }
    const data = await res.json();
    const sheetId = data.id;
    const config = load(); config.sheetId = sheetId; config.key = cryptoRandom(18); save(config);
    await initSheetStructure(sheetId);
    return sheetId;
  }

  function cryptoRandom(len){ const bytes=new Uint8Array(len); crypto.getRandomValues(bytes); return Array.from(bytes).map(b=>('0'+b.toString(16)).slice(-2)).join(''); }

  async function initSheetStructure(sheetId){
    const token = await ensureAccess(); if (!token) throw new Error('Not signed in');
    const formsHeaders = ['School Rules of Procedure (Link)','Committee abbreviation','Committee Full Name','Committee General Description','Committee Background Guide (Link)','Whitelist','Secret'];
    const delegatesHeaders = ['Delegate Name','Delegate Email','Delegate Year','Delegate ID','Delegate Selection 1','Delegate Selection 2','Delegate Selection 3','Delegate Selection 4','Delegate Selection 5'];

    // create sheets
    const body = { requests: [ { addSheet: { properties: { title: 'Forms' } } }, { addSheet: { properties: { title: 'Delegates' } } } ] };
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify(body) });

    await batchUpdateValues(sheetId, 'Forms!A1:G1', [formsHeaders]);
    await batchUpdateValues(sheetId, 'Delegates!A1:I1', [delegatesHeaders]);
  }

  async function batchUpdateValues(sheetId, range, values){
    const token = await ensureAccess(); const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
    const res = await fetch(url, { method:'PUT', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify({ range, values }) });
    if (!res.ok) { const t = await res.text(); throw new Error(t); } return res.json();
  }

  function exportKeyFile(){ const cfg=load(); if (!cfg.sheetId||!cfg.key) throw new Error('No key configured'); const payload={sheetId:cfg.sheetId,key:cfg.key,created:new Date().toISOString(),email:getUserEmail()}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`munify-key-${cfg.key}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

  function getConfig(){ return load(); }

  window.MUNauth = { requestAccess, createSpreadsheet, exportKeyFile, getUserEmail, getConfig, ensureAccess };
})();
