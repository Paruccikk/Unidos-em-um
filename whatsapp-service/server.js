import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getDatabase as getAdminDatabase } from "firebase-admin/database";

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.FIREBASE_API_KEY;
const DB_URL = (process.env.FIREBASE_DATABASE_URL || "https://unidos-em-um-default-rtdb.firebaseio.com").replace(/\/$/, "");
const ADMIN_EMAIL = "danielparuccikk@gmail.com";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://unidos-em-um-site.onrender.com").split(",").map(v => v.trim()).filter(Boolean);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = process.env.WA_AUTH_DIR || path.join("/tmp", "unidos-em-um-wa-auth");

app.use(cors({ origin(origin, callback) { if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true); callback(new Error("Origem não autorizada.")); }, methods:["GET","POST","DELETE","OPTIONS"], allowedHeaders:["Content-Type","Authorization"] }));
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

async function requireMemberManager(req,res,next) {
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
    const profileResponse = await fetch(DB_URL+"/members/"+encodeURIComponent(account.localId)+".json?auth="+encodeURIComponent(token));
    const profile = await profileResponse.json();
    const master = String(account.email || "").toLowerCase() === ADMIN_EMAIL;
    const manager = profile?.status === "aprovado" && (profile?.papel === "admin" || profile?.papel === "editor") && !!profile?.unidadeId;
    if (!master && !manager) return res.status(403).json({error:"Sua conta não possui permissão para gerenciar membros."});
    req.owner = account;
    req.managerProfile = profile;
    req.isMaster = master;
    next();
  } catch (error) {
    console.error("Falha ao validar acesso de gestão de membros:",error);
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



function getFirebaseAdminServices() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw && !credentialPath) return null;
  let credential;
  if (raw) {
    let serviceAccount;
    try { serviceAccount = JSON.parse(raw); }
    catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON não contém JSON válido."); }
    credential = cert(serviceAccount);
  } else {
    credential = applicationDefault();
  }
  const appName = "unidos-em-um-admin";
  const existing = getApps().find(item => item.name === appName);
  const firebaseApp = existing || initializeApp({ credential, databaseURL: DB_URL }, appName);
  return { auth: getAdminAuth(firebaseApp), db: getAdminDatabase(firebaseApp) };
}

function normalizeBrazilPhone(value) { let digits=String(value||"").replace(/\D/g,""); if(!digits)return null; if(digits.startsWith("00"))digits=digits.slice(2); if((digits.length===12||digits.length===13)&&digits.startsWith("55"))digits=digits.slice(2); if((digits.length===11||digits.length===12)&&digits.startsWith("0"))digits=digits.slice(1); return digits.length===10||digits.length===11?"55"+digits:null; }


const DAILY_UNITS = { sede:"Sede", filial2:"Filial 1", filial3:"Filial 2" };
const DAILY_VERSES = [
  {ref:"Salmos 23:1",text:"O Senhor é nosso pastor e cuida de nós; nele encontramos direção e provisão."},
  {ref:"Provérbios 3:5-6",text:"Confie no Senhor de todo o coração e permita que Ele dirija seus caminhos."},
  {ref:"Isaías 41:10",text:"Não tenha medo, pois Deus está com você, fortalece e sustenta."},
  {ref:"Filipenses 4:6-7",text:"Apresente suas necessidades a Deus em oração, e a paz dele guardará seu coração."},
  {ref:"Salmos 46:1",text:"Deus é nosso refúgio e fortaleza, socorro presente nas dificuldades."},
  {ref:"Mateus 5:16",text:"Que a luz de vocês brilhe diante das pessoas, para que Deus seja glorificado."},
  {ref:"Josué 1:9",text:"Seja forte e corajoso: o Senhor seu Deus estará com você por onde andar."}
];
let dailyJobRunning = false;

function saoPauloDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "00";
  return { date:get("year")+"-"+get("month")+"-"+get("day"), hour:Number(get("hour")), minute:Number(get("minute")) };
}
function dailyEventsForUnit(events, unitId, today, weekday) {
  return events.filter(event => {
    if (event.ativo === false || event.unidadeId !== unitId) return false;
    if (event.tipo === "fixo") {
      return !!event.dataInicio && !!event.dataFim && today >= event.dataInicio &&
        today <= event.dataFim && Number(event.diaSemana) === weekday &&
        !(event.cancelamentos && event.cancelamentos[today]);
    }
    return event.data === today;
  }).sort((a,b) => String(a.horarioInicio||"").localeCompare(String(b.horarioInicio||"")));
}
function buildDailyWhatsAppText(member, eventsByUnit, today, verse) {
  const date = new Date(today+"T12:00:00-03:00").toLocaleDateString("pt-BR", {
    timeZone:"America/Sao_Paulo", day:"2-digit", month:"long", year:"numeric"
  });
  let message = "A paz do Senhor, "+(member.nome||"irmão/irmã")+"! 🙏\n\n";
  message += "📖 *Versículo do dia — "+date+"*\n"+verse.ref+"\n"+verse.text+"\n";
  const totalEvents = Object.values(eventsByUnit).reduce((total, items) => total+items.length, 0);
  if (totalEvents) {
    message += "\n⛪ *Programação de hoje — todas as congregações*\n";
    for (const [unitId, unitName] of Object.entries(DAILY_UNITS)) {
      const items = eventsByUnit[unitId] || [];
      message += "\n📍 *"+unitName+"*";
      if (!items.length) { message += "\nSem eventos programados para hoje.\n"; continue; }
      for (const event of items) {
        message += "\n• *"+(event.titulo||"Evento")+"*";
        if (event.horarioInicio) message += " — "+event.horarioInicio+(event.horarioFim?" às "+event.horarioFim:"");
        if (event.local) message += "\n  Local: "+event.local;
        if (event.descricao) message += "\n  "+event.descricao;
      }
      message += "\n";
    }
  } else {
    message += "\nQue o Senhor abençoe seu dia! Hoje não há eventos programados em nenhuma das congregações.";
  }
  return message+"\n_Igreja Pentecostal Unidos em Um_";
}

async function runAutomaticDailyWhatsApp() {
  if (dailyJobRunning) return;
  const now = saoPauloDateParts();
  if (now.hour < 7 || !connected || !sock) return;
  dailyJobRunning = true;
  let runRef = null;
  try {
    const services = getFirebaseAdminServices();
    if (!services) throw new Error("Firebase Admin não está configurado para o disparo automático.");
    runRef = services.db.ref("system/whatsappDailyRuns/"+now.date);
    const lock = await runRef.transaction(current => {
      if (current?.status === "sent") return;
      if (current?.status === "sending" && Date.now()-Number(current.startedAt||Date.now()) < 30*60*1000) return;
      return {status:"sending", startedAt:Date.now(), scheduledTime:"07:00", timezone:"America/Sao_Paulo"};
    });
    if (!lock.committed) return;

    const [membersSnap, eventsSnap] = await Promise.all([
      services.db.ref("members").get(),
      services.db.ref("events").get()
    ]);
    const members = membersSnap.val() || {};
    const rawEvents = eventsSnap.val() || {};
    const events = Object.entries(rawEvents).map(([id,event]) => ({id,...event}));
    const weekday = new Date(now.date+"T12:00:00-03:00").getDay();
    const verseIndex = Math.floor(new Date(now.date+"T12:00:00-03:00").getTime()/86400000) % DAILY_VERSES.length;
    const verse = DAILY_VERSES[verseIndex];
    const eventsByUnit = {};
    for (const unitId of Object.keys(DAILY_UNITS)) {
      eventsByUnit[unitId] = dailyEventsForUnit(events,unitId,now.date,weekday);
    }

    let sent = 0;
    let failed = 0;
    const failures = [];
    for (const [uid,member] of Object.entries(members)) {
      if (member?.status !== "aprovado") continue;
      const destination = normalizeBrazilPhone(member.whatsapp || member.telefone);
      if (!destination) continue;
      try {
        if (!connected || !sock) throw new Error("WhatsApp desconectado durante o disparo.");
        await sock.sendMessage(destination+"@s.whatsapp.net", {
          text:buildDailyWhatsAppText(member,eventsByUnit,now.date,verse)
        });
        sent += 1;
        await new Promise(resolve => setTimeout(resolve,900));
      } catch (error) {
        failed += 1;
        failures.push({member:uid.slice(-6),phone:destination.slice(-4),error:error?.message||"Falha no envio"});
      }
    }
    await runRef.update({
      status:"sent", sent, failed, total:sent+failed,
      completedAt:Date.now(), verse:verse.ref, failures:failures.slice(0,30)
    });
    console.log("Disparo automático diário "+now.date+": "+sent+" enviada(s), "+failed+" falha(s).");
  } catch (error) {
    console.error("Falha no disparo automático diário:",error);
    if (runRef) {
      try { await runRef.update({status:"error",error:error?.message||"Falha desconhecida",failedAt:Date.now()}); } catch {}
    }
  } finally {
    dailyJobRunning = false;
  }
}

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


