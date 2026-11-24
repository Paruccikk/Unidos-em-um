const FIREBASE_API_KEY = PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY");
const FIREBASE_DB_URL = "https://unidos-em-um-default-rtdb.firebaseio.com";
const DRIVE_FOLDER_ID = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
const DRIVE_DOCUMENTS_FOLDER_ID = PropertiesService.getScriptProperties().getProperty("DRIVE_DOCUMENTS_FOLDER_ID");

function authorizeDriveAccess() {
  if (!DRIVE_FOLDER_ID) throw new Error("Configure DRIVE_FOLDER_ID nas propriedades do script.");
  const photos = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log("Pasta de fotos autorizada: " + photos.getName());
  if (DRIVE_DOCUMENTS_FOLDER_ID) {
    const documents = DriveApp.getFolderById(DRIVE_DOCUMENTS_FOLDER_ID);
    Logger.log("Pasta de documentos autorizada: " + documents.getName());
  } else {
    Logger.log("DRIVE_DOCUMENTS_FOLDER_ID ainda não configurado. Upload de documentos ficará indisponível.");
  }
  return "Acesso ao Google Drive autorizado.";
}

function doGet() {
  return ContentService.createTextOutput("Google Drive uploader online").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let requestId = "";
  try {
    const rawPayload = e && e.parameter && e.parameter.payload
      ? e.parameter.payload
      : (e && e.postData && e.postData.contents ? e.postData.contents : "{}");
    const payload = JSON.parse(rawPayload);
    requestId = String(payload.requestId || "");
    const isDocument = payload.documentUpload === true;
    const targetFolderId = isDocument ? DRIVE_DOCUMENTS_FOLDER_ID : DRIVE_FOLDER_ID;

    if (!FIREBASE_API_KEY) throw new Error("FIREBASE_API_KEY não configurada nas propriedades do Apps Script.");
    if (!targetFolderId) {
      throw new Error(isDocument
        ? "Pasta de documentos não configurada. Adicione DRIVE_DOCUMENTS_FOLDER_ID nas propriedades do Apps Script."
        : "Pasta de fotos não configurada. Adicione DRIVE_FOLDER_ID nas propriedades do Apps Script.");
    }
    if (!payload.idToken || !payload.base64 || !payload.mimeType) throw new Error("Dados do arquivo incompletos. Selecione o arquivo novamente.");

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(payload.mimeType)) throw new Error("Formato não permitido. Envie PDF, JPG, PNG ou WebP.");

    const bytes = Utilities.base64Decode(payload.base64);
    const maxBytes = isDocument ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!bytes.length) throw new Error("O arquivo está vazio.");
    if (bytes.length > maxBytes) throw new Error(isDocument ? "O documento deve ter no máximo 15 MB." : "A foto deve ter no máximo 5 MB.");

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

    if (isDocument) {
      if (!(profile.admins === true || profile.papel === "admin" || profile.papel === "editor")) {
        throw new Error("Somente Admin ou Editor pode publicar documentos.");
      }
    } else if (profile.status !== "aprovado" && profile.admins !== true && profile.papel !== "admin") {
      throw new Error("Somente membros aprovados podem enviar foto.");
    }

    const safeName = String(payload.fileName || (isDocument ? "documento" : "foto-perfil"))
      .replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const blob = Utilities.newBlob(bytes, payload.mimeType, uid + "_" + Date.now() + "_" + safeName);
    const file = DriveApp.getFolderById(targetFolderId).createFile(blob);
    const fileId = file.getId();
    const url = "https://drive.google.com/file/d/" + fileId + "/view";
    return htmlResponse({ ok: true, fileId: fileId, url: url, mimeType: payload.mimeType }, requestId);
  } catch (err) {
    return htmlResponse({ ok: false, error: err && err.message ? err.message : "Falha ao enviar o arquivo." }, requestId);
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
