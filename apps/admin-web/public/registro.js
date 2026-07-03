import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import {
  browserLocalPersistence,
  collection,
  createUserWithEmailAndPassword,
  getAuth,
  getDocs,
  getFunctions,
  getRedirectResult,
  GoogleAuthProvider,
  httpsCallable,
  initializeApp,
  initializeFirestore,
  onAuthStateChanged,
  query,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  where
} from "./firebase-sdk.js";

const TENANT_STORAGE_KEY = "agendasimple.admin.tenantId";
const SUPPORT_WHATSAPP_URL = "https://api.whatsapp.com/send?text=Hola%2C%20necesito%20ayuda%20para%20configurar%20mi%20negocio%20en%20AgendaSimple.";

const plansGrid = document.getElementById("plans-grid");
const registerForm = document.getElementById("register-form");
const signInButton = document.getElementById("sign-in-button");
const createAccountButton = document.getElementById("create-account-button");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
const sessionPill = document.getElementById("session-pill");
const businessNameInput = document.getElementById("business-name");
const displayNameInput = document.getElementById("display-name");
const tenantIdInput = document.getElementById("tenant-id");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const successCard = document.getElementById("success-card");
const successCopy = document.getElementById("success-copy");
const publicLink = document.getElementById("public-link");
const adminLink = document.getElementById("admin-link");
const urlPreview = document.getElementById("url-preview");
const supportWhatsAppLink = document.getElementById("support-whatsapp-link");

const state = {
  user: null,
  plans: [],
  selectedPlanId: "",
  loadingPlans: true,
  submitting: false,
  authBusy: false
};

const firebaseReady = isFirebaseConfigured();
const firebaseApp = firebaseReady ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true
}) : null;
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const functionsClient = firebaseApp ? getFunctions(firebaseApp, "southamerica-east1") : null;

function log(event, payload = {}) {
  console.info("[admin-register]", event, payload);
}

