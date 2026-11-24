function authorizeDriveAccess() {
  if (!DRIVE_FOLDER_ID) throw new Error("DRIVE_FOLDER_ID não configurado nas propriedades do script.");
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log("Acesso autorizado à pasta: " + folder.getName());
  return folder.getName();
}

function doGet() {
  return ContentService.createTextOutput("Google Drive uploader online").setMimeType(ContentService.MimeType.TEXT);
}

const FIREBASE_API_KEY = PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY");
const FIREBASE_DB_URL = "https://unidos-em-um-default-rtdb.firebaseio.com";
const DRIVE_FOLDER_ID = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");

function doPost(e) {
  let requestId = "";
  try {
    const rawPayload = e && e.parameter && e.parameter.payload
      ? e.parameter.payload
      : (e && e.postData && e.postData.contents ? e.postData.contents : "{}");
    const payload = JSON.parse(rawPayload);
    requestId = String(payload.requestId || "");

    if (!FIREBASE_API_KEY || !DRIVE_FOLDER_ID) throw new Error("Configuração do servidor incompleta. Confira FIREBASE_API_KEY e DRIVE_FOLDER_ID nas propriedades do script.");
    if (!payload.idToken || !payload.base64 || !payload.mimeType) throw new Error("Dados de envio incompletos.");
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];\n    if (!allowedTypes.includes(payload.mimeType)) throw new Error("Formato não permitido. Envie PDF, JPG, PNG ou WebP.");

    const bytes = Utilities.base64Decode(payload.base64);
    const maxBytes = payload.documentUpload ? 15 * 1024 * 1024 : 5 * 1024 * 1024;\n    if (bytes.length > maxBytes) throw new Error(payload.documentUpload ? "O documento deve ter no máximo 15 MB." : "A imagem deve ter no máximo 5 MB.");

    const verify = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FIREBASE_API_KEY), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ idToken: payload.idToken }),
      muteHttpExceptions: true
    });
    const identity = JSON.parse(verify.getContentText() || "{}");
    if (verify.getResponseCode() !== 200 || !identity.users || !identity.users.length) {
      throw new Error("Sessão Firebase inválida. Saia da conta e entre novamente.");
    }

    const uid = identity.users[0].localId;
    const profileResponse = UrlFetchApp.fetch(FIREBASE_DB_URL + "/members/" + encodeURIComponent(uid) + ".json?auth=" + encodeURIComponent(payload.idToken), {
      muteHttpExceptions: true
    });
    const profile = JSON.parse(profileResponse.getContentText() || "null");
    if (profileResponse.getResponseCode() !== 200 || !profile) {
      throw new Error("Não foi possível validar o cadastro no Firebase. Confira as regras do banco de dados.");
    }
    if (profile.status !== "aprovado" && profile.admins !== true) {
      throw new Error("Somente membros aprovados podem enviar foto.");
    }

    const safeName = String(payload.fileName || (payload.documentUpload ? "documento" : "foto-perfil")).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const blob = Utilities.newBlob(bytes, payload.mimeType, uid + "_" + Date.now() + "_" + safeName);
    const file = DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();
    return htmlResponse({ ok: true, fileId: fileId, url: "https://drive.google.com/uc?export=view&id=" + fileId }, requestId);
  } catch (err) {
    return htmlResponse({ ok: false, error: err && err.message ? err.message : "Falha ao enviar a foto." }, requestId);
  }
}

function htmlResponse(value, requestId) {
  const message = JSON.stringify({
    type: "unidos-drive-upload",
    requestId: String(requestId || ""),
    result: value
  }).replace(/</g, "\\u003c");
  const html = "<!doctype html><html><head><meta charset='utf-8'></head><body>" +
    "<script>window.top.postMessage(" + message + ", '*');</script>" +
    "</body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
