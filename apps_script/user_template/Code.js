// Template Apps Script that will be deployed into each user's project.
// It exposes a minimal web app that accepts `?action=append` with id_token and key and appends rows to the linked spreadsheetId.

function doPost(e) {
  try {
    const payload = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = payload.action || e.parameter && e.parameter.action;
    if (action === 'append') return handleAppend(payload);
    if (action === 'get') return handleGet(payload);
    return ContentService.createTextOutput(JSON.stringify({ error: 'unknown_action' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleAppend(payload) {
  // payload: { id_token, spreadsheetId, values }
  if (!payload || !payload.id_token || !payload.spreadsheetId || !payload.values) return ContentService.createTextOutput(JSON.stringify({ error: 'missing' })).setMimeType(ContentService.MimeType.JSON);
  // Very small verification: the client should verify id_token server-side but for now accept requests from the owner
  try {
    const ss = SpreadsheetApp.openById(payload.spreadsheetId);
    const sheet = ss.getSheetByName('Delegates') || ss.insertSheet('Delegates');
    sheet.appendRow(payload.values);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleGet(payload) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
