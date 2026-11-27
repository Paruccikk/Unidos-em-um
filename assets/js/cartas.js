import {auth,db} from "./firebase.js";
import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get,push,set,onValue} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
const $=id=>document.getElementById(id);
let currentUser=null;
const fields=["church-address","invited-church","event-theme","event-verse","event-date","event-time","event-songs","greeting"];
function isLeader(p){return p&&(p.admMaster===true||p.admins===true||p.papel==="admin")}
function datePt(v){if(!v)return"";const [y,m,d]=v.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})}
function readLetter(){return {address:$("church-address").value.trim(),invited:$("invited-church").value.trim(),theme:$("event-theme").value.trim(),verse:$("event-verse").value.trim(),date:$("event-date").value,time:$("event-time").value,songs:$("event-songs").value.split("\n").map(s=>s.trim()).filter(Boolean),greeting:$("greeting").value.trim(),createdAt:Date.now(),createdBy:currentUser.uid}}
function updatePreview(){
 $("preview-address").textContent=$("church-address").value.trim();
 $("preview-invited").textContent=$("invited-church").value.trim()||"Igreja / Grupo convidado";
 $("preview-theme-title").textContent=$("event-theme").value.trim()||"TEMA DO ENCONTRO";
 $("preview-verse").textContent=$("event-verse").value.trim();
 $("preview-greeting").textContent=$("greeting").value.trim();
 const date=datePt($("event-date").value),time=$("event-time").value;
 $("preview-date").textContent=date?"São Paulo, "+date:"";
 $("preview-event").textContent=date?"O encontro será realizado no dia "+date+(time?", às "+time+" horas.":"."):"";
 const list=$("preview-songs");list.replaceChildren();$("event-songs").value.split("\n").map(s=>s.trim()).filter(Boolean).forEach(song=>{const li=document.createElement("li");li.textContent=song;list.append(li)});
 $("preview-songs-wrap").hidden=!list.children.length;
}
function invitationUrl(id){return location.origin+location.pathname.replace("cartas.html","convite.html")+"?id="+encodeURIComponent(id)}
function renderInvites(snap){
 const root=$("created-invitations");root.replaceChildren();
 if(!snap.exists()){root.textContent="Nenhum convite criado ainda.";return}
 Object.entries(snap.val()).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0)).forEach(([id,inv])=>{
  const card=document.createElement("div");card.className="invite-row";
  const title=document.createElement("strong");title.textContent=inv.theme||"Convite";
  const meta=document.createElement("small");meta.textContent=(inv.invited||"")+(inv.date?" · "+datePt(inv.date):"");
  const actions=document.createElement("div");actions.className="letter-actions";
  const copy=document.createElement("button");copy.className="outline-btn";copy.type="button";copy.textContent="Copiar link";
  copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(invitationUrl(id));copy.textContent="Link copiado!";setTimeout(()=>copy.textContent="Copiar link",1800)}catch(e){prompt("Copie o link do convite:",invitationUrl(id))}});
  const count=document.createElement("button");count.className="outline-btn";count.type="button";count.textContent="Ver confirmações";
  const list=document.createElement("div");list.hidden=true;list.className="invite-confirmations";
  count.addEventListener("click",()=>{list.hidden=!list.hidden;count.textContent=list.hidden?"Ver confirmações":"Ocultar confirmações";if(!list.dataset.loaded){list.dataset.loaded="1";onValue(ref(db,"inviteConfirmations/"+id),s=>{list.replaceChildren();if(!s.exists()){list.textContent="Ainda não há confirmações.";return}Object.values(s.val()).forEach(c=>{const p=document.createElement("p");p.textContent=c.name+" — "+c.ministry+" / "+c.group;list.append(p)})})}});
  actions.append(copy,count);card.append(title,meta,actions,list);root.append(card);
 });
}
fields.forEach(id=>$(id).addEventListener("input",updatePreview));
$("print-letter").addEventListener("click",()=>{if(!$("letter-form").reportValidity())return;updatePreview();window.print()});
$("save-invitation").addEventListener("click",async()=>{
 if(!$("letter-form").reportValidity())return;
 const data=readLetter();
 if(!data.theme||!data.invited||!data.date||!data.time){alert("Preencha igreja/grupo, tema, data e horário.");return}
 const btn=$("save-invitation");btn.disabled=true;btn.textContent="Salvando...";
 try{const newRef=push(ref(db,"publicInvites"));await set(newRef,data);await navigator.clipboard?.writeText(invitationUrl(newRef.key)).catch(()=>{});alert("Convite criado! O link público foi copiado quando permitido pelo navegador.");}
 catch(e){console.error(e);alert("Não foi possível salvar o convite. Verifique sua conexão e tente novamente.")}
 finally{btn.disabled=false;btn.textContent="Criar convite e gerar link"}
});
$("reset-letter").addEventListener("click",()=>{if(!confirm("Limpar os dados preenchidos do evento?"))return;["invited-church","event-theme","event-verse","event-date","event-songs"].forEach(id=>$(id).value="");$("event-time").value="19:00";updatePreview()});
onAuthStateChanged(auth,async user=>{
 if(!user){location.replace("index.html");return}
 currentUser=user;
 try{const snap=await get(ref(db,"members/"+user.uid)),profile=snap.val();if(!isLeader(profile)||profile.status!=="aprovado"&&profile.admins!==true&&profile.papel!=="admin"){location.replace("painel.html");return}
 $("letters-email").textContent=user.email||"";updatePreview();onValue(ref(db,"publicInvites"),renderInvites);
 }catch(error){console.error(error);alert("Não foi possível validar sua permissão de administrador. Tente novamente.");location.replace("painel.html")}
});
$("letters-logout").addEventListener("click",async()=>{await signOut(auth);location.replace("index.html")});
