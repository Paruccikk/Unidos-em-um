import {ref,get} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Administração Master centralizada.
 * Para conceder Master a uma única conta, cadastre o UID dela em:
 * Realtime Database > masterAdmins > UID_DA_CONTA = true.
 * O cliente só consulta essa lista; não pode conceder esse privilégio.
 */
export async function isMasterAdmin(user,db){
 if(!user?.uid)return false;
 const snapshot=await get(ref(db,"masterAdmins/"+user.uid));
 return snapshot.val()===true;
}
