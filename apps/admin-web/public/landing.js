import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  httpsCallable,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect
} from "./firebase-sdk.js";
import { auth, firebaseReady, functions } from "./firebase-client.js";

const TENANT_STORAGE_KEY = "agendasimple.admin.tenantId";
const sessionPill = document.getElementById("session-pill");
const formMessage = document.getElementById("form-message");
const emailLoginForm = document.getElementById("email-login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const googleSignInButton = document.getElementById("google-sign-in-button");
const emailLoginButton = document.getElementById("email-login-button");
const openPanelLink = document.getElementById("open-panel-link");
const businessAccess = document.getElementById("business-access");
const businessAccessEyebrow = document.getElementById("business-access-eyebrow");
const businessAccessTitle = document.getElementById("business-access-title");
const businessAccessCopy = document.getElementById("business-access-copy");
const businessAccessList = document.getElementById("business-access-list");

const state = {
  user: null,
  busy: false,
  redirecting: false,
  resolvingBusinesses: false,
  businesses: []
};

const resolveAccessibleBusinesses = functions
  ? httpsCallable(functions, "resolveAccessibleBusinesses")
  : null;

function log(event, payload = {}) {
  console.info("[admin-landing]", event, payload);
}

function sanitizeTenantId(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function rememberBusiness(tenantId) {
  const sanitizedTenantId = sanitizeTenantId(tenantId);

  if (!sanitizedTenantId) {
    return;
  }

  localStorage.setItem(TENANT_STORAGE_KEY, sanitizedTenantId);
}

function getRememberedBusiness() {
  return sanitizeTenantId(localStorage.getItem(TENANT_STORAGE_KEY));
}

function resolvePanelUrl(tenantId) {
  const destination = new URL("/panel", window.location.origin);
  destination.searchParams.set("tenant", sanitizeTenantId(tenantId));
  return destination.toString();
}

function setMessage(message, tone = "") {
  formMessage.textContent = message;
  formMessage.className = "form-message";

  if (tone) {
    formMessage.classList.add(`is-${tone}`);
  }
}

function explainAuthError(error) {
  const errorCode = String(error?.code || "").toLowerCase();

  if (errorCode.includes("invalid-credential") || errorCode.includes("wrong-password")) {
    return "Email o contraseña incorrectos.";
  }

  if (errorCode.includes("user-not-found")) {
    return "No encontramos una cuenta con ese email.";
  }

  if (errorCode.includes("popup-closed")) {
    return "Se cerró la ventana de Google antes de completar el ingreso.";
  }

  if (errorCode.includes("too-many-requests")) {
    return "Hay demasiados intentos. Esperá un momento y volvé a probar.";
  }

  if (errorCode.includes("network-request-failed")) {
    return "No pudimos iniciar sesión. Revisá tu conexión e intentá nuevamente.";
  }

  return "No pudimos iniciar sesión. Revisá tus datos e intentá nuevamente.";
}

function explainBusinessResolveError(error) {
  const errorCode = String(error?.code || "").toLowerCase();

  if (errorCode.includes("unauthenticated")) {
    return "Necesitamos confirmar tu cuenta antes de continuar.";
  }

  return "No pudimos identificar tu negocio. Si el problema continúa, contactá soporte.";
}

function updateOpenPanelLink() {
  const rememberedBusiness = getRememberedBusiness();
  openPanelLink.href = rememberedBusiness ? resolvePanelUrl(rememberedBusiness) : "/panel";
}

function renderBusinessAccess() {
  if (!businessAccess || !businessAccessList) {
    return;
  }

  if (!state.user) {
    businessAccess.hidden = true;
    businessAccessList.innerHTML = "";
    return;
  }

  if (state.resolvingBusinesses) {
    businessAccess.hidden = false;
    businessAccessEyebrow.textContent = "Preparando ingreso";
    businessAccessTitle.textContent = "Estamos identificando tu negocio";
    businessAccessCopy.textContent = "En unos segundos te llevamos al panel correcto.";
    businessAccessList.innerHTML = "";
    return;
  }

  if (state.businesses.length === 0) {
    businessAccess.hidden = false;
    businessAccessEyebrow.textContent = "Sin negocio asociado";
    businessAccessTitle.textContent = "No encontramos un negocio asociado a esta cuenta.";
    businessAccessCopy.textContent = "Si todavía no creaste tu agenda, podés hacerlo ahora mismo.";
    businessAccessList.innerHTML = `
      <a class="button button-primary" href="/registro">Crear mi agenda</a>
    `;
    return;
  }

  if (state.businesses.length === 1) {
    businessAccess.hidden = true;
    businessAccessList.innerHTML = "";
    return;
  }

  businessAccess.hidden = false;
  businessAccessEyebrow.textContent = "Elegí tu negocio";
  businessAccessTitle.textContent = "Seleccioná el negocio al que querés ingresar";
  businessAccessCopy.textContent = "Tu cuenta está asociada a más de un negocio. Elegí dónde querés continuar.";
  businessAccessList.innerHTML = state.businesses.map((business) => `
    <button
      class="business-choice"
      type="button"
      data-business-id="${business.tenantId}"
    >
      <strong>${business.businessName}</strong>
      <span>${business.membershipLabel}${business.adminName ? ` · ${business.adminName}` : ""}</span>
    </button>
  `).join("");
}

function updateUi() {
  if (state.user?.email) {
    sessionPill.textContent = "Cuenta conectada";
    sessionPill.title = state.user.email;
    sessionPill.classList.add("is-connected");
  } else {
    sessionPill.textContent = "Sin sesión";
    sessionPill.title = "";
    sessionPill.classList.remove("is-connected");
  }

  const disabled = !firebaseReady || state.busy || state.resolvingBusinesses;

  emailLoginButton.disabled = disabled;
  googleSignInButton.disabled = disabled;
  emailInput.disabled = disabled;
  passwordInput.disabled = disabled;
  updateOpenPanelLink();
  renderBusinessAccess();
}

async function redirectToPanel(tenantId, trigger) {
  const resolvedBusinessId = sanitizeTenantId(tenantId);

  if (!resolvedBusinessId || !state.user || state.redirecting) {
    return;
  }

  state.redirecting = true;
  rememberBusiness(resolvedBusinessId);
  updateOpenPanelLink();
  log("redirect-to-panel", {
    trigger,
    tenantId: resolvedBusinessId,
    uid: state.user.uid,
    email: state.user.email || ""
  });
  window.location.assign(resolvePanelUrl(resolvedBusinessId));
}

async function resolveBusinessesAndContinue(trigger) {
  if (!state.user || !resolveAccessibleBusinesses) {
    return;
  }

  state.resolvingBusinesses = true;
  updateUi();
  setMessage("Estamos identificando tu negocio...", "warning");

  try {
    const response = await resolveAccessibleBusinesses();
    state.businesses = Array.isArray(response.data?.businesses) ? response.data.businesses : [];
    log("businesses-resolved", {
      trigger,
      count: state.businesses.length,
      businesses: state.businesses.map((business) => business.tenantId)
    });

    if (state.businesses.length === 1) {
      setMessage("Cuenta encontrada. Te estamos llevando al panel...", "success");
      await redirectToPanel(state.businesses[0].tenantId, `${trigger}-single-business`);
      return;
    }

    if (state.businesses.length > 1) {
      setMessage("Seleccioná el negocio al que querés ingresar.", "warning");
      return;
    }

    setMessage("No encontramos un negocio asociado a esta cuenta.", "warning");
  } catch (error) {
    log("business-resolve-error", {
      trigger,
      code: error?.code || "",
      message: error?.message || ""
    });
    state.businesses = [];
    setMessage(explainBusinessResolveError(error), "error");
  } finally {
    state.resolvingBusinesses = false;
    updateUi();
  }
}

async function handleGoogleSignIn() {
  if (!firebaseReady || !auth) {
    setMessage("No pudimos preparar el ingreso en este momento. Intentá nuevamente más tarde.", "error");
    return;
  }

  state.busy = true;
  updateUi();
  setMessage("Abriendo Google para iniciar sesión...", "warning");
  log("google-sign-in-start");

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = "es";
    await signInWithPopup(auth, provider);
    log("google-sign-in-popup-success");
  } catch (error) {
    log("google-sign-in-error", {
      code: error?.code || "",
      message: error?.message || ""
    });

    if (String(error?.code || "").toLowerCase().includes("popup-blocked")) {
      setMessage("El navegador bloqueó la ventana emergente. Te redirigimos para continuar con Google...", "warning");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithRedirect(auth, provider);
      return;
    }

    setMessage(explainAuthError(error), "error");
  } finally {
    state.busy = false;
    updateUi();
  }
}

async function handleEmailLogin(event) {
  event.preventDefault();

  if (!firebaseReady || !auth) {
    setMessage("No pudimos preparar el ingreso en este momento. Intentá nuevamente más tarde.", "error");
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setMessage("Completá tu email y contraseña para entrar.", "error");
    return;
  }

  state.busy = true;
  updateUi();
  setMessage("Iniciando sesión...", "warning");
  log("email-sign-in-start", { email });

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setMessage("Sesión iniciada. Estamos preparando tu acceso...", "success");
  } catch (error) {
    log("email-sign-in-error", {
      code: error?.code || "",
      message: error?.message || "",
      email
    });
    setMessage(explainAuthError(error), "error");
  } finally {
    state.busy = false;
    updateUi();
  }
}

