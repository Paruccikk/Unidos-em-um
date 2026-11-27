import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const memberLink=document.querySelector("#nav-member");
const adminLink=document.querySelector("#nav-admin");
const eventsLink=document.querySelector("#nav-events");
const topbar=document.querySelector(".topbar");
const mainNav=document.querySelector(".main-nav");

if(topbar&&mainNav){
 document.body.classList.add("has-sidebar");
 const sidebar=document.createElement("aside");
 sidebar.className="app-sidebar";
 sidebar.setAttribute("aria-label","Menu principal");
 const brand=document.querySelector(".brand-small")?.cloneNode(true);
 if(brand){
  brand.className="sidebar-brand";
  brand.querySelectorAll("[id]").forEach(el=>el.removeAttribute("id"));
  sidebar.append(brand);
 }
 const caption=document.createElement("p");
 caption.className="sidebar-caption";
 caption.textContent="NAVEGAÇÃO";
 sidebar.append(caption);
 const sideNav=document.createElement("nav");
 sideNav.className="sidebar-nav";
 sideNav.setAttribute("aria-label","Menu lateral");
 [...mainNav.querySelectorAll("a")].forEach(link=>sideNav.append(link));
 sidebar.append(sideNav);
 const footer=document.createElement("div");
 footer.className="sidebar-footer";
 footer.textContent="IGREJA PENTECOSTAL UNIDOS EM UM";
 sidebar.append(footer);
 document.body.append(sidebar);
 const backdrop=document.createElement("button");
 backdrop.type="button";
 backdrop.className="sidebar-backdrop";
 backdrop.setAttribute("aria-label","Fechar menu");
 document.body.append(backdrop);
 const toggle=document.createElement("button");
 toggle.type="button";
 toggle.className="menu-toggle";
 toggle.setAttribute("aria-label","Abrir menu");
 toggle.setAttribute("aria-expanded","false");
 toggle.innerHTML="☰";
 topbar.prepend(toggle);
 const closeMenu=()=>{document.body.classList.remove("sidebar-open");toggle.setAttribute("aria-expanded","false");toggle.innerHTML="☰"};
 toggle.addEventListener("click",()=>{const open=document.body.classList.toggle("sidebar-open");toggle.setAttribute("aria-expanded",String(open));toggle.innerHTML=open?"✕":"☰"});
 backdrop.addEventListener("click",closeMenu);
 sideNav.addEventListener("click",event=>{if(event.target.closest("a"))closeMenu()});
 document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMenu()});
}

onAuthStateChanged(auth,async user=>{
 if(!user){[memberLink,adminLink,eventsLink].forEach(el=>{if(el)el.hidden=true});return}
 try{
  const snap=await get(ref(db,"members/"+user.uid));
  const p=snap.val()||{};
  const admin=p.admins===true||p.papel==="admin";
  const approved=p.status==="aprovado"||admin;
  if(memberLink)memberLink.hidden=!approved;
  if(adminLink)adminLink.hidden=!admin;
  if(eventsLink)eventsLink.hidden=!approved;
 }catch(e){
  console.error(e);
  [memberLink,adminLink,eventsLink].forEach(el=>{if(el)el.hidden=true});
 }
});