app.delete("/api/admin/members/:uid",requireMemberManager,async(req,res)=>{
  try {
    const uid = String(req.params.uid || "").trim();
    if (!uid || uid.length > 128 || uid.includes("/") || uid === req.owner.localId) {
      return res.status(400).json({error:"Identificador inválido ou tentativa de excluir a própria conta."});
    }
    const services = getFirebaseAdminServices();
    if (!services) return res.status(503).json({error:"A exclusão completa ainda não está configurada. Configure GOOGLE_APPLICATION_CREDENTIALS ou FIREBASE_SERVICE_ACCOUNT_JSON no ambiente do serviço."});
    const memberRef = services.db.ref("members/" + uid);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists()) return res.status(404).json({error:"Cadastro não encontrado."});
    const member = memberSnap.val() || {};
    if (!req.isMaster && member.unidadeId !== req.managerProfile.unidadeId) return res.status(403).json({error:"Você só pode excluir membros da sua própria igreja."});
    if (member.admins === true || String(member.email || "").toLowerCase() === ADMIN_EMAIL) {
      return res.status(403).json({error:"A conta principal da igreja não pode ser excluída por aqui."});
    }
    try {
      const authUser = await services.auth.getUser(uid);
      if (String(authUser.email || "").toLowerCase() === ADMIN_EMAIL) {
        return res.status(403).json({error:"A conta principal da igreja não pode ser excluída por aqui."});
      }
      await services.auth.deleteUser(uid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
    await memberRef.remove();
    return res.json({ok:true,uid,deletedAuthAccount:true});
  } catch (error) {
    console.error("Falha ao excluir membro:",error);
    return res.status(500).json({error:"Não foi possível concluir a exclusão. Verifique a configuração do Firebase Admin e os logs do serviço."});
  }
});

app.get("/health",(req,res)=>res.json({ok:true,service:"unidos-em-um-whatsapp"}));
app.get("/api/whatsapp/daily/status",requireOwner,async(req,res)=>{ try { const services=getFirebaseAdminServices(); if(!services)return res.status(503).json({error:"Firebase Admin não configurado."}); const today=saoPauloDateParts().date; const snap=await services.db.ref("system/whatsappDailyRuns/"+today).get(); res.json({date:today,run:snap.val()||null,scheduledTime:"07:00",timezone:"America/Sao_Paulo"}); } catch(error) { res.status(500).json({error:"Não foi possível consultar o disparo automático."}); } });
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

app.listen(PORT,"0.0.0.0",()=>{
  console.log("Unidos em Um WhatsApp service listening on "+PORT);
  setTimeout(()=>startWhatsApp().catch(error=>console.error("Falha ao iniciar sessão WhatsApp:",error)),2000);
  setInterval(runAutomaticDailyWhatsApp,30000);
});