function handleBusinessAccessClick(event) {
  const button = event.target.closest("[data-business-id]");

  if (!button) {
    return;
  }

  const businessId = sanitizeTenantId(button.dataset.businessId);

  if (!businessId) {
    return;
  }

  setMessage("Te estamos llevando al panel...", "success");
  redirectToPanel(businessId, "business-picker");
}

async function bootstrap() {
  log("bootstrap-start", {
    firebaseReady,
    pathname: window.location.pathname,
    search: window.location.search
  });

  updateOpenPanelLink();

  if (!firebaseReady || !auth || !resolveAccessibleBusinesses) {
    setMessage("No pudimos preparar el ingreso en este momento. Intentá nuevamente más tarde.", "error");
    updateUi();
    return;
  }

  await setPersistence(auth, browserLocalPersistence);

  try {
    const redirectResult = await getRedirectResult(auth);

    if (redirectResult?.user) {
      log("google-redirect-result", {
        uid: redirectResult.user.uid,
        email: redirectResult.user.email || ""
      });
      setMessage("Cuenta conectada. Estamos preparando tu acceso...", "success");
    }
  } catch (error) {
    log("google-redirect-error", {
      code: error?.code || "",
      message: error?.message || ""
    });
    setMessage(explainAuthError(error), "error");
  }

  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.redirecting = false;
    state.businesses = [];
    log("auth-state-changed", {
      uid: user?.uid || "",
      email: user?.email || ""
    });
    updateUi();

    if (!user) {
      return;
    }

    await resolveBusinessesAndContinue("auth-state");
  });

  emailLoginForm.addEventListener("submit", handleEmailLogin);
  googleSignInButton.addEventListener("click", handleGoogleSignIn);
  businessAccess.addEventListener("click", handleBusinessAccessClick);
}

bootstrap();