function sanitizeTenantId(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function setMessage(message, tone = "") {
  formMessage.textContent = message;
  formMessage.className = "form-message";

  if (tone) {
    formMessage.classList.add(`is-${tone}`);
  }
}

function rememberTenant(tenantId) {
  const sanitizedTenantId = sanitizeTenantId(tenantId);

  if (!sanitizedTenantId) {
    return;
  }

  localStorage.setItem(TENANT_STORAGE_KEY, sanitizedTenantId);
}

function explainAuthError(error) {
  const errorCode = String(error?.code || "").toLowerCase();

  if (errorCode.includes("email-already-in-use")) {
    return "Ese email ya está registrado. Si ya tenés cuenta, podés volver al ingreso principal.";
  }

  if (errorCode.includes("weak-password")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  if (errorCode.includes("popup-closed")) {
    return "Se cerró la ventana de Google antes de completar el registro.";
  }

  if (errorCode.includes("network-request-failed")) {
    return "No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.";
  }

  return "No pudimos crear la cuenta. Revisá los datos e intentá nuevamente.";
}

function explainRegisterError(error) {
  const errorCode = String(error?.code || "").toLowerCase();
  const errorMessage = String(error?.message || "").toLowerCase();

  if (errorCode.includes("already-exists") || errorMessage.includes("ya existe un negocio con ese tenantid")) {
    return "Ese enlace ya está en uso. Probá con otro nombre.";
  }

  if (errorCode.includes("invalid-argument") && errorMessage.includes("tenantid")) {
    return "La URL elegida no es válida. Usá solo letras minúsculas, números o guiones.";
  }

  if (errorCode.includes("invalid-argument")) {
    return "Revisá los datos del formulario y volvé a intentarlo.";
  }

  if (errorCode.includes("unauthenticated")) {
    return "Primero creá o vinculá tu cuenta para continuar.";
  }

  if (errorCode.includes("not-found") && errorMessage.includes("plan")) {
    return "No pudimos validar el plan elegido. Probá nuevamente.";
  }

  if (errorCode.includes("failed-precondition") && errorMessage.includes("plan")) {
    return "El plan elegido no está disponible en este momento.";
  }

  if (errorCode.includes("failed-precondition") && errorMessage.includes("perfil owner")) {
    return "Esta cuenta ya está asociada a este negocio.";
  }

  if (errorCode.includes("failed-precondition") && errorMessage.includes("email valido")) {
    return "No pudimos validar el email de la cuenta. Probá salir y volver a ingresar.";
  }

  return "No pudimos crear la agenda. Revisá los datos e intentá nuevamente.";
}

function getSelectedPlan() {
  return state.plans.find((plan) => plan.id === state.selectedPlanId) || null;
}

function resolvePanelUrl(tenantId) {
  const destination = new URL("/panel", window.location.origin);
  destination.searchParams.set("tenant", sanitizeTenantId(tenantId));
  return destination.toString();
}

function updateUrlPreview() {
  if (!urlPreview) {
    return;
  }

  const previewValue = slugify(tenantIdInput.value.trim()) || "mi-negocio";
  urlPreview.textContent = previewValue;
}

function configureSupportLink() {
  if (!supportWhatsAppLink) {
    return;
  }

  supportWhatsAppLink.href = SUPPORT_WHATSAPP_URL;
}

function updateSessionUi() {
  if (state.user?.email) {
    sessionPill.textContent = "Cuenta conectada";
    sessionPill.title = state.user.email;
    sessionPill.classList.add("is-connected");
  } else {
    sessionPill.textContent = "Sin sesión";
    sessionPill.title = "";
    sessionPill.classList.remove("is-connected");
  }

  const busy = state.authBusy || state.submitting || !firebaseReady;

  signInButton.disabled = busy;
  createAccountButton.disabled = busy;
  submitButton.disabled = !state.user || !state.selectedPlanId || state.submitting || state.authBusy;
  authEmailInput.disabled = state.authBusy;
  authPasswordInput.disabled = state.authBusy;

  if (state.user && !displayNameInput.value.trim()) {
    displayNameInput.value = state.user.displayName || "";
  }
}

function renderPlans() {
  if (state.loadingPlans) {
    plansGrid.innerHTML = `<article class="empty-state">Cargando planes...</article>`;
    return;
  }

  if (state.plans.length === 0) {
    plansGrid.innerHTML = `<article class="empty-state">No hay planes disponibles en este momento.</article>`;
    return;
  }

  plansGrid.innerHTML = state.plans.map((plan) => `
    <article class="plan-card ${plan.id === state.selectedPlanId ? "is-selected" : ""}">
      <label>
        <input type="radio" name="planId" value="${escapeHtml(plan.id)}" ${plan.id === state.selectedPlanId ? "checked" : ""}>
        <div class="plan-card__top">
          <span class="plan-chip">${escapeHtml(plan.name || plan.id)}</span>
          <strong class="plan-card__price">${escapeHtml(plan.billingLabel || `${plan.priceMonthly || 0}`)}</strong>
          <p class="plan-card__description">${escapeHtml(plan.description || "")}</p>
        </div>
        <ul class="plan-card__limits">
          <li>${escapeHtml(plan.productLabel || `${plan.maxProducts || 0} productos`)}</li>
          ${plan.trialDays ? `<li>${escapeHtml(`${plan.trialDays} días de prueba`)}</li>` : ""}
          <li>${escapeHtml(plan.employeesLabel || `Máximo de ${plan.maxEmployeesPerCategory || 0} empleados o categorías`)}</li>
        </ul>
        <ul class="plan-card__features">
          ${(Array.isArray(plan.includedFeatures) ? plan.includedFeatures : []).map((feature) => `
            <li>${escapeHtml(feature)}</li>
          `).join("")}
        </ul>
      </label>
    </article>
  `).join("");
}

async function loadPlans() {
  if (!db) {
    state.loadingPlans = false;
    renderPlans();
    setMessage("En este momento no pudimos cargar los planes. Intentá nuevamente en unos minutos.", "error");
    return;
  }

  try {
    const plansSnapshot = await getDocs(query(
      collection(db, "planes"),
      where("enabled", "==", true)
    ));

    state.plans = plansSnapshot.docs
      .map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }))
      .sort((leftPlan, rightPlan) => (
        Number(leftPlan.sortOrder || 0) - Number(rightPlan.sortOrder || 0)
      ));
    state.selectedPlanId = state.plans[0]?.id || "";
    log("plans-loaded", {
      count: state.plans.length,
      plans: state.plans.map((plan) => plan.id)
    });
  } catch (error) {
    log("plans-load-error", {
      code: error?.code || "",
      message: error?.message || ""
    });
    setMessage("No pudimos cargar los planes por ahora. Intentá nuevamente en unos minutos.", "error");
  } finally {
    state.loadingPlans = false;
    renderPlans();
    updateSessionUi();
  }
}

