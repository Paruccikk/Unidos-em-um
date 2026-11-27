import {auth,db} from "./firebase.js";
import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
const $=id=>document.getElementById(id);
let currentUser=null;
const fields=["church-address","invited-church","event-theme","event-verse","event-date","event-time","event-songs","greeting"];
function isLeader(profile){return profile&&(profile.admins===true||profile.papel==="admin"||profile.papel==="editor")}
function datePt(value){if(!value)return"";const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})}
function updatePreview(){
 $("preview-address").textContent=$("church-address").value.trim();
 $("preview-invited").textContent=$("invited-church").value.trim()||"Igreja / Grupo convidado";
 $("preview-theme-title").textContent=$("event-theme").value.trim()||"TEMA DO ENCONTRO";
 $("preview-verse").textContent=$("event-verse").value.trim();
 $("preview-greeting").textContent=$("greeting").value.trim();
 const date=datePt($("event-date").value),time=$("event-time").value;
 $("preview-date").textContent=date?"São Paulo, "+date:"";
 $("preview-event").textContent=date?"O encontro será realizado no dia "+date+(time?", às "+time+" horas.":"."):"";
 const songs=$("event-songs").value.split("\n").map(s=>s.trim()).filter(Boolean),list=$("preview-songs");
 list.replaceChildren();songs.forEach(song=>{const li=document.createElement("li");li.textContent=song;list.append(li)});
 $("preview-songs-wrap").hidden=!songs.length;
}
fields.forEach(id=>$(id).addEventListener("input",updatePreview));
$("print-letter").addEventListener("click",()=>{if(!$("letter-form").reportValidity())return;updatePreview();window.print()});
$("reset-letter").addEventListener("click",()=>{if(!confirm("Limpar os dados preenchidos do evento?"))return;["invited-church","event-theme","event-verse","event-date","event-songs"].forEach(id=>$(id).value="");$("event-time").value="19:00";updatePreview()});
onAuthStateChanged(auth,async user=>{
 if(!user){location.replace("index.html");return}
 currentUser=user;
 try{
  const snap=await get(ref(db,"members/"+user.uid)),profile=snap.val();
  if(!isLeader(profile)||profile.status!=="aprovado"&&profile.admins!==true&&profile.papel!=="admin"){location.replace("painel.html");return}
  $("letters-email").textContent=user.email||"";
  updatePreview();
 }catch(error){console.error(error);alert("Não foi possível validar sua permissão de Editor. Tente novamente.");location.replace("painel.html")}
});
$("letters-logout").addEventListener("click",async()=>{await signOut(auth);location.replace("index.html")});
