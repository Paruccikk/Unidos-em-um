import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const memberLink = document.querySelector("#nav-member");
const adminLink = document.querySelector("#nav-admin");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (memberLink) memberLink.hidden = true;
    if (adminLink) adminLink.hidden = true;
    return;
  }

  try {
    const snapshot = await get(ref(db, "members/" + user.uid));
    const profile = snapshot.val() || {};
    const isAdmin = profile.admins === true;
    const isApprovedMember = profile.status === "aprovado" && !isAdmin;

    if (memberLink) memberLink.hidden = !isApprovedMember;
    if (adminLink) adminLink.hidden = !isAdmin;
  } catch (error) {
    console.error("Não foi possível carregar os links de navegação:", error);
    if (memberLink) memberLink.hidden = true;
    if (adminLink) adminLink.hidden = true;
  }
});
