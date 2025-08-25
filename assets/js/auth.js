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

  window.MUNauth = { requestAccess, registerWithServer, appendViaServer, exportKeyFile, getUserEmail, getConfig };
})();
