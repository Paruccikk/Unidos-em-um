import {auth,db} from "./firebase.js";
import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const OWNER="danielparuccikk@gmail.com";
const API="https://unidos-em-um-whatsapp-qr.onrender.com";
const $=s=>document.querySelector(s);
let currentUser=null,polling=null,dailyMessages=[],dailyDate="";
const units={sede:"Sede",filial2:"Filial 1",filial3:"Filial 2"};
const verses=[
  {ref:"Salmos 23:1",text:"O Senhor é nosso pastor e cuida de nós; nele encontramos direção e provisão."},
  {ref:"Provérbios 3:5-6",text:"Confie no Senhor de todo o coração e permita que Ele dirija seus caminhos."},
  {ref:"Isaías 41:10",text:"Não tenha medo, pois Deus está com você, fortalece e sustenta."},
  {ref:"Filipenses 4:6-7",text:"Apresente suas necessidades a Deus em oração, e a paz dele guardará seu coração."},
  {ref:"Salmos 46:1",text:"Deus é nosso refúgio e fortaleza, socorro presente nas dificuldades."},
  {ref:"Mateus 5:16",text:"Que a luz de vocês brilhe diante das pessoas, para que Deus seja glorificado."},
  {ref:"Josué 1:9",text:"Seja forte e corajoso: o Senhor seu Deus estará com você por onde andar."}
];
function show(text,ok=false){$("#wa-status").textContent=text;$("#wa-status").className="message"+(ok?" success":"")}
function dailyShow(text,ok=false){$("#wa-daily-summary").textContent=text;$("#wa-daily-summary").className="message"+(ok?" success":"")}
async function api(path,method="GET",body){if(!currentUser)throw new Error("Sessão não autenticada.");const token=await currentUser.getIdToken();const response=await fetch(API+path,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Falha ao comunicar com o serviço WhatsApp.");return data}
function render(data){
 if(data.connected){show("WhatsApp conectado"+(data.phone?" • "+data.phone:"")+".",true);$("#wa-qr-wrap").classList.add("hidden")}
 else if(data.qr){show("QR Code pronto. Leia pelo WhatsApp no celular.");$("#wa-qr").src=data.qr;$("#wa-qr-wrap").classList.remove("hidden")}
 else if(data.connecting){show("Aguardando conexão/QR Code do WhatsApp...");$("#wa-qr-wrap").classList.add("hidden")}
 else{show(data.error||"WhatsApp desconectado.");$("#wa-qr-wrap").classList.add("hidden")}
 $("#wa-error").textContent=data.error||"";
 $("#wa-connect").disabled=data.connected||data.connecting;
 $("#wa-disconnect").disabled=!data.connected&&!data.connecting;
 $("#wa-daily-preview").disabled=!currentUser;
 $("#wa-daily-send").disabled=!data.connected||dailyMessages.length===0;
}
async function refresh(){try{render(await api("/api/whatsapp/status"))}catch(e){show(e.message);$("#wa-error").textContent=e.message}}
function saoPauloToday(){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const part=type=>parts.find(p=>p.type===type)?.value;
 return part("year")+"-"+part("month")+"-"+part("day");
}
function normalizePhone(value){
 let digits=String(value||"").replace(/\D/g,"");
 if(!digits)return null;
 if(digits.startsWith("00"))digits=digits.slice(2);
 if((digits.length===12||digits.length===13)&&digits.startsWith("55"))digits=digits.slice(2);
 if((digits.length===11||digits.length===12)&&digits.startsWith("0"))digits=digits.slice(1);
 return digits.length===10||digits.length===11?"55"+digits:null;
}
function eventsForUnit(events,unitId,today,weekday){
 return events.filter(e=>{
  if(e.ativo===false||e.unidadeId!==unitId)return false;
  if(e.tipo==="fixo")return !!e.dataInicio&&!!e.dataFim&&today>=e.dataInicio&&today<=e.dataFim&&Number(e.diaSemana)===weekday&&!(e.cancelamentos&&e.cancelamentos[today]);
  return e.data===today;
 }).sort((a,b)=>(a.horarioInicio||"").localeCompare(b.horarioInicio||""));
}
function formatDailyMessage(member,events,today,verse){
 const date=new Date(today+"T12:00:00-03:00").toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"long",year:"numeric"});
 let message="A paz do Senhor, "+(member.nome||"irmão/irmã")+"! 🙏\n\n";
 message+="📖 *Versículo do dia — "+date+"*\n"+verse.ref+"\n"+verse.text+"\n";
 if(events.length){
  message+="\n⛪ *Eventos de hoje — "+(units[member.unidadeId]||"sua unidade")+"*\n";
  for(const e of events){
   message+="\n• *"+(e.titulo||"Evento")+"*";
   if(e.horarioInicio)message+=" — "+e.horarioInicio+(e.horarioFim?" às "+e.horarioFim:"");
   if(e.local)message+="\n  Local: "+e.local;
   if(e.descricao)message+="\n  "+e.descricao;
  }
 } else {
  message+="\nQue o Senhor abençoe seu dia! Hoje não há eventos programados para sua unidade.";
 }
 message+="\n\n_Igreja Pentecostal Unidos em Um_";
 return message;
}
async function previewDaily(){
 const button=$("#wa-daily-preview");button.disabled=true;dailyMessages=[];$("#wa-daily-preview-list").replaceChildren();
 dailyShow("Consultando membros e eventos...");
 try{
  const today=saoPauloToday(),weekday=new Date(today+"T12:00:00-03:00").getDay();
  const [membersSnap,eventsSnap]=await Promise.all([get(ref(db,"members")),get(ref(db,"events"))]);
  const members=membersSnap.val()||{},rawEvents=eventsSnap.val()||{};
  const events=Object.entries(rawEvents).map(([id,e])=>({id,...e}));
  const verse=verses[Math.floor(new Date(today+"T12:00:00-03:00").getTime()/86400000)%verses.length];
  const previews=[];
  let approvedCount=0,phoneCount=0;
  for(const [uid,m] of Object.entries(members)){
   if(m.status==="aprovado"||m.admins===true)approvedCount++;
   if(m.status!=="aprovado")continue;
   const phone=normalizePhone(m.whatsapp||m.telefone);
   if(!phone)continue;
   phoneCount++;
   const unitEvents=eventsForUnit(events,m.unidadeId,today,weekday);
   dailyMessages.push({phone,text:formatDailyMessage(m,unitEvents,today,verse),name:m.nome||"Membro",unit:units[m.unidadeId]||"Unidade não definida",events:unitEvents.length});
   previews.push(m.nome||"Membro");
  }
  dailyDate=today;
  if(!dailyMessages.length){dailyShow("Nenhum destinatário encontrado. Diagnóstico: "+approvedCount+" aprovado(s), "+phoneCount+" com telefone válido. Confira se os membros cadastraram e salvaram o WhatsApp no perfil.");$("#wa-daily-send").disabled=true;return}
  const counts={};for(const m of dailyMessages)counts[m.unit]=(counts[m.unit]||0)+1;
  dailyShow(dailyMessages.length+" destinatário(s) elegível(is). Data: "+new Date(today+"T12:00:00-03:00").toLocaleDateString("pt-BR")+". Confira antes de disparar.",true);
  const summary=document.createElement("p");summary.textContent=Object.entries(counts).map(([unit,count])=>unit+": "+count).join(" • ");$("#wa-daily-preview-list").append(summary);
  const list=document.createElement("p");list.textContent="Destinatários: "+previews.join(", ");$("#wa-daily-preview-list").append(list);
  $("#wa-daily-send").disabled=true;
  const status=await api("/api/whatsapp/status");render(status);
  $("#wa-daily-send").disabled=!status.connected;
 }catch(e){
  console.error("Falha ao preparar disparo diário:",e);
  dailyShow(e.code==="auth/network-request-failed"?"Falha de rede na autenticação Firebase. Verifique sua conexão, bloqueadores do navegador e os domínios autorizados no Firebase.":e.message);
  $("#wa-daily-send").disabled=true;
 }finally{button.disabled=false}
}
onAuthStateChanged(auth,async user=>{
 if(!user){location.replace("index.html");return}
 currentUser=user;
 try{
  const snap=await get(ref(db,"members/"+user.uid));const p=snap.val()||{};
  if((user.email||"").toLowerCase()!==OWNER||!(p.admins===true||p.papel==="admin")){
   document.body.innerHTML="<main class='admin-main'><h1>Acesso restrito</h1><p>Esta área está disponível somente para a conta autorizada.</p></main>";return
  }
  $("#wa-owner-email").textContent=user.email;await refresh();polling=setInterval(refresh,5000);
 }catch(e){
  console.error(e);
  const message=e.code==="auth/network-request-failed"?"Firebase não conseguiu acessar a rede. Confira sua internet, extensões que bloqueiam requisições e tente recarregar a página.":e.message;
  show(message);$("#wa-error").textContent=message;
 }
});
window.addEventListener("unhandledrejection",event=>{
 const error=event.reason;
 if(error?.code==="auth/network-request-failed"){show("Falha de rede do Firebase Authentication. Recarregue a página e confira se o navegador consegue acessar firebaseapp.com e googleapis.com.");$("#wa-error").textContent=error.message||error.code}
});
$("#wa-connect").addEventListener("click",async()=>{const b=$("#wa-connect");b.disabled=true;show("Solicitando conexão...");try{render(await api("/api/whatsapp/connect","POST"))}catch(e){show(e.message)}finally{b.disabled=false}});
$("#wa-refresh").addEventListener("click",refresh);
$("#wa-disconnect").addEventListener("click",async()=>{if(!confirm("Deseja desconectar o WhatsApp?"))return;try{render(await api("/api/whatsapp/disconnect","POST"))}catch(e){show(e.message)}});
$("#wa-daily-preview").addEventListener("click",previewDaily);
$("#wa-daily-send").addEventListener("click",async()=>{
 if(!dailyMessages.length||!dailyDate)return;
 const confirmed=confirm("Confirma o envio do versículo e dos eventos de "+new Date(dailyDate+"T12:00:00-03:00").toLocaleDateString("pt-BR")+" para "+dailyMessages.length+" membro(s)? As mensagens serão enviadas agora pelo WhatsApp conectado.");
 if(!confirmed)return;
 const button=$("#wa-daily-send");button.disabled=true;dailyShow("Enviando mensagens... Não feche esta página.");
 try{
  const result=await api("/api/whatsapp/daily/send","POST",{date:dailyDate,messages:dailyMessages.map(m=>({phone:m.phone,text:m.text}))});
  dailyShow("Disparo concluído: "+result.sent+" enviada(s), "+result.failed+" falha(s)."+(result.failed?" Confira os últimos 4 dígitos dos números no relatório.":""),result.failed===0);
  if(result.failures?.length){const p=document.createElement("p");p.textContent="Falhas: "+result.failures.map(f=>f.phone+" ("+f.error+")").join(" • ");$("#wa-daily-preview-list").append(p)}
  dailyMessages=[];dailyDate="";
 }catch(e){dailyShow(e.message)}finally{button.disabled=false;await refresh()}
});
$("#wa-logout").addEventListener("click",async()=>{if(polling)clearInterval(polling);await signOut(auth);location.replace("index.html")});
