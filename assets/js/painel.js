import {auth,db} from "./firebase.js";
import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get,update,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const $=s=>document.querySelector(s);let currentUser=null,photoFile=null,photoUrl="",memberData={};
const DRIVE_UPLOAD_URL="https://script.google.com/macros/s/AKfycbxFOjR8zZCCTuOPqRUZ1U1M7yQE8XKrsgfvIesL-eXeDXTj8kYRiTKTdsFLRnK7Kk4Jtg/exec";
const units={sede:{name:"SEDE",pastor:"Pastor Presidente Edi Carlos"},filial2:{name:"FILIAL 2",pastor:"Pastor Local Daniel Parucci"},filial3:{name:"FILIAL 3",pastor:"Pastor Local a definir"}};
const fields={nome:"#full-name",cpf:"#cpf",rg:"#rg",afiliacao:"#affiliation",cargo:"#role"};
onAuthStateChanged(auth,async user=>{if(!user){location.replace("index.html");return}currentUser=user;try{const snap=await get(ref(db,"members/"+user.uid));if(snap.exists()){const d=snap.val();const isAdmin=d.admins===true;$("#user-email").textContent=user.email||"";memberData=d;if(d.status!=="aprovado"&&!isAdmin){location.replace("pendente.html");return}const branchAddress=d.unidadeId==="filial2"?"Travessa Arroio Irapuru, N505 — Filial 2":"Arroio São Gonçalo, N38 • São Paulo/SP";const address=$("#branch-address");if(address)address.textContent=branchAddress;const cardAddress=$("#card-address");if(cardAddress)cardAddress.textContent=branchAddress;const brandTitle=$("#brand-title");if(brandTitle)brandTitle.textContent=d.unidadeId==="filial2"?"IGREJA PENTECOSTAL UNIDOS EM UM — FILIAL 2":"IGREJA PENTECOSTAL UNIDOS EM UM";$("#full-name").value=d.nome||"";$("#cpf").value=d.cpf||"";$("#rg").value=d.rg||"";$("#affiliation").value=d.afiliacao||"";$("#birth-date").value=d.dataNascimento||"";$("#nationality").value=d.nacionalidade||"";$("#naturalness").value=d.naturalidade||"";$("#marital-status").value=d.estadoCivil||"";$("#role").value=d.cargo||"Membro";$("#member-since").value=dateForInput(d.membroDesde||d.aprovadoEm||d.criadoEm);photoUrl=d.fotoUrl||"";paintCard(d)}else{location.replace("pendente.html");return}}catch(e){console.error(e);showMessage("Não foi possível carregar seus dados. Confira as regras do Firebase.");}updateCompletion()});
function formatBirthDate(value){if(!value)return "Não informado";const [y,m,d]=value.split("-");return `${d}/${m}/${y}`}
function dateForInput(value){if(!value)return "";if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const date=new Date(value);if(Number.isNaN(date.getTime()))return "";const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");return `${y}-${m}-${d}`}
function formatMemberSince(value){if(!value)return "Não informado";if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [y,m,d]=value.split("-");return `${d}/${m}/${y}`}const date=new Date(value);return Number.isNaN(date.getTime())?"Não informado":date.toLocaleDateString("pt-BR")}
async function uploadToDrive(payload){
  if(!DRIVE_UPLOAD_URL)throw new Error("URL do Google Drive não configurada.");
  return new Promise((resolve,reject)=>{
    const frame=document.createElement("iframe");
    const form=document.createElement("form");
    const frameName="drive-upload-"+Date.now();
    const requestId=(window.crypto?.randomUUID?.()||("req-"+Date.now()+"-"+Math.random().toString(36).slice(2)));
    payload.requestId=requestId;
    let settled=false;
    const finish=(error,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeout);
      window.removeEventListener("message",onMessage);
      frame.remove();form.remove();
      error?reject(error):resolve(value);
    };
    frame.name=frameName;
    frame.hidden=true;
    form.method="POST";
    form.enctype="application/x-www-form-urlencoded";
    form.action=DRIVE_UPLOAD_URL;
    form.target=frameName;
    form.hidden=true;
    const input=document.createElement("input");
    input.type="hidden";input.name="payload";input.value=JSON.stringify(payload);
    form.append(input);
    const onMessage=event=>{
      let message=event.data;
      if(typeof message==="string"){try{message=JSON.parse(message)}catch(_){return}}
      if(!message||message.type!=="unidos-drive-upload"||message.requestId!==requestId)return;
      const data=message.result;
      if(!data||typeof data!=="object")return finish(new Error("O Google Drive respondeu em formato inválido."));
      if(!data.ok)return finish(new Error(data.error||"O Google Drive recusou o envio da foto."));
      if(!data.url)return finish(new Error("O Google Drive salvou uma resposta sem endereço da foto."));
      finish(null,data);
    };
    const timeout=setTimeout(()=>finish(new Error("O Google Drive não respondeu em 45 segundos. Confira se o Apps Script foi atualizado e implantado como Aplicativo da Web.")),45000);
    window.addEventListener("message",onMessage);
    document.body.append(frame,form);
    try{form.submit()}catch(error){finish(new Error("Não foi possível iniciar o envio ao Google Drive: "+error.message))}
  });
}
async function fileToBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(file)})}
function showMessage(t,ok=false){$("#profile-message").textContent=t;$("#profile-message").className="message"+(ok?" success":"")}
function setPhoto(url){const card=$("#card-photo"),preview=$("#form-photo-preview");if(url){card.src=url;card.classList.add("visible");$("#photo-placeholder").hidden=true;preview.src=url;preview.classList.add("visible");$("#form-photo-placeholder").hidden=true}else{card.removeAttribute("src");card.classList.remove("visible");$("#photo-placeholder").hidden=false;preview.removeAttribute("src");preview.classList.remove("visible");$("#form-photo-placeholder").hidden=false}}
function paintCard(d){const unit=units[d.unidadeId]||null;$("#member-unit").textContent=unit?unit.name+" • "+unit.pastor:"";$("#card-name").textContent=d.nome||"Seu nome aparecerá aqui";$("#card-cpf").textContent=d.cpf||"Não informado";$("#card-rg").textContent=d.rg||"Não informado";$("#card-affiliation").textContent=d.afiliacao||"Não informada";$("#card-birth-date").textContent=formatBirthDate(d.dataNascimento);$("#card-nationality").textContent=d.nacionalidade||"Não informada";$("#card-naturalness").textContent=d.naturalidade||"Não informada";$("#card-marital-status").textContent=d.estadoCivil||"Não informado";$("#card-member-since").textContent=formatMemberSince(d.membroDesde||d.aprovadoEm||d.criadoEm);$("#card-role").textContent=d.cargo||"Membro";$("#card-number").textContent="ID "+(currentUser?.uid||"").slice(0,8).toUpperCase();setPhoto(d.fotoUrl||"")}
function updateCompletion(){const values=[$("#full-name").value,photoUrl||photoFile,$("#cpf").value,$("#rg").value,$("#affiliation").value,$("#birth-date").value,$("#nationality").value,$("#naturalness").value,$("#marital-status").value,$("#member-since").value,$("#role").value];const n=values.filter(Boolean).length;$("#completion").textContent=Math.round(n/values.length*100)+"%";$("#completion-bar").style.width=(n/values.length*100)+"%"}
$("#toggle-settings").addEventListener("click",()=>{$("#settings-panel").classList.remove("hidden");$("#settings-panel").scrollIntoView({behavior:"smooth",block:"start"})});
function closeSettings(){$("#settings-panel").classList.add("hidden");showMessage("")}
$("#close-settings").addEventListener("click",closeSettings);$("#cancel-settings").addEventListener("click",closeSettings);
$("#photo-input").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;if(!["image/jpeg","image/png","image/webp"].includes(f.type)){showMessage("Escolha uma imagem JPG, PNG ou WebP.");e.target.value="";return}if(f.size>5*1024*1024){showMessage("A imagem deve ter no máximo 5 MB.");e.target.value="";return}photoFile=f;const url=URL.createObjectURL(f);$("#form-photo-preview").src=url;$("#form-photo-preview").classList.add("visible");$("#form-photo-placeholder").hidden=true;updateCompletion()});
$("#profile-form").addEventListener("input",updateCompletion);
$("#profile-form").addEventListener("submit",async e=>{e.preventDefault();if(!currentUser)return;const btn=$("#profile-form button[type=submit]");btn.disabled=true;showMessage("Salvando informações...",false);try{if(photoFile){if(!DRIVE_UPLOAD_URL)throw new Error("Integração com o Google Drive pendente de configuração. Siga google-drive/README.md e informe a URL /exec em assets/js/painel.js.");const token=await currentUser.getIdToken();const result=await uploadToDrive({idToken:token,fileName:photoFile.name,mimeType:photoFile.type,base64:await fileToBase64(photoFile)});if(!result.ok||!result.url)throw new Error(result.error||"O Google Drive não retornou o link da foto.");photoUrl=result.url}const data={nome:$("#full-name").value.trim(),cpf:$("#cpf").value.trim(),rg:$("#rg").value.trim(),afiliacao:$("#affiliation").value.trim(),dataNascimento:$("#birth-date").value,nacionalidade:$("#nationality").value.trim(),naturalidade:$("#naturalness").value.trim(),estadoCivil:$("#marital-status").value,membroDesde:$("#member-since").value||dateForInput(memberData.aprovadoEm||memberData.criadoEm),cargo:$("#role").value.trim()||"Membro",fotoUrl:photoUrl,email:currentUser.email,atualizadoEm:serverTimestamp()};await update(ref(db,"members/"+currentUser.uid),data);memberData={...memberData,...data};paintCard(memberData);photoFile=null;updateCompletion();showMessage("Seus dados foram salvos com sucesso!",true)}catch(err){console.error(err);showMessage(err.message||"Não foi possível salvar. Verifique a conexão e as permissões.")}finally{btn.disabled=false}});
$("#logout-btn").addEventListener("click",async()=>{await signOut(auth);location.replace("index.html")});
async function ensureJsPdf(){
  if(window.jspdf?.jsPDF)return;
  const urls=["https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js","https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"];
  for(const src of urls){
    try{
      await new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error("Falha ao carregar "+src));
        document.head.appendChild(script);
      });
      if(window.jspdf?.jsPDF)return;
    }catch(error){console.warn(error)}
  }
  throw new Error("Não foi possível carregar o gerador de PDF.");
}
async function ensureHtml2Canvas(){
  if(window.html2canvas)return;
  const urls=["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js","https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"];
  for(const src of urls){
    try{
      await new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error("Falha ao carregar "+src));
        document.head.appendChild(script);
      });
      if(window.html2canvas)return;
    }catch(error){console.warn(error)}
  }
  throw new Error("Não foi possível carregar o capturador visual da carteirinha.");
}
$("#download-pdf").addEventListener("click",async()=>{
  const button=$("#download-pdf");
  const original=button.textContent;
  button.disabled=true;button.textContent="Preparando PDF...";
  try{
    await Promise.all([ensureJsPdf(),ensureHtml2Canvas()]);
    if(document.fonts?.ready)await document.fonts.ready;
    const card=$("#member-card");
    const images=Array.from(card.querySelectorAll("img"));
    await Promise.all(images.map(img=>{
      if(!img.getAttribute("src")||img.complete)return Promise.resolve();
      return new Promise(resolve=>{img.onload=resolve;img.onerror=resolve});
    }));
    const canvas=await window.html2canvas(card,{
      scale:3,
      backgroundColor:null,
      useCORS:true,
      allowTaint:false,
      logging:false,
      imageTimeout:20000,
      scrollX:0,
      scrollY:0
    });
    const image=canvas.toDataURL("image/png");
    const {jsPDF}=window.jspdf;
    const width=180;
    const height=width*(canvas.height/canvas.width);
    const pageHeight=Math.max(110,height+16);
    const doc=new jsPDF({orientation:"landscape",unit:"mm",format:[190,pageHeight]});
    doc.setFillColor(250,249,246);
    doc.rect(0,0,190,pageHeight,"F");
    doc.addImage(image,"PNG",5,8,width,height,undefined,"FAST");
    doc.save("carteirinha-unidos-em-um.pdf");
  }catch(error){
    console.error("Erro ao gerar PDF fiel à carteirinha:",error);
    alert("Não foi possível gerar o PDF com o visual completo. Vamos abrir a impressão do navegador; selecione 'Salvar como PDF' e habilite 'Gráficos de segundo plano'.");
    window.print();
  }finally{
    button.disabled=false;button.textContent=original;
  }
});
