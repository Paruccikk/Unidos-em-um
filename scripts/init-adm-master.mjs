import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), "../whatsapp-service/package.json"));
const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const databaseURL = (process.env.FIREBASE_DATABASE_URL || "https://unidos-em-um-default-rtdb.firebaseio.com").replace(/\\/$/, "");
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error("Configure GOOGLE_APPLICATION_CREDENTIALS ou FIREBASE_SERVICE_ACCOUNT_JSON.");
  process.exit(1);
}

const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  : applicationDefault();
const appName = "unidos-em-um-init-adm-master";
const app = getApps().find(item => item.name === appName) || initializeApp({ credential, databaseURL }, appName);
const db = getDatabase(app);

try {
  const membersRef = db.ref("members");
  const snapshot = await membersRef.get();
  if (!snapshot.exists()) {
    console.log("Nenhum cadastro encontrado em members.");
    process.exit(0);
  }

  const updates = {};
  let count = 0;
  snapshot.forEach(child => {
    updates[child.key + "/admMaster"] = false;
    count++;
  });

  await membersRef.update(updates);
  console.log("Concluído: admMaster=false gravado em " + count + " cadastros.");
  console.log("Agora altere manualmente para true somente no seu perfil em members/SEU_UID/admMaster.");
} catch (error) {
  console.error("Falha ao inicializar os campos admMaster:", error.message);
  process.exitCode = 1;
}
