import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {ref,get} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
const memberLink=document.querySelector("#nav-member"),adminLink=document.querySelector("#nav-admin"),eventsLink=document.querySelector("#nav-events");
onAuthStateChanged(auth,async user=>{
 if(!user){[memberLink,adminLink,eventsLink].forEach(el=>{if(el)el.hidden=true});return}
 try{const snap=await get(ref(db,"members/"+user.uid)),p=snap.val()||{},admin=p.admins===true||p.papel==="admin",approved=p.status==="aprovado"||admin;
 if(memberLink)memberLink.hidden=!approved;if(adminLink)adminLink.hidden=!admin;if(eventsLink)eventsLink.hidden=!approved;
 }catch(e){console.error(e);[memberLink,adminLink,eventsLink].forEach(el=>{if(el)el.hidden=true})}
});