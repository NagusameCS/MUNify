// MUNify Apps Script Web App
// Endpoints (doGet / doPost) accept 'action' parameter.
// - action=get&key=KEY -> returns mapping (no secret)
// - action=append -> POST { key, id_token, values: [...] } -> appends to Delegates sheet if whitelisted
// - action=register -> POST { key, sheetId, id_token } -> register mapping (owner added to whitelist)
// - action=invite -> POST { key, id_token } -> create 24h invite token
// - action=redeem -> POST { token, id_token } -> redeem invite (adds email to whitelist)

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'get' && e.parameter.key) {
      const mapping = getMapping(e.parameter.key);
      if (!mapping) return jsonResponse({ error: 'not_found' }, 404);
      // don't leak secret
      const out = Object.assign({}, mapping);
      delete out.secret;
      return jsonResponse({ ok: true, mapping: out });
    }
    return jsonResponse({ ok: true, msg: 'MUNify Apps Script' });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function doPost(e) {
  const action = e.parameter && e.parameter.action ? e.parameter.action : (e.postData && e.postData.type ? JSON.parse(e.postData.contents).action : null);
  try {
    const payload = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    if (action === 'register') return handleRegister(payload);
    if (action === 'append') return handleAppend(payload);
    if (action === 'invite') return handleInvite(payload);
    if (action === 'redeem') return handleRedeem(payload);
    return jsonResponse({ error: 'unknown_action' }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// Helpers
function getProperties() { return PropertiesService.getScriptProperties(); }
function getMappingsObj() {
  const p = getProperties().getProperty('munify_mappings');
  return p ? JSON.parse(p) : {};
}
function saveMappingsObj(obj) { getProperties().setProperty('munify_mappings', JSON.stringify(obj)); }

function getMapping(key) {
  const m = getMappingsObj();
  return m[key] || null;
}

function setMapping(key, obj) {
  const m = getMappingsObj();
  m[key] = obj; saveMappingsObj(m);
}

function removeInvite(token) { const pr = getProperties(); pr.deleteProperty('munify_invite_' + token); }
function saveInvite(token, obj) { getProperties().setProperty('munify_invite_' + token, JSON.stringify(obj)); }
function getInvite(token) { const v = getProperties().getProperty('munify_invite_' + token); return v ? JSON.parse(v) : null; }

function jsonResponse(obj, code) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  if (code) {
    // Apps Script can't set HTTP status codes directly for simple web apps; include code in payload
    obj._status = code;
    out.setContent(JSON.stringify(obj));
  }
  return out;
}

// verify id_token via Google tokeninfo endpoint to get email
function verifyIdToken(idToken) {
  if (!idToken) throw new Error('missing_id_token');
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const resp = UrlFetchApp.fetch(url);
  if (resp.getResponseCode() !== 200) throw new Error('invalid_id_token');
  const data = JSON.parse(resp.getContentText());
  return data.email;
}

function handleRegister(payload) {
  const { id_token, sheetId, key } = payload;
  if (!id_token || !sheetId || !key) return jsonResponse({ error: 'missing_fields' }, 400);
  const email = verifyIdToken(id_token);
  const mapping = getMapping(key);
  if (mapping) return jsonResponse({ error: 'key_exists' }, 409);
  const secret = Utilities.getUuid();
  const obj = { sheetId: sheetId, owner: email, whitelist: [email], secret: secret, created: Date.now() };
  setMapping(key, obj);
  return jsonResponse({ ok: true, key: key, sheetId: sheetId, secret: secret });
}

function handleAppend(payload) {
  const { id_token, key, values } = payload;
  if (!id_token || !key || !values) return jsonResponse({ error: 'missing_fields' }, 400);
  const email = verifyIdToken(id_token);
  const mapping = getMapping(key);
  if (!mapping) return jsonResponse({ error: 'not_found' }, 404);
  // check whitelist
  if (mapping.whitelist && mapping.whitelist.indexOf(email) === -1) return jsonResponse({ error: 'not_whitelisted' }, 403);
  // append row to Delegates sheet
  try {
    const ss = SpreadsheetApp.openById(mapping.sheetId);
    const sheet = ss.getSheetByName('Delegates') || ss.insertSheet('Delegates');
    sheet.appendRow(values);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: 'sheet_error', detail: err.message }, 500);
  }
}

function handleInvite(payload) {
  const { id_token, key } = payload;
  if (!id_token || !key) return jsonResponse({ error: 'missing_fields' }, 400);
  const email = verifyIdToken(id_token);
  const mapping = getMapping(key);
  if (!mapping) return jsonResponse({ error: 'not_found' }, 404);
  // only owner may create invites (simple policy)
  if (mapping.owner !== email) return jsonResponse({ error: 'not_allowed' }, 403);
  const token = Utilities.getUuid().replace(/-/g,'');
  const expire = Date.now() + 24*60*60*1000; // 24h
  saveInvite(token, { key: key, sheetId: mapping.sheetId, expires: expire, issuer: email });
  return jsonResponse({ ok: true, inviteToken: token, expires: expire });
}

function handleRedeem(payload) {
  const { id_token, token } = payload;
  if (!id_token || !token) return jsonResponse({ error: 'missing_fields' }, 400);
  const email = verifyIdToken(id_token);
  const invite = getInvite(token);
  if (!invite) return jsonResponse({ error: 'invite_not_found' }, 404);
  if (Date.now() > invite.expires) { removeInvite(token); return jsonResponse({ error: 'invite_expired' }, 410); }
  // add email to mapping's whitelist
  const mapping = getMapping(invite.key);
  if (!mapping) return jsonResponse({ error: 'mapping_not_found' }, 404);
  mapping.whitelist = mapping.whitelist || [];
  if (mapping.whitelist.indexOf(email) === -1) mapping.whitelist.push(email);
  setMapping(invite.key, mapping);
  removeInvite(token);
  return jsonResponse({ ok: true, added: email });
}
