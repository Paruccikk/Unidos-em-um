import { auth } from "./firebase.js";
import {
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (selector) => document.querySelector(selector);
const requestForm = $("#request-form");
const passwordForm = $("#new-password-form");
const message = $("#reset-message");
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
const actionCode = params.get("oobCode");

function showMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle("success", success);
}

function showPasswordForm() {
  requestForm.classList.add("hidden");
  passwordForm.classList.remove("hidden");
  $("#reset-title").textContent = "Criar nova senha";
  $("#reset-description").textContent = "Escolha uma nova senha para acessar sua conta.";
}

if (mode === "resetPassword" && actionCode) {
  try {
    await verifyPasswordResetCode(auth, actionCode);
    showPasswordForm();
  } catch (error) {
    console.error(error);
    requestForm.classList.add("hidden");
    showMessage("Este link de recuperação é inválido ou expirou. Solicite um novo link na página de login.");
  }
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = requestForm.querySelector("button");
  button.disabled = true;
  showMessage("Enviando e-mail...", true);
  try {
    const email = $("#reset-email").value.trim();
    await sendPasswordResetEmail(auth, email);
    showMessage("Se existir uma conta vinculada a esse e-mail, você receberá as instruções de recuperação. Verifique também a caixa de spam.", true);
    requestForm.reset();
  } catch (error) {
    console.error(error);
    const messages = {
      "auth/invalid-email": "Informe um endereço de e-mail válido.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
      "auth/unauthorized-continue-uri": "O endereço do site não está autorizado nas configurações do Firebase.",
      "auth/operation-not-allowed": "A recuperação por e-mail não está habilitada no Firebase."
    };
    showMessage(messages[error.code] || "Não foi possível enviar o e-mail. Confira o endereço e tente novamente.");
  } finally {
    button.disabled = false;
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = passwordForm.querySelector("button");
  const password = $("#new-password").value;
  const confirmation = $("#confirm-password").value;
  if (password.length < 6) {
    showMessage("A senha precisa ter pelo menos 6 caracteres.");
    return;
  }
  if (password !== confirmation) {
    showMessage("As senhas não coincidem.");
    return;
  }
  button.disabled = true;
  showMessage("Salvando nova senha...", true);
  try {
    await confirmPasswordReset(auth, actionCode, password);
    passwordForm.reset();
    showMessage("Senha alterada com sucesso! Você já pode entrar com sua nova senha.", true);
    passwordForm.classList.add("hidden");
    $("#reset-title").textContent = "Senha atualizada";
    $("#reset-description").textContent = "Sua senha foi alterada. Volte ao login para acessar sua conta.";
  } catch (error) {
    console.error(error);
    const messages = {
      "auth/expired-action-code": "Este link expirou. Solicite uma nova recuperação de senha.",
      "auth/invalid-action-code": "Este link já foi utilizado ou não é válido. Solicite um novo link.",
      "auth/weak-password": "Escolha uma senha mais forte, com pelo menos 6 caracteres."
    };
    showMessage(messages[error.code] || "Não foi possível alterar a senha. Solicite um novo link e tente novamente.");
  } finally {
    button.disabled = false;
  }
});