/**
 * IGREJA PENTECOSTAL UNIDOS EM UM
 * Google Drive - Upload de fotos e documentos
 */

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const FIREBASE_API_KEY = PropertiesService
  .getScriptProperties()
  .getProperty("FIREBASE_API_KEY");

const FIREBASE_DB_URL =
  "https://unidos-em-um-default-rtdb.firebaseio.com";

// Pasta privada das fotos de perfil
const DRIVE_FOLDER_ID = PropertiesService
  .getScriptProperties()
  .getProperty("DRIVE_FOLDER_ID");

// Pasta separada dos documentos disponibilizados aos membros.
// O ID informado já fica como padrão; a propriedade do Script pode sobrescrevê-lo.
const DRIVE_DOCUMENTS_FOLDER_ID =
  PropertiesService.getScriptProperties().getProperty("DRIVE_DOCUMENTS_FOLDER_ID") ||
  "1cJl0T85pWo26wAJ_3ajwb4DU8lzAwxHO";

// ======================================================
// TESTE DE CONEXÃO
// ======================================================

function doGet() {
  return ContentService
    .createTextOutput("Google Drive uploader online")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ======================================================
// TESTAR ACESSO ÀS PASTAS
// ======================================================

function testarDrive() {
  if (!DRIVE_FOLDER_ID) {
    throw new Error("DRIVE_FOLDER_ID não configurado.");
  }

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log("Pasta de fotos: " + folder.getName());

  if (!DRIVE_DOCUMENTS_FOLDER_ID) {
    throw new Error("Configure DRIVE_DOCUMENTS_FOLDER_ID nas propriedades do script.");
  }

  const documentsFolder = DriveApp.getFolderById(DRIVE_DOCUMENTS_FOLDER_ID);
  Logger.log("Pasta de documentos: " + documentsFolder.getName());

  return "As duas pastas estão acessíveis.";
}

// ======================================================
// AUTORIZAR ACESSO AO DRIVE
// ======================================================

function authorizeDriveAccess() {
  const result = [];

  if (DRIVE_FOLDER_ID) {
    const photos = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    result.push("Fotos: " + photos.getName());
  }

  if (DRIVE_DOCUMENTS_FOLDER_ID) {
    const documents = DriveApp.getFolderById(DRIVE_DOCUMENTS_FOLDER_ID);
    result.push("Documentos: " + documents.getName());
  }

  if (!result.length) {
    throw new Error("Nenhuma pasta foi configurada.");
  }

  Logger.log(result.join("\n"));
  return result.join("\n");
}

// ======================================================
// RECEBER E PROCESSAR UPLOAD
// ======================================================

function doPost(e) {
  let requestId = "";

  try {
    const rawPayload =
      e && e.parameter && e.parameter.payload
        ? e.parameter.payload
        : (e && e.postData && e.postData.contents ? e.postData.contents : "{}");

    const payload = JSON.parse(rawPayload);
    requestId = String(payload.requestId || "");
    const isDocument = payload.documentUpload === true || payload.mimeType === "application/pdf" || /\\.pdf$/i.test(String(payload.fileName || ""));

    // --------------------------------------------------
    // VALIDAR CONFIGURAÇÕES
    // --------------------------------------------------

    if (!FIREBASE_API_KEY) {
      throw new Error("FIREBASE_API_KEY não configurada.");
    }

    const targetFolderId = isDocument
      ? DRIVE_DOCUMENTS_FOLDER_ID
      : DRIVE_FOLDER_ID;

    if (!targetFolderId) {
      throw new Error(
        isDocument
          ? "Configure DRIVE_DOCUMENTS_FOLDER_ID."
          : "Configure DRIVE_FOLDER_ID."
      );
    }

    // --------------------------------------------------
    // VALIDAR DADOS E FORMATO
    // --------------------------------------------------

    if (!payload.idToken || !payload.base64 || !payload.mimeType) {
      throw new Error("Dados de envio incompletos.");
    }

    const allowedTypes = isDocument
      ? ["application/pdf", "image/jpeg", "image/png", "image/webp"]
      : ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(payload.mimeType)) {
      throw new Error(
        isDocument
          ? "Formato não permitido. Envie PDF, JPG, PNG ou WebP."
          : "Formato de imagem não permitido."
      );
    }

    // --------------------------------------------------
    // VALIDAR TAMANHO
    // --------------------------------------------------

    const bytes = Utilities.base64Decode(payload.base64);
    const maxBytes = isDocument ? 15 * 1024 * 1024 : 5 * 1024 * 1024;

    if (!bytes.length) {
      throw new Error("O arquivo está vazio.");
    }

    if (bytes.length > maxBytes) {
      throw new Error(
        isDocument
          ? "O documento deve ter no máximo 15 MB."
          : "A imagem deve ter no máximo 5 MB."
      );
    }

    // --------------------------------------------------
    // VALIDAR TOKEN FIREBASE
    // --------------------------------------------------

    const verify = UrlFetchApp.fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
        encodeURIComponent(FIREBASE_API_KEY),
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ idToken: payload.idToken }),
        muteHttpExceptions: true
      }
    );

    const identity = JSON.parse(verify.getContentText() || "{}");

    if (
      verify.getResponseCode() !== 200 ||
      !identity.users ||
      !identity.users.length
    ) {
      throw new Error("Sessão Firebase inválida. Saia da conta e entre novamente.");
    }

    const uid = identity.users[0].localId;

    // --------------------------------------------------
    // VALIDAR PERFIL NO FIREBASE
    // --------------------------------------------------

    const profileResponse = UrlFetchApp.fetch(
      FIREBASE_DB_URL +
        "/members/" +
        encodeURIComponent(uid) +
        ".json?auth=" +
        encodeURIComponent(payload.idToken),
      { muteHttpExceptions: true }
    );

    const profile = JSON.parse(profileResponse.getContentText() || "null");

    if (profileResponse.getResponseCode() !== 200 || !profile) {
      throw new Error("Não foi possível validar o cadastro no Firebase.");
    }

    // --------------------------------------------------
    // VALIDAR PERMISSÕES
    // --------------------------------------------------

    if (isDocument) {
      const canPublish =
        profile.admins === true ||
        profile.papel === "admin" ||
        profile.papel === "editor";

      if (!canPublish) {
        throw new Error("Somente administradores e editores podem publicar documentos.");
      }
    } else {
      const canUploadPhoto =
        profile.status === "aprovado" ||
        profile.admins === true ||
        profile.papel === "admin";

      if (!canUploadPhoto) {
        throw new Error("Somente membros aprovados podem enviar foto.");
      }
    }

    // --------------------------------------------------
    // CRIAR ARQUIVO NO GOOGLE DRIVE
    // --------------------------------------------------

    const folder = DriveApp.getFolderById(targetFolderId);

    const safeName = String(
      payload.fileName || (isDocument ? "documento" : "foto-perfil")
    )
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);

    const blob = Utilities.newBlob(
      bytes,
      payload.mimeType,
      uid + "_" + Date.now() + "_" + safeName
    );

    const file = folder.createFile(blob);
    const fileId = file.getId();

    Logger.log("Arquivo criado: " + fileId);

    // --------------------------------------------------
    // URL DO ARQUIVO
    // --------------------------------------------------

    const fileUrl =
      "https://drive.google.com/file/d/" +
      encodeURIComponent(fileId) +
      "/view";

    // --------------------------------------------------
    // RETORNAR RESULTADO
    // --------------------------------------------------

    return htmlResponse(
      {
        ok: true,
        fileId: fileId,
        url: fileUrl,
        mimeType: payload.mimeType
      },
      requestId
    );

  } catch (error) {
    Logger.log("ERRO NO UPLOAD: " + error.message);
    Logger.log("DETALHES: " + (error.stack || "Sem detalhes"));

    return htmlResponse(
      {
        ok: false,
        error: error && error.message
          ? error.message
          : "Falha ao enviar o arquivo."
      },
      requestId
    );
  }
}

// ======================================================
// RESPOSTA PARA O SITE
// ======================================================

function htmlResponse(value, requestId) {
  const message = JSON.stringify({
    type: "unidos-drive-upload",
    requestId: String(requestId || ""),
    result: value
  }).replace(/</g, "\\u003c");

  const html =
    "<!doctype html>" +
    "<html>" +
    "<head><meta charset='utf-8'></head>" +
    "<body>" +
    "<script>" +
    "window.top.postMessage(" + message + ", '*');" +
    "</script>" +
    "</body>" +
    "</html>";

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
