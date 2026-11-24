import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.FIREBASE_API_KEY;
const DB_URL = (process.env.FIREBASE_DATABASE_URL || "https://unidos-em-um-default-rtdb.firebaseio.com").replace(/\/$/, "");
const ADMIN_EMAIL = "danielparuccikk@gmail.com";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://unidos-em-um-site.onrender.com").split(",").map(v => v.trim()).filter(Boolean);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = process.env.WA_AUTH_DIR || path.join("/tmp", "unidos-em-um-wa-auth");

app.use(cors({ origin(origin, callback) { if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true); callback(new Error("Origem não autorizada.")); }, methods:["GET","POST","OPTIONS"], allowedHeaders:["Content-Type","Authorization"] }));
app.use(express.json({ limit:"1mb" }));

let sock = null;
let qrDataUrl = null;
let connected = false;
let connecting = false;
let lastError = "";
let phone = "";
let startPromise = null;

async function requireOwner(req,res,next) {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i,"");
    if (!token) return res.status(401).json({error:"Faça login para continuar."});
    if (!API_KEY) return res.status(500).json({error:"FIREBASE_API_KEY não configurada no serviço."});
    const identityResponse = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+encodeURIComponent(API_KEY), {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({idToken:token})
    });
    const identity = await identityResponse.json();
    const account = identity.users?.[0];
    if (!identityResponse.ok || !account) return res.status(401).json({error:"Sessão Firebase inválida. Entre novamente."});
    if (String(account.email || "").toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({error:"Esta área é exclusiva da conta autorizada."});
    const profileResponse = await fetch(DB_URL+"/members/"+encodeURIComponent(account.localId)+".json?auth="+encodeURIComponent(token));
    const profile = await profileResponse.json();
    if (!profile || !(profile.admins === true || profile.papel === "admin")) return res.status(403).json({error:"A conta não possui permissão de administrador."});
    req.owner = account;
    next();
  } catch (error) {
    console.error("Falha ao validar acesso:",error);
    res.status(500).json({error:"Não foi possível validar sua sessão."});
  }
}

function status() {
  return { connected, connecting, qr:qrDataUrl, phone, error:lastError, owner:ADMIN_EMAIL };
}

async function startWhatsApp() {
  if (connected || connecting) return;
  if (startPromise) return startPromise;
  startPromise = (async () => {
    connecting = true; qrDataUrl = null; lastError = "";
    try {
      fs.mkdirSync(authDir,{recursive:true});
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      let version;
      try { version = (await fetchLatestBaileysVersion()).version; } catch {}
      sock = makeWASocket({ auth:state, version, printQRInTerminal:false, browser:["Unidos em Um","Chrome","1.0.0"], markOnlineOnConnect:false, syncFullHistory:false });
      sock.ev.on("creds.update",saveCreds);
      sock.ev.on("connection.update",async update => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { qrDataUrl = await QRCode.toDataURL(qr,{width:300,margin:2}); connecting = true; }
        if (connection === "open") { connected = true; connecting = false; qrDataUrl = null; lastError = ""; phone = sock.user?.id?.split(":")[0] || sock.user?.id || ""; }
        if (connection === "close") {
          connected = false; connecting = false; qrDataUrl = null;
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) { lastError = "Sessão encerrada pelo WhatsApp. Clique em Conectar para gerar outro QR Code."; sock = null; try { fs.rmSync(authDir,{recursive:true,force:true}); } catch {} }
          else { lastError = "Conexão interrompida. Clique em Conectar para tentar novamente."; sock = null; }
        }
      });
      sock.ev.on("messages.upsert",()=>{});
    } catch (error) {
      console.error("Erro ao iniciar WhatsApp:",error);
      lastError = error?.message || "Falha ao iniciar conexão.";
      connecting = false; connected = false; sock = null;
    } finally { startPromise = null; }
  })();
  return startPromise;
}

app.get("/health",(req,res)=>res.json({ok:true,service:"unidos-em-um-whatsapp"}));
app.get("/api/whatsapp/status",requireOwner,(req,res)=>res.json(status()));
app.post("/api/whatsapp/connect",requireOwner,async(req,res)=>{ await startWhatsApp(); res.json(status()); });
app.post("/api/whatsapp/disconnect",requireOwner,async(req,res)=>{
  try { if(sock) await sock.logout(); } catch {}
  sock = null; connected = false; connecting = false; qrDataUrl = null; phone = ""; lastError = "WhatsApp desconectado.";
  try { fs.rmSync(authDir,{recursive:true,force:true}); } catch {}
  res.json(status());
});

app.listen(PORT,"0.0.0.0",()=>console.log("Unidos em Um WhatsApp service listening on "+PORT));
