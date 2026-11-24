import {auth,db} from "./firebase.js";
import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get,push,set,update} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const $=s=>document.querySelector(s);
const OWNER="danielparuccikk@gmail.com";
const DRIVE_UPLOAD_URL="https://script.google.com/macros/s/AKfycbxFOjR8zZCCTuOPqRUZ1U1M7yQE8XKrsgfvIesL-eXeDXTj8kYRiTKTdsFLRnK7Kk4Jtg/exec";
let user=null,profile=null;

function message(text,ok=false){$("#document-message").textContent=text;$("#document-message").className="message"+(ok?" success":"")}
function canManage(){return !!user&&(user.email||"").toLowerCase()===OWNER&&(profile?.admins===true||profile?.papel==="admin")}
function fileToBase64(file,onProgress){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(Math.round(e.loaded/e.total*35))};
  reader.onerror=()=>reject(new Error("Não foi possível ler o arquivo selecionado."));
  reader.onload=()=>{const result=String(reader.result||"");const comma=result.indexOf(",");if(comma<0)return reject(new Error("Não foi possível preparar o arquivo."));resolve(result.slice(comma+1))};
  reader.readAsDataURL(file);
 });
}
async function uploadToDrive(payload){
 return new Promise((resolve,reject)=>{
  const frame=document.createElement("iframe"),form=document.createElement("form");
  const frameName="drive-document-"+Date.now();
  const requestId=window.crypto?.randomUUID?.()||("req-"+Date.now()+"-"+Math.random().toString(36).slice(2));
  payload.requestId=requestId;
  let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timeout);window.removeEventListener("message",onMessage);frame.remove();form.remove();error?reject(error):resolve(value)};
  frame.name=frameName;frame.hidden=true;
  form.method="POST";form.enctype="application/x-www-form-urlencoded";form.action=DRIVE_UPLOAD_URL;form.target=frameName;form.hidden=true;
  const input=document.createElement("input");input.type="hidden";input.name="payload";input.value=JSON.stringify(payload);form.append(input);
  const onMessage=event=>{
   let data=event.data;if(typeof data==="string"){try{data=JSON.parse(data)}catch(_){return}}
   if(!data||data.type!=="unidos-drive-upload"||data.requestId!==requestId)return;
   const result=data.result;if(!result||typeof result!=="object")return finish(new Error("Resposta inválida do Google Drive."));
   if(!result.ok)return finish(new Error(result.error||"O Google Drive recusou o envio."));
   if(!result.url||!result.fileId)return finish(new Error("O Drive não retornou os dados do arquivo."));
   finish(null,result);
  };
  const timeout=setTimeout(()=>finish(new Error("O Google Drive não respondeu em 90 segundos. Confira a implantação do Apps Script.")),90000);
  window.addEventListener("message",onMessage);document.body.append(frame,form);
  try{form.submit()}catch(error){finish(new Error("Não foi possível iniciar o envio: "+error.message))}
 });
}
onAuthStateChanged(auth,async u=>{
 if(!u){location.replace("index.html");return}
 user=u;
 try{
  const snap=await get(ref(db,"members/"+u.uid));profile=snap.val();
  if(!profile||(profile.status!=="aprovado"&&profile.admins!==true&&profile.papel!=="admin")){location.replace("pendente.html");return}
  $("#documents-email").textContent=u.email||"";
  if(canManage())$("#document-upload-panel").classList.remove("hidden");
  await loadDocuments();
 }catch(e){console.error(e);$("#documents-list").textContent="Não foi possível carregar os documentos. Confira as regras do Firebase."}
});
async function loadDocuments(){
 const host=$("#documents-list");host.replaceChildren();
 const snap=await get(ref(db,"documents"));
 const docs=Object.entries(snap.val()||{}).map(([id,d])=>({id,...d})).filter(d=>d.ativo!==false).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
 if(!docs.length){const p=document.createElement("p");p.className="admin-empty";p.textContent="Ainda não há documentos publicados.";host.append(p);return}
 for(const d of docs){
  const card=document.createElement("article");card.className="document-card";
  const icon=document.createElement("div");icon.className="document-icon";icon.textContent=d.tipo==="application/pdf"?"PDF":"IMG";
  const body=document.createElement("div");body.className="document-card-body";
  const h=document.createElement("h3");h.textContent=d.titulo||"Documento";
  const desc=document.createElement("p");desc.textContent=d.descricao||"Material disponibilizado pela igreja.";
  const meta=document.createElement("small");meta.textContent="Publicado em "+(d.criadoEm?new Date(d.criadoEm).toLocaleDateString("pt-BR"):"");
  body.append(h,desc,meta);
  const actions=document.createElement("div");actions.className="document-actions";
  const link=document.createElement("a");link.className="outline-btn";link.href=d.url;link.target="_blank";link.rel="noopener";link.textContent="Abrir / baixar";actions.append(link);
  if(canManage()){
   const del=document.createElement("button");del.className="outline-btn danger-btn";del.textContent="Remover";
   del.addEventListener("click",async()=>{if(!confirm("Remover este documento da biblioteca? O arquivo continuará guardado no Google Drive."))return;try{await update(ref(db,"documents/"+d.id),{ativo:false,removidoEm:Date.now(),removidoPor:user.uid});await loadDocuments()}catch(e){console.error(e);alert("Não foi possível remover o documento da biblioteca.")}});
   actions.append(del);
  }
  card.append(icon,body,actions);host.append(card);
 }
}
$("#document-form").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!canManage()){message("Sua conta não tem permissão para publicar documentos.");return}
 const file=$("#document-file").files[0];if(!file)return;
 if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type)){message("Formato não permitido. Envie PDF, JPG, PNG ou WebP.");return}
 if(file.size>15*1024*1024){message("O arquivo ultrapassa o limite de 15 MB.");return}
 const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');btn.disabled=true;
 try{
  message("Preparando arquivo para o Google Drive... 0%");
  const base64=await fileToBase64(file,p=>message("Preparando arquivo... "+p+"%"));
  message("Enviando arquivo ao Google Drive... 40%");
  const idToken=await user.getIdToken(true);
  const result=await uploadToDrive({documentUpload:true,idToken,base64,mimeType:file.type,fileName:file.name});
  message("Arquivo recebido. Salvando na biblioteca... 90%");
  const record=push(ref(db,"documents"));
  await set(record,{titulo:$("#document-title").value.trim(),descricao:$("#document-description").value.trim(),url:result.url,fileId:result.fileId,nomeArquivo:file.name,tipo:file.type,tamanho:file.size,ativo:true,criadoPor:user.uid,criadoEm:Date.now(),armazenamento:"google-drive"});
  form.reset();message("Documento enviado ao Google Drive e publicado na biblioteca.",true);await loadDocuments();
 }catch(err){console.error(err);message(err.message||"Não foi possível publicar o documento. Confira a implantação do Apps Script e as permissões do Firebase.")}
 finally{btn.disabled=false}
});
$("#refresh-documents").addEventListener("click",()=>loadDocuments().catch(e=>console.error(e)));
$("#documents-logout").addEventListener("click",async()=>{await signOut(auth);location.replace("index.html")});
