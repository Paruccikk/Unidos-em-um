import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQIyhUybgElbY_y6WQedl_R_WmkqQoWYu0",
  authDomain: "unidos-em-um.firebaseapp.com",
  databaseURL: "https://unidos-em-um-default-rtdb.firebaseio.com",
  projectId: "unidos-em-um",
  storageBucket: "unidos-em-um.firebasestorage.app",
  messagingSenderId: "249185515638",
  appId: "1:249185515638:web:4d5d08726e059ba5f54757",
  measurementId: "G-616VYMJHTL"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);