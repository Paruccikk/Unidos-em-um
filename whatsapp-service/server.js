import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.FIREBASE_API_KEY;
const DB_URL = (process.env.FIREBASE_DATABASE_URL || "https://unidos-em-um-default-rtdb.firebaseio.com").replace(/\/$/, "");
const ADMIN_EMAIL = "danielparuccikk@gmail.com";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://unidos-em-um-site.onrender.com").split(",").map(v => v.trim()).filter(Boolean);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = process.env.WA_AUTH_DIR || path.join("/tmp", "unidos-em-um-wa-auth");

app.use(cors({ origin(origin, callback) { if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true); callback(new Error("Origem não autorizada.")); }, methods:["GET","POST","OPTIONS"], allowedHeaders:["Content-Type","Authorization"] }));
app.use(express.json({ limit:"8mb" }));

let sock = null;
let qrDataUrl = null;
let connected = false;
let connecting = false;
let lastError = "";
let phone = "";
let startPromise = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let intentionalDisconnect = false;

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

function scheduleReconnect(reason) {
  if (intentionalDisconnect || reconnectTimer) return;
  reconnectAttempts += 1;
  const delay = Math.min(3000 * (2 ** Math.min(reconnectAttempts - 1, 4)), 60000);
  connecting = true;
  lastError = reason || "Reconectando ao WhatsApp automaticamente...";
  console.warn("WhatsApp desconectado. Nova tentativa em "+Math.round(delay/1000)+"s. Tentativa "+reconnectAttempts);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (intentionalDisconnect || connected || sock) return;
    connecting = false;
    await startWhatsApp();
  }, delay);
}

async function startWhatsApp() {
  if (connected || connecting) return;
  if (startPromise) return startPromise;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  startPromise = (async () => {
    connecting = true; qrDataUrl = null; lastError = "";
    try {
      fs.mkdirSync(authDir,{recursive:true});
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      let version;
      try { version = (await fetchLatestBaileysVersion()).version; } catch (error) { console.warn("Não foi possível consultar a versão mais recente do WhatsApp Web:",error?.message); }
      const socket = makeWASocket({ auth:state, version, printQRInTerminal:false, browser:["Unidos em Um","Chrome","1.0.0"], markOnlineOnConnect:false, syncFullHistory:false });
      sock = socket;
      socket.ev.on("creds.update",saveCreds);
      socket.ev.on("connection.update",async update => {
        if (sock !== socket) return;
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          try { qrDataUrl = await QRCode.toDataURL(qr,{width:300,margin:2}); connecting = true; }
          catch (error) { lastError = "Não foi possível gerar o QR Code: "+error.message; }
        }
        if (connection === "open") {
          connected = true; connecting = false; qrDataUrl = null; lastError = ""; phone = socket.user?.id?.split(":")[0] || socket.user?.id || ""; reconnectAttempts = 0;
          console.log("WhatsApp conectado com sucesso:",phone);
        }
        if (connection === "close") {
          if (sock !== socket) return;
          connected = false; connecting = false; qrDataUrl = null; phone = "";
          const code = lastDisconnect?.error?.output?.statusCode;
          const detail = lastDisconnect?.error?.message || "sem detalhe";
          console.warn("Conexão WhatsApp encerrada. Código:",code,"Motivo:",detail);
          sock = null;
          if (intentionalDisconnect) {
            lastError = "WhatsApp desconectado.";
            return;
          }
          if (code === DisconnectReason.loggedOut) {
            lastError = "Sessão encerrada pelo WhatsApp. Gere um novo QR Code.";
            reconnectAttempts = 0;
            try { fs.rmSync(authDir,{recursive:true,force:true}); } catch (error) { console.error("Falha ao limpar sessão encerrada:",error); }
          } else {
            const reason = code === 515
              ? "WhatsApp solicitou reiniciar a conexão. Tentando novamente automaticamente..."
              : "Conexão interrompida. Tentando reconectar automaticamente...";
            scheduleReconnect(reason);
          }
        }
      });
      socket.ev.on("messages.upsert",()=>{});
    } catch (error) {
      console.error("Erro ao iniciar WhatsApp:",error);
      lastError = error?.message || "Falha ao iniciar conexão.";
      connecting = false; connected = false; sock = null;
      scheduleReconnect("Falha ao iniciar. Tentando novamente automaticamente...");
    } finally { startPromise = null; }
  })();
  return startPromise;
}


function normalizeBrazilPhone(value) { let digits=String(value||"").replace(/\D/g,""); if(!digits)return null; if(digits.startsWith("00"))digits=digits.slice(2); if((digits.length===12||digits.length===13)&&digits.startsWith("55"))digits=digits.slice(2); if((digits.length===11||digits.length===12)&&digits.startsWith("0"))digits=digits.slice(1); return digits.length===10||digits.length===11?"55"+digits:null; }

app.post("/api/whatsapp/daily/send",requireOwner,async(req,res)=>{
  try {
    if (!connected || !sock) return res.status(409).json({error:"WhatsApp não está conectado. Conecte antes de disparar as mensagens."});
    const date = String(req.body?.date || "");
    const messages = req.body?.messages;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(messages) || messages.length < 1 || messages.length > 1000) {
      return res.status(400).json({error:"Lista de mensagens inválida ou vazia."});
    }
    const normalizedMessages = messages.map(item => ({...item, phone:normalizeBrazilPhone(item?.phone)}));
    for (const item of normalizedMessages) {
      if (!item.phone || typeof item?.text !== "string" || !item.text.trim() || item.text.length > 4000) {
        return res.status(400).json({error:"Foi encontrado um telefone ou conteúdo inválido. Nenhuma mensagem foi enviada."});
      }
    }
    let sent = 0;
    const failures = [];
    for (const item of normalizedMessages) {
      try {
        await sock.sendMessage(item.phone+"@s.whatsapp.net",{text:item.text});
        sent += 1;
        await new Promise(resolve=>setTimeout(resolve,900));
      } catch (error) {
        failures.push({phone:String(item.phone||"").slice(-4),error:error?.message||"Falha no envio"});
      }
    }
    res.json({ok:true,date,sent,failed:failures.length,failures:failures.slice(0,20)});
  } catch (error) {
    console.error("Falha no disparo diário:",error);
    res.status(500).json({error:"Ocorreu uma falha durante o disparo diário."});
  }
});

app.get("/health",(req,res)=>res.json({ok:true,service:"unidos-em-um-whatsapp"}));
app.get("/api/whatsapp/status",requireOwner,(req,res)=>res.json(status()));
app.post("/api/whatsapp/connect",requireOwner,async(req,res)=>{ await startWhatsApp(); res.json(status()); });
app.post("/api/whatsapp/disconnect",requireOwner,async(req,res)=>{
  intentionalDisconnect = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { if(sock) await sock.logout(); } catch (error) { console.warn("Erro ao encerrar sessão WhatsApp:",error?.message); }
  sock = null; connected = false; connecting = false; qrDataUrl = null; phone = ""; lastError = "WhatsApp desconectado.";
  try { fs.rmSync(authDir,{recursive:true,force:true}); } catch (error) { console.error("Falha ao remover sessão:",error); }
  intentionalDisconnect = false;
  reconnectAttempts = 0;
  res.json(status());
});

app.listen(PORT,"0.0.0.0",()=>console.log("Unidos em Um WhatsApp service listening on "+PORT));
