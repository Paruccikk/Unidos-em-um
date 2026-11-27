import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

// Execute uma única vez no servidor com GOOGLE_APPLICATION_CREDENTIALS
// apontando para a chave privada do Firebase Admin SDK.
const email = String(process.argv[2] || "").trim().toLowerCase();
const databaseURL = (process.env.FIREBASE_DATABASE_URL || "https://unidos-em-um-default-rtdb.firebaseio.com").replace(/\/$/, "");
if (!email) {
  console.error("Uso: node set-master-admin.js email@dominio.com");
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error("Configure GOOGLE_APPLICATION_CREDENTIALS ou FIREBASE_SERVICE_ACCOUNT_JSON antes de executar.");
  process.exit(1);
}
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
} else {
  credential = applicationDefault();
}
const appName = "unidos-em-um-promote-master";
const app = getApps().find(item => item.name === appName) ||
  initializeApp({ credential, databaseURL }, appName);
const auth = getAuth(app);
const db = getDatabase(app);

try {
  const account = await auth.getUserByEmail(email);
  const memberRef = db.ref("members/" + account.uid);
  const snapshot = await memberRef.get();
  if (!snapshot.exists()) {
    throw new Error("A conta existe no Authentication, mas não há cadastro correspondente em members/" + account.uid);
  }

  // Marca no próprio perfil e mantém o registro de autorização dedicado.
  await db.ref().update({
    ["members/" + account.uid + "/admMaster"]: true,
    ["members/" + account.uid + "/papel"]: "admin",
    ["members/" + account.uid + "/admins"]: true,
    ["members/" + account.uid + "/status"]: "aprovado",
    ["members/" + account.uid + "/nivelAcesso"]: "Admin Master",
    ["masterAdmins/" + account.uid]: true
  });

  console.log("Admin Master concedido com sucesso.");
  console.log("E-mail:", account.email);
  console.log("UID:", account.uid);
  console.log("Perfil: members/" + account.uid);
  console.log("Marcadores: admMaster=true e masterAdmins/" + account.uid + "=true");
} catch (error) {
  console.error("Não foi possível conceder Admin Master:", error.message);
  process.exitCode = 1;
}
