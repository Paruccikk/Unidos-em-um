import {auth,db} from "./firebase.js";
import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get,onValue,push,set,update,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {isMasterAdmin} from "./permissions.js";
const $=s=>document.querySelector(s),units={sede:"Sede",filial2:"Filial 1",filial3:"Filial 2 - BA"};
let selectedUnit="todos";
let currentUser=null,profile=null,canEdit=false,isMaster=false,ownUnit=null,events={},selectedDate="",year=new Date().getFullYear(),unsubscribe=null;
const todayISO=()=>dateISO(new Date()),dateISO=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const parseDate=s=>{const [y,m,d]=String(s||"").split("-").map(Number);return new Date(y,(m||1)-1,d||1,12)};
const fmtDate=s=>parseDate(s).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
const weekdays=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const monthShort=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
onAuthStateChanged(auth,async user=>{
 if(!user){location.replace("index.html");return}currentUser=user;
 try{const snap=await get(ref(db,"members/"+user.uid));if(!snap.exists()){location.replace("pendente.html");return}
 const p=profile=snap.val();isMaster=await isMasterAdmin(user,db)||p.admMaster===true;ownUnit=p.unidadeId||null;const leader=isMaster||p.papel==="admin"||p.admins===true;if(p.status!=="aprovado"&&!isMaster){location.replace("pendente.html");return}
 canEdit=leader&&(isMaster||!!ownUnit);selectedUnit="todos";$("#events-email").textContent=user.email||"";if(canEdit)$("#event-editor").classList.remove("hidden");
 const filters=$("#unit-filter-buttons");if(filters)filters.parentElement.hidden=false;const unitSelect=$("#event-unit");if(unitSelect&&!isMaster){unitSelect.value=ownUnit||"";unitSelect.disabled=true;}
 unsubscribe=onValue(ref(db,"events"),s=>{events=s.val()||{};renderUpcoming();renderCalendar();if(selectedDate)renderDay(selectedDate)},e=>{console.error(e);$("#fixed-events").textContent="Não foi possível carregar os eventos. Confira as regras do Firebase.";$("#oneoff-events").textContent="Não foi possível carregar os eventos.";$("#annual-calendar").textContent="Não foi possível carregar o calendário."});
 }catch(e){console.error(e);$("#fixed-events").textContent="Não foi possível validar seu acesso."}
});
function visibleEvents(){return Object.entries(events).map(([id,e])=>({id,...e})).filter(e=>selectedUnit==="todos"||e.unidadeId===selectedUnit)}
function canEditEvent(e){return canEdit&&!!e&&(isMaster||e.unidadeId===ownUnit)}
function occurrencesForDate(date,source=visibleEvents()){
 const weekday=parseDate(date).getDay();
 return source.flatMap(e=>{
  if(e.ativo===false)return [];
  if(e.tipo==="fixo"){if(date<e.dataInicio||date>e.dataFim||Number(e.diaSemana)!==weekday||(e.cancelamentos&&e.cancelamentos[date]))return [];return [{...e,id:e.id,data:date,recorrente:true}]}
  return e.data===date?[{...e,recorrente:false}]:[];
 }).sort((a,b)=>(a.horarioInicio||"").localeCompare(b.horarioInicio||""));
}
function upcomingOccurrences(){
 const start=todayISO(),endDate=new Date();endDate.setDate(endDate.getDate()+365);const end=dateISO(endDate),source=visibleEvents().filter(e=>e.tipo!=="fixo"),result=[];
 for(let d=parseDate(start);dateISO(d)<=end;d.setDate(d.getDate()+1)){const date=dateISO(d);for(const e of occurrencesForDate(date,source))result.push(e)}
 return result.sort((a,b)=>(a.data+" "+(a.horarioInicio||"")).localeCompare(b.data+" "+(b.horarioInicio||"")));
}
function makeEventCard(e,fixed=false){
 const card=document.createElement("article");card.className="upcoming-card";const dateBox=document.createElement("div");dateBox.className="upcoming-date";const day=document.createElement("strong"),month=document.createElement("span");
 if(fixed){day.textContent=weekdays[Number(e.diaSemana??parseDate(e.dataInicio).getDay())].slice(0,3);month.textContent="FIXO"}else{day.textContent=parseDate(e.data).getDate();month.textContent=monthShort[parseDate(e.data).getMonth()]}
 dateBox.append(day,month);const content=document.createElement("div");content.className="upcoming-content";const meta=document.createElement("div");meta.className="upcoming-meta";
 meta.textContent=(fixed?weekdays[Number(e.diaSemana??parseDate(e.dataInicio).getDay())]:fmtDate(e.data))+" • "+(e.horarioInicio||"Horário não definido")+(e.horarioFim?" às "+e.horarioFim:"");const unitBadge=document.createElement("span");unitBadge.className="unit-highlight unit-"+(e.unidadeId||"sede");unitBadge.textContent=units[e.unidadeId]||"Igreja";
 const title=document.createElement("h3");title.textContent=e.titulo||"Evento";const desc=document.createElement("p");desc.textContent=e.descricao||"Sem descrição adicional.";content.append(meta,title,desc);card.append(unitBadge);
 if(canEditEvent(e)){const actions=document.createElement("div");actions.className="upcoming-actions";const edit=document.createElement("button");edit.type="button";edit.className="outline-btn";edit.textContent="Editar";edit.addEventListener("click",()=>editEvent(e));const cancel=document.createElement("button");cancel.type="button";cancel.className="outline-btn danger-btn";cancel.textContent=fixed?"Desativar evento fixo":"Cancelar evento";cancel.addEventListener("click",()=>fixed?deactivateFixedEvent(e):cancelEvent(e,e.data));actions.append(edit,cancel);content.append(actions)}
 card.append(dateBox,content);return card;
}
function renderUpcoming(){
 const fixedHost=$("#fixed-events"),oneoffHost=$("#oneoff-events");fixedHost.replaceChildren();oneoffHost.replaceChildren();const source=visibleEvents().filter(e=>e.ativo!==false);
 const fixed=source.filter(e=>e.tipo==="fixo").sort((a,b)=>Number(a.diaSemana??parseDate(a.dataInicio).getDay())-Number(b.diaSemana??parseDate(b.dataInicio).getDay())||(a.horarioInicio||"").localeCompare(b.horarioInicio||""));const avulsos=upcomingOccurrences().slice(0,60);
 if(!fixed.length){const empty=document.createElement("div");empty.className="admin-empty";empty.textContent="Nenhum evento fixo cadastrado para esta igreja.";fixedHost.append(empty)}else fixed.forEach(e=>fixedHost.append(makeEventCard(e,true)));
 if(!avulsos.length){const empty=document.createElement("div");empty.className="admin-empty";empty.textContent="Nenhum evento avulso futuro cadastrado para esta igreja.";oneoffHost.append(empty)}else avulsos.forEach(e=>oneoffHost.append(makeEventCard(e,false)));
}
function renderCalendar(){
 const current=new Date(),currentYear=current.getFullYear(),currentMonth=current.getMonth(),host=$("#annual-calendar");
 if(year<currentYear)year=currentYear;$("#year-label").textContent=year;$("#prev-year").disabled=year<=currentYear;host.replaceChildren();const source=visibleEvents();
 const firstMonth=year===currentYear?currentMonth:0;
 for(let month=firstMonth;month<12;month++){
  const section=document.createElement("section");section.className="month-card";const title=document.createElement("h3");title.textContent=new Date(year,month,1).toLocaleDateString("pt-BR",{month:"long"});section.append(title);
  const grid=document.createElement("div");grid.className="month-grid";["D","S","T","Q","Q","S","S"].forEach((v,i)=>{const el=document.createElement("span");el.className="weekday-head";el.textContent=v;el.title=weekdays[i];grid.append(el)});
  const first=new Date(year,month,1).getDay(),count=new Date(year,month+1,0).getDate();for(let i=0;i<first;i++){const blank=document.createElement("span");blank.className="day-empty";grid.append(blank)}
  for(let day=1;day<=count;day++){
   const date=dateISO(new Date(year,month,day,12));
   if(date<todayISO()){const blank=document.createElement("span");blank.className="day-empty";grid.append(blank);continue}
   const items=occurrencesForDate(date,source),btn=document.createElement("button");btn.type="button";btn.className="calendar-day";if(items.length)btn.classList.add("has-events");if(items.length>1)btn.classList.add("multiple-events");if(items.some(e=>e.tipo==="fixo"))btn.classList.add("has-fixed");if(items.some(e=>e.tipo!=="fixo"))btn.classList.add("has-oneoff");if(date===selectedDate)btn.classList.add("selected");btn.textContent=day;btn.title=items.length?items.map(e=>e.titulo+" — "+(units[e.unidadeId]||"Igreja")).join("\n"):"Sem eventos";btn.addEventListener("click",()=>{selectedDate=date;renderCalendar();renderDay(date)});grid.append(btn)
  }
  section.append(grid);host.append(section);
 }
}
function renderDay(date){
 $("#selected-date-title").textContent=fmtDate(date);const host=$("#day-events");host.replaceChildren();const items=occurrencesForDate(date);
 if(!items.length){const p=document.createElement("p");p.className="muted";p.textContent="Nenhum evento programado para esta data.";host.append(p);return}
 for(const e of items){const card=document.createElement("article");card.className="day-event-card";const meta=document.createElement("div");meta.className="day-event-meta";meta.textContent=(e.horarioInicio||"Horário não definido")+(e.horarioFim?" – "+e.horarioFim:"")+" • "+(e.tipo==="fixo"?"Fixo":"Avulso");const unitBadge=document.createElement("span");unitBadge.className="unit-highlight unit-"+(e.unidadeId||"sede");unitBadge.textContent=units[e.unidadeId]||"Igreja";const h=document.createElement("h3");h.textContent=e.titulo||"Evento";const desc=document.createElement("p");desc.textContent=e.descricao||"Sem descrição.";card.append(meta,h,desc,unitBadge);
  if(canEditEvent(e)){const actions=document.createElement("div");actions.className="day-event-actions";const edit=document.createElement("button");edit.type="button";edit.className="outline-btn";edit.textContent="Editar";edit.addEventListener("click",()=>editEvent(e));const cancel=document.createElement("button");cancel.type="button";cancel.className="outline-btn danger-btn";cancel.textContent=e.tipo==="fixo"?"Cancelar nesta data":"Cancelar evento";cancel.addEventListener("click",()=>cancelEvent(e,date));actions.append(edit,cancel);card.append(actions)}host.append(card)}
}
function editEvent(e){
 if(!canEditEvent(e)){alert("Você só pode alterar eventos da sua própria igreja.");return}
 $("#event-id").value=e.id;$("#event-title").value=e.titulo||"";$("#event-unit").value=e.unidadeId||"sede";$("#event-type").value=e.tipo||"avulso";$("#event-date").value=e.tipo==="fixo"?e.dataInicio:e.data;$("#event-weekday").value=String(e.diaSemana??0);$("#event-end-date").value=e.dataFim||"";$("#event-start-time").value=e.horarioInicio||"";$("#event-end-time").value=e.horarioFim||"";$("#event-description").value=e.descricao||"";$("#event-form-title").textContent="Editar evento";toggleFixedFields();$("#event-editor").scrollIntoView({behavior:"smooth",block:"start"})
}
function toggleFixedFields(){const fixed=$("#event-type").value==="fixo";document.querySelectorAll(".fixed-only").forEach(el=>el.classList.toggle("hidden",!fixed));$("#event-end-date").required=fixed}
function resetForm(){$("#event-form").reset();$("#event-id").value="";$("#event-form-title").textContent="Adicionar evento";$("#event-date").value=selectedDate&&selectedDate>=todayISO()?selectedDate:todayISO();$("#event-end-date").value="";$("#event-message").textContent="";$("#event-conflict-warning").textContent="";toggleFixedFields()}
function conflictCheck(){const date=$("#event-date").value;if(!date)return;const unit=$("#event-unit").value,existing=occurrencesForDate(date).filter(e=>e.unidadeId===unit&&e.id!==$("#event-id").value);$("#event-conflict-warning").textContent=existing.length?"Atenção: já existe(m) "+existing.length+" evento(s) nesta data para "+units[unit]+": "+existing.map(e=>e.titulo).join(", ")+". Você ainda pode salvar outro evento nesta data.":""}
async function deactivateFixedEvent(e){if(!canEditEvent(e))return;if(!confirm("Desativar o evento fixo "+e.titulo+"? Ele deixará de aparecer na programação e no calendário."))return;try{await update(ref(db,"events/"+e.id),{ativo:false,atualizadoEm:serverTimestamp(),canceladoPor:currentUser.uid})}catch(error){console.error(error);alert("Não foi possível desativar o evento. Confira as permissões do Firebase.")}}
async function cancelEvent(e,date){if(!canEditEvent(e))return;const question=e.tipo==="fixo"?"Cancelar somente esta ocorrência de "+e.titulo+" em "+fmtDate(date)+"? As outras datas continuarão programadas.":"Cancelar o evento "+e.titulo+"?";if(!confirm(question))return;try{if(e.tipo==="fixo")await update(ref(db,"events/"+e.id+"/cancelamentos"),{[date]:true});else await update(ref(db,"events/"+e.id),{ativo:false,atualizadoEm:serverTimestamp(),canceladoPor:currentUser.uid})}catch(error){console.error(error);alert("Não foi possível cancelar. Confira as permissões do Firebase.")}}
$("#event-form").addEventListener("submit",async ev=>{
 ev.preventDefault();if(!canEdit)return;const id=$("#event-id").value,type=$("#event-type").value,date=$("#event-date").value,end=$("#event-end-date").value,unit=isMaster?$("#event-unit").value:ownUnit;if(!isMaster&&(!ownUnit||$("#event-unit").value!==ownUnit)){ $("#event-message").textContent="Sua conta não está vinculada a uma igreja. Solicite ao administrador a correção do cadastro.";return}if(id&&(!events[id]||!canEditEvent(events[id]))){$("#event-message").textContent="Você não tem permissão para alterar eventos de outra igreja.";return}
 if(type==="fixo"&&(!end||end<date)){$("#event-message").textContent="Informe uma data final igual ou posterior à data inicial.";return}
 conflictCheck();const data={titulo:$("#event-title").value.trim(),descricao:$("#event-description").value.trim(),unidadeId:unit,tipo:type,horarioInicio:$("#event-start-time").value,horarioFim:$("#event-end-time").value,ativo:true,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid};
 if(type==="fixo"){data.dataInicio=date;data.dataFim=end;data.diaSemana=Number($("#event-weekday").value);data.cancelamentos=events[id]?.cancelamentos||{}}else data.data=date;
 try{if(id)await update(ref(db,"events/"+id),data);else{const newRef=push(ref(db,"events"));await set(newRef,{...data,criadoEm:serverTimestamp(),criadoPor:currentUser.uid})}selectedDate=date;resetForm();renderUpcoming();renderCalendar();renderDay(selectedDate);$("#event-message").textContent="Evento salvo com sucesso.";$("#event-message").className="message success"}catch(error){console.error(error);$("#event-message").textContent="Não foi possível salvar. Confira as regras do Realtime Database."}
});
$("#event-type").addEventListener("change",toggleFixedFields);$("#event-date").addEventListener("change",()=>{if($("#event-type").value==="fixo"&&!$("#event-id").value)$("#event-weekday").value=String(parseDate($("#event-date").value).getDay());conflictCheck()});["#event-unit","#event-title"].forEach(s=>$(s).addEventListener("change",conflictCheck));
if(!isMaster&&$("#event-unit"))$("#event-unit").addEventListener("change",()=>{$("#event-unit").value=ownUnit||""});
$("#cancel-edit-event").addEventListener("click",resetForm);document.querySelectorAll("[data-unit-filter]").forEach(button=>button.addEventListener("click",()=>{selectedUnit=button.dataset.unitFilter;document.querySelectorAll("[data-unit-filter]").forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active))});renderUpcoming();renderCalendar();if(selectedDate)renderDay(selectedDate)}));$("#prev-year").addEventListener("click",()=>{if(year>new Date().getFullYear()){year--;renderCalendar()}});$("#next-year").addEventListener("click",()=>{year++;renderCalendar()});$("#events-logout").addEventListener("click",async()=>{if(unsubscribe)unsubscribe();await signOut(auth);location.replace("index.html")});
selectedDate=todayISO();resetForm();renderDay(selectedDate);