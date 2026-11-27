import {ref,get} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// O nível Master é definido exclusivamente em members/{uid}/admMaster.
export async function isMasterAdmin(user,db){
 if(!user?.uid)return false;
 const snapshot=await get(ref(db,"members/"+user.uid+"/admMaster"));
 return snapshot.val()===true;
}
