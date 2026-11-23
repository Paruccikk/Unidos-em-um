import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  set,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const msg = document.querySelector("#auth-message");

const showMessage = (text, error = true) => {
  msg.textContent = text;
  msg.className = "message" + (error ? "" : " success");
};

onAuthStateChanged(auth, (user) => {
  if (user) location.replace("painel.html");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = loginForm.querySelector("button");
  button.disabled = true;
  showMessage("Entrando...", false);

  try {
    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;

    await signInWithEmailAndPassword(auth, email, password);
    location.replace("painel.html");
  } catch (error) {
    console.error("[Unidos em Um] Erro no login:", error.code, error.message);
    showMessage(errorText(error));
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#show-signup").addEventListener("click", () => {
  signupForm.classList.toggle("hidden");
  showMessage("");
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = signupForm.querySelector("button");
  button.disabled = true;
  showMessage("Criando sua conta...", false);

  let accountCreated = false;

  try {
    const name = document.querySelector("#new-name").value.trim();
    const email = document.querySelector("#new-email").value.trim();
    const password = document.querySelector("#new-password").value;

    if (!name) {
      throw new Error("Informe seu nome para continuar.");
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    accountCreated = true;

    await set(ref(db, "members/" + credential.user.uid), {
      nome: name,
      email: credential.user.email,
      cargo: "Membro",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    location.replace("painel.html");
  } catch (error) {
    console.error("[Unidos em Um] Erro no cadastro:", {
      code: error.code || "sem-codigo",
      message: error.message,
      accountCreated
    });

    if (accountCreated) {
      showMessage(
        "Sua conta foi criada no Authentication, mas não foi possível salvar seu perfil no banco de dados. Entre em contato com a secretaria. Código: " +
        (error.code || "erro-ao-salvar-perfil")
      );
    } else {
      showMessage(errorText(error));
    }
  } finally {
    button.disabled = false;
  }
});

function errorText(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail já possui uma conta. Tente entrar em vez de criar outra.",
    "auth/invalid-email": "O endereço de e-mail informado é inválido.",
    "auth/weak-password": "A senha não atende aos requisitos mínimos do Firebase.",
    "auth/password-does-not-meet-requirements": "A senha não atende à política de segurança configurada no Firebase.",
    "auth/operation-not-allowed": "O cadastro por e-mail e senha está desabilitado no Firebase Authentication.",
    "auth/admin-restricted-operation": "Esta operação de cadastro está restrita nas configurações do Firebase.",
    "auth/unauthorized-domain": "Este domínio não está autorizado no Firebase Authentication. Adicione o domínio do site em Authorized domains.",
    "auth/invalid-api-key": "A chave de API do Firebase é inválida. Confira a configuração do projeto.",
    "auth/api-key-not-valid": "A chave de API não foi aceita pelo Firebase. Confira as restrições da chave no Google Cloud.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet e tente novamente.",
    "auth/invalid-credential": "As credenciais informadas são inválidas."
  };

  const code = error.code || "";
  const friendly = messages[code];

  if (friendly) return friendly + " (" + code + ")";

  return "O Firebase recusou a operação. Código: " +
    (code || "não informado") +
    ". Detalhe: " +
    (error.message || "sem descrição");
}
