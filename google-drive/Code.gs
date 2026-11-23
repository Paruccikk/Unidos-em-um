const FIREBASE_API_KEY = PropertiesService.getScriptProperties().getProperty("FIREBASE_API_KEY");
const FIREBASE_DB_URL = "https://unidos-em-um-default-rtdb.firebaseio.com";
const DRIVE_FOLDER_ID = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
function doPost(e) {
  try {
    if (!FIREBASE_API_KEY || !DRIVE_FOLDER_ID) throw new Error("Configuração do servidor incompleta.");
    const payload = JSON.parse(e.postData.contents || "{}");
    if (!payload.idToken || !payload.base64 || !payload.mimeType) throw new Error("Dados de envio incompletos.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(payload.mimeType)) throw new Error("Formato de imagem não permitido.");
    const bytes = Utilities.base64Decode(payload.base64);
    if (bytes.length > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
    const verify = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FIREBASE_API_KEY), {
      method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: payload.idToken }), muteHttpExceptions: true
    });
    const identity = JSON.parse(verify.getContentText());
    if (verify.getResponseCode() !== 200 || !identity.users || !identity.users.length) throw new Error("Sessão inválida. Entre novamente.");
    const uid = identity.users[0].localId;
    const profileResponse = UrlFetchApp.fetch(FIREBASE_DB_URL + "/members/" + encodeURIComponent(uid) + ".json?auth=" + encodeURIComponent(payload.idToken), { muteHttpExceptions: true });
    const profile = JSON.parse(profileResponse.getContentText() || "null");
    if (profileResponse.getResponseCode() !== 200 || !profile || (profile.status !== "aprovado" && profile.admins !== true)) throw new Error("Somente membros aprovados podem enviar foto.");
    const safeName = String(payload.fileName || "foto-perfil").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const blob = Utilities.newBlob(bytes, payload.mimeType, uid + "_" + Date.now() + "_" + safeName);
    const file = DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();
    return json({ ok: true, fileId: fileId, url: "https://drive.google.com/uc?export=view&id=" + fileId });
  } catch (err) { return json({ ok: false, error: err.message || "Falha ao enviar a foto." }); }
}
function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
