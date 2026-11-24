import {auth,db} from "./firebase.js";
import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
const OWNER="danielparuccikk@gmail.com";
const API="https://unidos-em-um-whatsapp.onrender.com";
const $=s=>document.querySelector(s);
let currentUser=null,polling=null;
function show(text,ok=false){$("#wa-status").textContent=text;$("#wa-status").className="message"+(ok?" success":"")}
async function api(path,method="GET"){if(!currentUser)throw new Error("Sessão não autenticada.");const token=await currentUser.getIdToken();const response=await fetch(API+path,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Falha ao comunicar com o serviço WhatsApp.");return data}
function render(data){if(data.connected){show("WhatsApp conectado"+(data.phone?" • "+data.phone:"")+".",true);$("#wa-qr-wrap").classList.add("hidden")}else if(data.qr){show("QR Code pronto. Leia pelo WhatsApp no celular.");$("#wa-qr").src=data.qr;$("#wa-qr-wrap").classList.remove("hidden")}else if(data.connecting){show("Aguardando QR Code do WhatsApp...");$("#wa-qr-wrap").classList.add("hidden")}else{show(data.error||"WhatsApp desconectado.");$("#wa-qr-wrap").classList.add("hidden")}$("#wa-error").textContent=data.error||"";$("#wa-connect").disabled=data.connected||data.connecting;$("#wa-disconnect").disabled=!data.connected&&!data.connecting}
async function refresh(){try{render(await api("/api/whatsapp/status"))}catch(e){show(e.message);$("#wa-error").textContent=e.message}}
onAuthStateChanged(auth,async user=>{if(!user){location.replace("index.html");return}currentUser=user;try{const snap=await get(ref(db,"members/"+user.uid));const p=snap.val()||{};if((user.email||"").toLowerCase()!==OWNER||!(p.admins===true||p.papel==="admin")){document.body.innerHTML="<main class='admin-main'><h1>Acesso restrito</h1><p>Esta área está disponível somente para a conta autorizada.</p></main>";return}$("#wa-owner-email").textContent=user.email;await refresh();polling=setInterval(refresh,5000)}catch(e){show(e.message)}});
$("#wa-connect").addEventListener("click",async()=>{const b=$("#wa-connect");b.disabled=true;show("Solicitando conexão...");try{render(await api("/api/whatsapp/connect","POST"))}catch(e){show(e.message)}finally{b.disabled=false}});
$("#wa-refresh").addEventListener("click",refresh);
$("#wa-disconnect").addEventListener("click",async()=>{if(!confirm("Deseja desconectar o WhatsApp?"))return;try{render(await api("/api/whatsapp/disconnect","POST"))}catch(e){show(e.message)}});
$("#wa-logout").addEventListener("click",async()=>{if(polling)clearInterval(polling);await signOut(auth);location.replace("index.html")});
