import { firebaseConfig, firebaseRuntime, isFirebaseConfigured } from "../firebase-config.js";
import {
  browserLocalPersistence,
  collection,
  getAuth,
  getDocs,
  getFunctions,
  GoogleAuthProvider,
  httpsCallable,
  initializeApp,
  initializeFirestore,
  onAuthStateChanged,
  query,
  setPersistence,
  signInWithPopup,
  where
} from "../firebase-sdk.js";

const plansGrid = document.getElementById("plans-grid");
const registerForm = document.getElementById("register-form");
const signInButton = document.getElementById("sign-in-button");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
const sessionPill = document.getElementById("session-pill");
const businessNameInput = document.getElementById("business-name");
const displayNameInput = document.getElementById("display-name");
const tenantIdInput = document.getElementById("tenant-id");
const successCard = document.getElementById("success-card");
const successCopy = document.getElementById("success-copy");
const publicLink = document.getElementById("public-link");
const adminLink = document.getElementById("admin-link");

const state = {
  user: null,
  plans: [],
  selectedPlanId: "",
  loadingPlans: true,
  submitting: false
};

const firebaseReady = isFirebaseConfigured();
const firebaseApp = firebaseReady ? initializeApp(firebaseConfig) : null;
const db = firebaseApp ? initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true
}) : null;
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const functionsClient = firebaseApp ? getFunctions(firebaseApp, firebaseRuntime.functionsRegion) : null;

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

function getSelectedPlan() {
  return state.plans.find((plan) => plan.id === state.selectedPlanId) || null;
}

function renderPlans() {
  if (state.loadingPlans) {
    plansGrid.innerHTML = `<article class="empty-state">Cargando planes...</article>`;
    return;
  }

  if (state.plans.length === 0) {
    plansGrid.innerHTML = `<article class="empty-state">No hay planes habilitados en este momento.</article>`;
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
          ${plan.trialDays ? `<li>${escapeHtml(`${plan.trialDays} dias de prueba`)}</li>` : ""}
          <li>${escapeHtml(plan.employeesLabel || `Maximo de ${plan.maxEmployeesPerCategory || 0} empleados/categorias`)}</li>
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

function updateSessionUi() {
  if (state.user) {
    sessionPill.textContent = state.user.email || "Sesion iniciada";
    signInButton.textContent = "Cuenta conectada";
    signInButton.disabled = true;

    if (!displayNameInput.value.trim()) {
      displayNameInput.value = state.user.displayName || "";
    }
  } else {
    sessionPill.textContent = "Sin sesion";
    signInButton.textContent = "Entrar con Google";
    signInButton.disabled = !firebaseReady;
  }

  submitButton.disabled = !state.user || !state.selectedPlanId || state.submitting;
}

function buildAdminUrl(tenantId) {
  const currentUrl = new URL(window.location.href);

  if (currentUrl.hostname === "rockeala.web.app") {
    return `https://rockeala-admin.web.app/${tenantId}`;
  }

  if (currentUrl.hostname === "rockeala.firebaseapp.com") {
    return `https://rockeala-admin.web.app/${tenantId}`;
  }

  return `${currentUrl.protocol}//admin.${currentUrl.host}/${tenantId}`;
}

async function loadPlans() {
  if (!db) {
    state.loadingPlans = false;
    renderPlans();
    setMessage("Firebase no esta configurado para cargar planes.", "error");
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
  } catch (error) {
    setMessage("No pudimos cargar los planes desde Firebase.", "error");
  } finally {
    state.loadingPlans = false;
    renderPlans();
    updateSessionUi();
  }
}

async function handleSignIn() {
  if (!auth) {
    setMessage("Firebase Auth no esta disponible.", "error");
    return;
  }

  signInButton.disabled = true;
  setMessage("Abriendo Google para iniciar sesion...");

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = "es";
    await signInWithPopup(auth, provider);
    setMessage("Cuenta conectada. Ya puedes crear tu negocio.", "success");
  } catch (error) {
    setMessage("No se pudo iniciar sesion con Google.", "error");
  } finally {
    updateSessionUi();
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!functionsClient) {
    setMessage("Cloud Functions no esta disponible.", "error");
    return;
  }

  const selectedPlan = getSelectedPlan();
  const businessName = businessNameInput.value.trim();
  const displayName = displayNameInput.value.trim();
  const tenantId = slugify(tenantIdInput.value.trim());

  if (!state.user) {
    setMessage("Primero inicia sesion con Google.", "error");
    return;
  }

  if (!businessName || !displayName || !tenantId || !selectedPlan) {
    setMessage("Completa todos los datos y selecciona un plan.", "error");
    return;
  }

  state.submitting = true;
  updateSessionUi();
  setMessage("Creando negocio en produccion...");

  try {
    const registerTenant = httpsCallable(functionsClient, "registerTenant");
    const response = await registerTenant({
      tenantId,
      businessName,
      displayName,
      planId: selectedPlan.id
    });

    const createdTenantId = response.data?.tenantId || tenantId;
    const publicUrl = `${window.location.origin}/${createdTenantId}`;
    const adminUrl = buildAdminUrl(createdTenantId);

    successCopy.textContent = `Se creo el tenant ${createdTenantId} con el plan ${selectedPlan.name || selectedPlan.id}.`;
    publicLink.href = publicUrl;
    adminLink.href = adminUrl;
    successCard.hidden = false;
    setMessage("Negocio creado correctamente.", "success");
  } catch (error) {
    setMessage(error.message || "No se pudo crear el negocio.", "error");
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
}

async function bootstrap() {
  if (!firebaseReady) {
    setMessage("La configuracion de Firebase no esta lista en esta pagina.", "error");
    signInButton.disabled = true;
    submitButton.disabled = true;
    state.loadingPlans = false;
    renderPlans();
    return;
  }

  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, (user) => {
    state.user = user;
    updateSessionUi();
  });

  registerForm.addEventListener("submit", handleSubmit);
  signInButton.addEventListener("click", handleSignIn);
  plansGrid.addEventListener("change", handlePlanSelection);
  businessNameInput.addEventListener("input", handleBusinessNameInput);
  tenantIdInput.addEventListener("blur", () => {
    tenantIdInput.value = slugify(tenantIdInput.value);
  });

  await loadPlans();
}

bootstrap();
