import {db} from "./firebase.js";
import {ref,get,push,set} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
const $=id=>document.getElementById(id);
const id=new URLSearchParams(location.search).get("id");
function datePt(v){if(!v)return"";const [y,m,d]=v.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})}
function el(tag,txt){const n=document.createElement(tag);n.textContent=txt||"";return n}
async function init(){
 if(!id||!/^[A-Za-z0-9_-]{8,}$/.test(id)){$("invalid-invite").classList.remove("hidden");$("public-letter").classList.add("hidden");return}
 try{
  const snap=await get(ref(db,"publicInvites/"+id));
  if(!snap.exists())throw new Error("not found");
  const d=snap.val(),paper=$("public-letter");paper.replaceChildren();
  const header=document.createElement("header");const logo=document.createElement("img");logo.src="logo3d.png";logo.alt="Logo da igreja";header.append(logo,el("h2","IGREJA PENTECOSTAL UNIDOS EM UM"),el("p","CNPJ: 17.935.940/0001-75"),el("p",d.address),el("p","Secretaria: 11 93459-0213 · Pastor: 11 93459-0213"));
  paper.append(header,el("p",d.date?"São Paulo, "+datePt(d.date):""));
  const title=el("h1","CONVITE ESPECIAL");title.append(document.createElement("br"),el("span",d.theme));paper.append(title,el("p","À "+(d.invited||"Igreja / Grupo convidado")+","));
  paper.append(el("p",d.greeting),el("p",d.verse),el("p",d.date?"O encontro será realizado no dia "+datePt(d.date)+(d.time?", às "+d.time+" horas.":"."):""));
  if(Array.isArray(d.songs)&&d.songs.length){paper.append(el("p","Programação musical:"));const ol=document.createElement("ol");d.songs.forEach(s=>ol.append(el("li",s)));paper.append(ol)}
  paper.append(el("p","Contamos com a presença de todos. Que Deus abençoe grandemente!"),el("p","Em Cristo,"));
  const signatures=document.createElement("div");signatures.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:35px;font:11px Arial,sans-serif";
  [["Pr. Edi Carlos Santos de Santana","Pastor Presidente"],["Daniel Parucci Somerlate","Secretaria"]].forEach(([n,r])=>{const p=el("p",n+"\n"+r);p.style.whiteSpace="pre-line";signatures.append(p)});paper.append(signatures);
  const footer=el("footer","IGREJA PENTECOSTAL UNIDOS EM UM · CNPJ 17.935.940/0001-75");paper.append(footer);
  $("confirm-section").classList.remove("hidden");
  $("confirm-form").addEventListener("submit",async e=>{
   e.preventDefault();const btn=$("confirm-form").querySelector("button");btn.disabled=true;btn.textContent="Enviando...";
   try{const data={name:$("person-name").value.trim(),ministry:$("ministry-name").value.trim(),group:$("group-name").value.trim(),createdAt:Date.now()};if(!data.name||!data.ministry||!data.group)throw new Error("Preencha todos os campos.");await set(push(ref(db,"inviteConfirmations/"+id)),data);$("confirm-status").textContent="Presença confirmada com sucesso! Agradecemos a resposta."; $("confirm-form").reset();btn.textContent="Presença confirmada";}
   catch(err){console.error(err);$("confirm-status").textContent="Não foi possível confirmar agora. Tente novamente.";btn.disabled=false;btn.textContent="Confirmar presença"}
  });
 }catch(e){console.error(e);$("invalid-invite").classList.remove("hidden");$("public-letter").classList.add("hidden")}
}
init();
