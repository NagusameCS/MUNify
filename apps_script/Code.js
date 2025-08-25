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
// stricter ID token verification
const CLIENT_ID = '73123638661-ai7rhojisdd2kq7oc64out0t9s57k2d7.apps.googleusercontent.com';
function verifyIdToken(idToken) {
  if (!idToken) throw new Error('missing_id_token');
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const resp = UrlFetchApp.fetch(url);
  if (resp.getResponseCode() !== 200) throw new Error('invalid_id_token');
  const data = JSON.parse(resp.getContentText());
  // required checks
  if (!data.email) throw new Error('no_email');
  if (!data.email_verified || data.email_verified.toString() !== 'true') throw new Error('email_not_verified');
  if (data.aud !== CLIENT_ID) throw new Error('invalid_aud');
  if (['accounts.google.com','https://accounts.google.com'].indexOf(data.iss) === -1) throw new Error('invalid_iss');
  if (parseInt(data.exp,10)*1000 < Date.now()) throw new Error('token_expired');
  return data.email;
}

function handleRegister(payload) {
  // Accept payload: { id_token, title? }
  const { id_token, title } = payload;
  if (!id_token) return jsonResponse({ error: 'missing_fields' }, 400);
  const email = verifyIdToken(id_token);

  // create spreadsheet server-side to avoid client-side tokens
  const sheetTitle = title || ('MUNify - ' + (email || 'form'));
  const ss = SpreadsheetApp.create(sheetTitle);

  // create Forms and Delegates and headers
  initSheetStructure(ss);

  // generate short key
  const key = Utilities.getUuid().slice(0,8).replace(/-/g,'');
  const secret = Utilities.getUuid();
  const obj = { sheetId: ss.getId(), owner: email, whitelist: [email], secret: secret, created: Date.now() };
  setMapping(key, obj);
  // log registration
  safeLog('register', key, email, 'ok', 'created');
  return jsonResponse({ ok: true, key: key, sheetId: ss.getId(), secret: secret });
}

function initSheetStructure(ss) {
  // ss may be a Spreadsheet object or id
  var spreadsheet = ss;
  if (typeof ss === 'string') spreadsheet = SpreadsheetApp.openById(ss);
  try {
    // remove default sheet if empty
    var defaultSheet = spreadsheet.getSheets()[0];
    if (defaultSheet.getMaxRows() <= 100 && defaultSheet.getName() === 'Sheet1') {
      spreadsheet.deleteSheet(defaultSheet);
    }
  } catch(e) { /* ignore */ }
  var forms = spreadsheet.getSheetByName('Forms') || spreadsheet.insertSheet('Forms');
  var delegates = spreadsheet.getSheetByName('Delegates') || spreadsheet.insertSheet('Delegates');
  var formsHeaders = ['School Rules of Procedure (Link)','Committee abbreviation','Committee Full Name','Committee General Description','Committee Background Guide (Link)','Whitelist','Secret'];
  var delegatesHeaders = ['Delegate Name','Delegate Email','Delegate Year','Delegate ID','Delegate Selection 1','Delegate Selection 2','Delegate Selection 3','Delegate Selection 4','Delegate Selection 5'];
  forms.getRange(1,1,1,formsHeaders.length).setValues([formsHeaders]);
  delegates.getRange(1,1,1,delegatesHeaders.length).setValues([delegatesHeaders]);
}

// basic logging helper: append rows to a hidden Log sheet
function safeLog(action, key, email, status, msg) {
  try {
    var meta = getProperties();
    var logId = meta.getProperty('munify_log_sheet_id');
    var ss;
    if (logId) {
      ss = SpreadsheetApp.openById(logId);
    } else {
      // create a new log spreadsheet for the script owner
      var nss = SpreadsheetApp.create('MUNify-Logs');
      meta.setProperty('munify_log_sheet_id', nss.getId());
      ss = nss;
    }
    var sheet = ss.getSheetByName('Log') || ss.insertSheet('Log');
    sheet.appendRow([new Date().toISOString(), action, key, email, status, msg]);
  } catch(e) { /* don't throw from logger */ }
}

function handleAppend(payload) {
  const { id_token, key, values } = payload;
  if (!id_token || !key || !values) return jsonResponse({ error: 'missing_fields' }, 400);
  const email = verifyIdToken(id_token);
  const mapping = getMapping(key);
  if (!mapping) return jsonResponse({ error: 'not_found' }, 404);
  // check whitelist
  if (mapping.whitelist && mapping.whitelist.indexOf(email) === -1) return jsonResponse({ error: 'not_whitelisted' }, 403);

  // simple rate limit: allow up to 5 appends per 60s per key+email
  try {
    const pr = getProperties();
    const counterKey = 'rate_' + key + '_' + email;
    const data = pr.getProperty(counterKey);
    let obj = data ? JSON.parse(data) : { count:0, windowStart: Date.now() };
    if (Date.now() - obj.windowStart > 60*1000) { obj.count = 0; obj.windowStart = Date.now(); }
    if (obj.count >= 5) { safeLog('append', key, email, 'rate_limited', 'too_many_requests'); return jsonResponse({ error: 'rate_limited' }, 429); }
    obj.count += 1;
    pr.setProperty(counterKey, JSON.stringify(obj));
  } catch(e) { /* non-fatal */ }

  // append row to Delegates sheet
  try {
    const ss = SpreadsheetApp.openById(mapping.sheetId);
    const sheet = ss.getSheetByName('Delegates') || ss.insertSheet('Delegates');
    sheet.appendRow(values);
    safeLog('append', key, email, 'ok', 'appended');
    return jsonResponse({ ok: true });
  } catch (err) {
    safeLog('append', key, email, 'error', err.message);
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