async function handleGoogleSignIn() {
  if (!auth) {
    setMessage("En este momento no pudimos preparar el registro. Intentá nuevamente en unos minutos.", "error");
    return;
  }

  state.authBusy = true;
  updateSessionUi();
  setMessage("Abriendo Google para conectar tu cuenta...", "warning");
  log("google-account-connect-start");

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = "es";
    await signInWithPopup(auth, provider);
  } catch (error) {
    log("google-account-connect-error", {
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
    state.authBusy = false;
    updateSessionUi();
  }
}

async function handleCreateEmailAccount() {
  if (!auth) {
    setMessage("En este momento no pudimos preparar el registro. Intentá nuevamente en unos minutos.", "error");
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    setMessage("Completá tu email y contraseña para crear la cuenta.", "error");
    return;
  }

  state.authBusy = true;
  updateSessionUi();
  setMessage("Estamos creando tu cuenta...", "warning");
  log("create-email-account-start", { email });

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    setMessage("Cuenta creada. Ahora completá los datos de tu negocio para seguir.", "success");
  } catch (error) {
    log("create-email-account-error", {
      code: error?.code || "",
      message: error?.message || "",
      email
    });
    setMessage(explainAuthError(error), "error");
  } finally {
    state.authBusy = false;
    updateSessionUi();
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!functionsClient) {
    setMessage("En este momento no pudimos preparar el registro. Intentá nuevamente en unos minutos.", "error");
    return;
  }

  const selectedPlan = getSelectedPlan();
  const businessName = businessNameInput.value.trim();
  const displayName = displayNameInput.value.trim();
  const tenantId = slugify(tenantIdInput.value.trim());

  if (!state.user) {
    setMessage("Primero creá o vinculá tu cuenta para continuar.", "error");
    return;
  }

  if (!businessName || !displayName || !tenantId || !selectedPlan) {
    setMessage("Completá los datos del negocio y elegí un plan para continuar.", "error");
    return;
  }

  state.submitting = true;
  updateSessionUi();
  setMessage("Estamos creando tu agenda...", "warning");
  log("register-tenant-start", {
    tenantId,
    planId: selectedPlan.id,
    uid: state.user.uid
  });

  try {
    const registerTenant = httpsCallable(functionsClient, "registerTenant");
    const response = await registerTenant({
      tenantId,
      businessName,
      displayName,
      planId: selectedPlan.id
    });

    const createdTenantId = response.data?.tenantId || tenantId;
    const publicUrl = `https://agendasimple-public.web.app/${createdTenantId}`;
    const adminUrl = resolvePanelUrl(createdTenantId);
    const selectedPlanName = selectedPlan.name || selectedPlan.id;

    rememberTenant(createdTenantId);
    successCopy.textContent = `Tu negocio quedó configurado con el plan ${selectedPlanName}. Ya podés compartir tu enlace y empezar a organizar reservas.`;
    publicLink.href = publicUrl;
    adminLink.href = adminUrl;
    successCard.hidden = false;
    setMessage("Tu agenda fue creada correctamente.", "success");
    log("register-tenant-success", {
      tenantId: createdTenantId,
      publicUrl,
      adminUrl
    });
  } catch (error) {
    log("register-tenant-error", {
      code: error?.code || "",
      message: error?.message || ""
    });
    setMessage(explainRegisterError(error), "error");
  } finally {
    state.submitting = false;
    updateSessionUi();
  }
}

function handlePlanSelection(event) {
  const radio = event.target.closest("input[name=\"planId\"]");

  if (!radio) {
    return;
  }

  state.selectedPlanId = radio.value;
  renderPlans();
  updateSessionUi();
}

function handleBusinessNameInput() {
  if (!tenantIdInput.value.trim()) {
    tenantIdInput.value = slugify(businessNameInput.value);
  }

  updateUrlPreview();
}

async function bootstrap() {
  log("bootstrap-start", {
    firebaseReady,
    pathname: window.location.pathname
  });

  configureSupportLink();
  updateUrlPreview();

  if (!firebaseReady) {
    setMessage("En este momento no pudimos preparar el registro. Intentá nuevamente en unos minutos.", "error");
    signInButton.disabled = true;
    createAccountButton.disabled = true;
    submitButton.disabled = true;
    state.loadingPlans = false;
    renderPlans();
    return;
  }

  tenantIdInput.value = sanitizeTenantId(localStorage.getItem(TENANT_STORAGE_KEY));
  updateUrlPreview();
  await setPersistence(auth, browserLocalPersistence);

  try {
    const redirectResult = await getRedirectResult(auth);

    if (redirectResult?.user) {
      log("google-redirect-result", {
        uid: redirectResult.user.uid,
        email: redirectResult.user.email || ""
      });
      setMessage("Cuenta conectada. Ahora completá los datos de tu negocio para seguir.", "success");
    }
  } catch (error) {
    log("google-redirect-error", {
      code: error?.code || "",
      message: error?.message || ""
    });
    setMessage(explainAuthError(error), "error");
  }

  onAuthStateChanged(auth, (user) => {
    state.user = user;
    log("auth-state-changed", {
      uid: user?.uid || "",
      email: user?.email || ""
    });

    if (user && !displayNameInput.value.trim()) {
      displayNameInput.value = user.displayName || "";
    }

    updateSessionUi();
  });

  registerForm.addEventListener("submit", handleSubmit);
  signInButton.addEventListener("click", handleGoogleSignIn);
  createAccountButton.addEventListener("click", handleCreateEmailAccount);
  plansGrid.addEventListener("change", handlePlanSelection);
  businessNameInput.addEventListener("input", handleBusinessNameInput);
  tenantIdInput.addEventListener("input", () => {
    tenantIdInput.value = slugify(tenantIdInput.value);
    rememberTenant(tenantIdInput.value);
    updateUrlPreview();
  });
  tenantIdInput.addEventListener("blur", () => {
    tenantIdInput.value = slugify(tenantIdInput.value);
    rememberTenant(tenantIdInput.value);
    updateUrlPreview();
  });

  await loadPlans();
}

bootstrap();
