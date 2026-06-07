import {
  addDoc,
  arrayUnion,
  browserLocalPersistence,
  collection,
  doc,
  getDoc,
  getDownloadURL,
  GoogleAuthProvider,
  limit,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  ref,
  serverTimestamp,
  setDoc,
  setPersistence,
  signInWithPopup,
  signOut,
  updateDoc,
  uploadBytes,
  where
} from "./firebase-sdk.js";
import { auth, db, firebaseReady, storage } from "./firebase-client.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "Resumen" },
  { id: "turnos", label: "Turnos" },
  { id: "servicios", label: "Servicios" },
  { id: "clientes", label: "Clientes" },
  { id: "stock", label: "Stock" },
  { id: "productos", label: "Productos" },
  { id: "pagos", label: "Pagos" }
];

const state = {
  user: null,
  profile: null,
  authResolved: false,
  services: [],
  appointments: [],
  clients: [],
  stock: [],
  products: [],
  unsubscribers: [],
  subscribedAdminId: null,
  activeView: resolveInitialView(),
  uploadingProfile: false,
  authBusy: false,
  editor: {
    serviceId: "",
    clientId: "",
    stockId: "",
    productId: "",
    clientProfile: createEmptyClientProfile()
  },
  messages: {
    auth: createEmptyMessage(),
    profile: createEmptyMessage(),
    service: createEmptyMessage(),
    client: createEmptyMessage(),
    stock: createEmptyMessage(),
    product: createEmptyMessage()
  }
};

const topBanner = document.getElementById("top-banner");
const sessionPanel = document.querySelector(".session-panel");
const sessionBrand = document.querySelector(".session-brand");
const profileCluster = document.querySelector(".profile-cluster");
const sessionActions = document.querySelector(".session-actions");
const bannerAside = document.querySelector(".banner-aside");
const sectionNav = document.getElementById("section-nav");
const guestBanner = document.getElementById("guest-banner");
const sessionAuthButton = document.getElementById("session-auth-button");
const authMessage = document.getElementById("auth-message");
const profileMessage = document.getElementById("profile-message");
const sessionHelper = document.getElementById("session-helper");
const profileImage = document.getElementById("profile-image");
const profileUploadTrigger = document.getElementById("profile-upload-trigger");
const profileUploadInput = document.getElementById("profile-upload-input");
const contentShell = document.querySelector(".content-shell");
const privateShell = document.getElementById("private-shell");
const viewRoot = document.getElementById("view-root");

function createEmptyMessage() {
  return { text: "", tone: "" };
}

function createEmptyClientProfile() {
  return {
    colorActual: "",
    ultimoTratamiento: "",
    cambioColor: "",
    volumenAguaOxigenada: "",
    mechas: false,
    tratamientosConFormol: false
  };
}

function resolveInitialView() {
  const hashView = String(window.location.hash || "").replace("#", "").trim();
  return NAV_ITEMS.some((item) => item.id === hashView) ? hashView : "dashboard";
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

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDateTime(rawValue) {
  if (!rawValue) {
    return "Sin fecha";
  }

  const dateValue = rawValue?.toDate ? rawValue.toDate() : new Date(rawValue);

  if (Number.isNaN(dateValue.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(dateValue);
}

function formatDateOnly(rawValue) {
  if (!rawValue) {
    return "";
  }

  const dateValue = rawValue?.toDate ? rawValue.toDate() : new Date(rawValue);

  if (Number.isNaN(dateValue.getTime())) {
    return "";
  }

  return dateValue.toISOString().slice(0, 10);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function resolveArea(profile) {
  const rawArea = String(profile?.publicArea || profile?.area || "Servicios").toLowerCase();

  if (rawArea.includes("mani")) {
    return "Manicura";
  }

  if (rawArea.includes("depi")) {
    return "Depilacion";
  }

  if (rawArea.includes("pelu")) {
    return "Peluqueria";
  }

  return profile?.area || "Servicios";
}

function resolveAdminName() {
  return state.profile?.displayName || state.profile?.businessName || state.user?.displayName || "Admin Rockeala";
}

function resolveBusinessName() {
  return state.profile?.businessName || resolveAdminName();
}

function isNataliaBusiness(profile) {
  const fingerprint = [
    profile?.displayName,
    profile?.businessName,
    profile?.area,
    profile?.slug,
    profile?.code
  ].join(" ").toLowerCase();

  return fingerprint.includes("natalia");
}

function hasPanelAccess() {
  return Boolean(state.user && state.profile && state.profile.active === true);
}

function resolveSessionHelperText() {
  if (!firebaseReady) {
    return "El panel todavia no esta listo. Avisale al equipo de Rockeala.";
  }

  if (!state.authResolved) {
    return "Revisando tu sesion...";
  }

  if (state.profile) {
    return `${resolveBusinessName()} - ${resolveArea(state.profile)}.`;
  }

  if (state.user) {
    return "Tu acceso esta en revision.";
  }

  return "Inicia sesion con Google para administrar tu negocio.";
}

function translateAppointmentStatus(status) {
  const statuses = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    completed: "Completado",
    cancelled: "Cancelado"
  };

  return statuses[status] || status || "Sin estado";
}

function translateAppointmentSource(source) {
  const sources = {
    panel: "Panel",
    public: "Web",
    web: "Web"
  };

  return sources[source] || source || "Sin origen";
}

function createAvatarPlaceholder(name) {
  const rawName = String(name || "RA").trim();
  const initials = rawName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0].toUpperCase())
    .join("") || "RA";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="avatarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1f7a68" />
          <stop offset="100%" stop-color="#102725" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="120" fill="url(#avatarGradient)" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Space Grotesk, Arial, sans-serif" font-size="84" font-weight="700">${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveProfileImage() {
  return state.profile?.photoUrl || state.user?.photoURL || createAvatarPlaceholder(resolveAdminName());
}

function getViewElement(id) {
  return viewRoot.querySelector(`#${id}`);
}

function applyMessageToElement(element, message) {
  if (!element) {
    return;
  }

  element.textContent = message?.text || "";
  element.className = "status-message";

  if (message?.tone) {
    element.classList.add(`is-${message.tone}`);
  }
}

function setScopedMessage(scope, text = "", tone = "") {
  state.messages[scope] = { text, tone };

  if (scope === "auth" || scope === "profile") {
    renderBannerState();

    if (!hasPanelAccess()) {
      renderActiveView();
    }

    return;
  }

  refreshCurrentViewMessages();
}

function clearScopedMessage(scope) {
  setScopedMessage(scope, "", "");
}

function syncBannerOffset() {
  window.requestAnimationFrame(() => {
    document.documentElement.style.setProperty("--banner-offset", `${topBanner.offsetHeight + 28}px`);
  });
}

function renderNavigation() {
  sectionNav.innerHTML = NAV_ITEMS.map((item) => `
    <button
      class="nav-tab ${item.id === state.activeView ? "is-active" : ""}"
      type="button"
      data-nav="${escapeHtml(item.id)}"
      aria-pressed="${item.id === state.activeView ? "true" : "false"}"
    >
      ${escapeHtml(item.label)}
    </button>
  `).join("");
  syncBannerOffset();
}

function resolveSessionAuthButtonText(signedIn) {
  if (state.authBusy) {
    return signedIn ? "Cerrando..." : "Abriendo...";
  }

  return signedIn ? "Cerrar sesión" : "Entrar con Google";
}

function renderBannerState() {
  const signedIn = Boolean(state.user);
  const guestMode = state.authResolved && !signedIn;
  const configured = firebaseReady;
  const currentName = state.profile
    ? resolveAdminName()
    : (state.user?.displayName || state.user?.email || "Sin iniciar sesión");


  sessionPanel.classList.toggle("is-guest", guestMode);
  sessionBrand.hidden = false;
  profileCluster.classList.toggle("is-guest", guestMode);
  sessionActions.classList.toggle("is-guest", guestMode);
  sessionHelper.hidden = guestMode;
  sessionHelper.dataset.tooltip = resolveSessionHelperText();
  sessionHelper.setAttribute("title", resolveSessionHelperText());
  guestBanner.hidden = !guestMode;
  sectionNav.hidden = !hasPanelAccess();

  profileImage.src = resolveProfileImage();
  profileImage.alt = `Foto de perfil de ${currentName}`;
  profileUploadTrigger.hidden = !hasPanelAccess();
  profileUploadTrigger.disabled = !hasPanelAccess() || state.uploadingProfile;
  profileUploadTrigger.setAttribute(
    "aria-label",
    state.uploadingProfile ? "Subiendo foto de perfil" : "Cambiar foto de perfil"
  );
  profileUploadTrigger.setAttribute(
    "title",
    state.uploadingProfile ? "Subiendo foto..." : "Cambiar foto de perfil"
  );
  bannerAside.hidden = !hasPanelAccess();
  sessionAuthButton.hidden = !configured || !state.authResolved;
  sessionAuthButton.disabled = state.uploadingProfile || state.authBusy;
  sessionAuthButton.textContent = resolveSessionAuthButtonText(signedIn);
  sessionAuthButton.classList.toggle("button-primary", !signedIn);
  sessionAuthButton.classList.toggle("button-secondary", signedIn);
  profileCluster.hidden = !hasPanelAccess();

  applyMessageToElement(authMessage, state.messages.auth);
  applyMessageToElement(profileMessage, state.messages.profile);
  syncBannerOffset();
}

function buildMetrics() {
  const pendingAppointments = state.appointments.filter((appointment) => appointment.status === "pending").length;
  const confirmedAppointments = state.appointments.filter((appointment) => appointment.status === "confirmed").length;
  const lowStockItems = state.stock.filter((item) => Number(item.quantity || 0) <= 2).length;

  return [
    {
      label: "Servicios activos",
      value: state.services.length,
      detail: "Servicios que estas ofreciendo hoy."
    },
    {
      label: "Turnos pendientes",
      value: pendingAppointments,
      detail: `${confirmedAppointments} turnos confirmados.`
    },
    {
      label: "Clientes",
      value: state.clients.length,
      detail: "Personas guardadas para seguimiento."
    },
    {
      label: "Alertas de stock",
      value: lowStockItems,
      detail: "Productos o insumos con poca cantidad."
    },
    {
      label: "Productos",
      value: state.products.length,
      detail: "Articulos disponibles para venta."
    }
  ];
}

function buildMetricsHtml() {
  return buildMetrics().map((metric) => `
    <article class="metric-card">
      <p class="eyebrow">${escapeHtml(metric.label)}</p>
      <strong>${escapeHtml(metric.value)}</strong>
      <span>${escapeHtml(metric.detail)}</span>
    </article>
  `).join("");
}

function buildAppointmentsHtml(items = state.appointments, { emptyMessage = "Todavia no hay turnos para mostrar.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((appointment) => `
    <article class="stack-item">
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(appointment.serviceName)}</strong>
          <p>${escapeHtml(appointment.clientName)} - ${escapeHtml(formatDateTime(appointment.requestedStartAt))}</p>
        </div>
        <span class="tag is-${escapeHtml(appointment.status)}">${escapeHtml(translateAppointmentStatus(appointment.status))}</span>
      </div>
      <p>${escapeHtml(appointment.estimatedDurationMinutes)} min estimados - Origen: ${escapeHtml(translateAppointmentSource(appointment.source))}</p>
      ${appointment.notes ? `<div class="stack-item__notes">${escapeHtml(appointment.notes)}</div>` : ""}
      ${showActions ? `
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="appointment-status" data-id="${escapeHtml(appointment.id)}" data-status="confirmed">Confirmar</button>
          <button class="button button-tertiary button-compact" type="button" data-action="appointment-status" data-id="${escapeHtml(appointment.id)}" data-status="completed">Completar</button>
          <button class="button button-tertiary button-compact" type="button" data-action="appointment-status" data-id="${escapeHtml(appointment.id)}" data-status="cancelled">Cancelar</button>
        </div>
      ` : ""}
    </article>
  `).join("");
}

function buildServicesHtml(items = state.services, { emptyMessage = "Todavia no cargaste servicios.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((service) => `
    <article class="stack-item">
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(service.name)}</strong>
          <p>${escapeHtml(service.description || "Sin descripcion publica.")}</p>
        </div>
        <span class="tag">${service.publicVisible ? "Publico" : "Oculto"}</span>
      </div>
      <p>${escapeHtml(formatMoney(service.price))} - ${escapeHtml(service.durationMinutes)} min - posicion en la web ${escapeHtml(service.sortOrder || 0)}</p>
      ${showActions ? `
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="edit-service" data-id="${escapeHtml(service.id)}">Editar</button>
        </div>
      ` : ""}
    </article>
  `).join("");
}

function buildClientsHtml(items = state.clients, { emptyMessage = "Todavia no hay clientes cargados para este negocio.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((client) => `
    <article class="stack-item">
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(client.fullName)}</strong>
          <p>${escapeHtml(client.phone || "Sin telefono")} - ${escapeHtml(client.email || "Sin email")}</p>
        </div>
        <span class="tag">${client.lastVisitAt ? "Activa" : "Nueva"}</span>
      </div>
      <p>Ultima visita: ${escapeHtml(formatDateTime(client.lastVisitAt))}</p>
      ${client.notes ? `<div class="stack-item__notes">${escapeHtml(client.notes)}</div>` : ""}
      ${showActions ? `
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="edit-client" data-id="${escapeHtml(client.id)}">Editar</button>
        </div>
      ` : ""}
    </article>
  `).join("");
}

function buildStockHtml(items = state.stock, { emptyMessage = "Todavia no hay insumos o productos cargados.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((item) => `
    <article class="stack-item">
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.brand || "Sin marca")} - ${escapeHtml(item.category || "Sin categoria")}</p>
        </div>
        <span class="tag ${Number(item.quantity || 0) <= 2 ? "is-pending" : ""}">${escapeHtml(item.quantity)}</span>
      </div>
      <p>${escapeHtml(formatMoney(item.price || 0))} - actualizado ${escapeHtml(formatDateTime(item.updatedAt))}</p>
      ${showActions ? `
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="edit-stock" data-id="${escapeHtml(item.id)}">Editar</button>
        </div>
      ` : ""}
    </article>
  `).join("");
}

function buildProductsHtml(items = state.products, { emptyMessage = "Todavia no hay productos cargados para venta.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((item) => `
    <article class="stack-item">
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.brand || "Sin marca")} - ${escapeHtml(item.category || "Sin categoria")}</p>
        </div>
        <span class="tag">${escapeHtml(item.quantity || 0)}</span>
      </div>
      <p>${escapeHtml(formatMoney(item.price || 0))} - actualizado ${escapeHtml(formatDateTime(item.updatedAt))}</p>
      ${showActions ? `
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="edit-product" data-id="${escapeHtml(item.id)}">Editar</button>
        </div>
      ` : ""}
    </article>
  `).join("");
}

function renderViewHero({ eyebrow, title, description, chip }) {
  return `
    <header class="view-hero">
      <div class="view-hero__meta">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <span class="card-chip">${escapeHtml(chip)}</span>
      </div>
    </header>
  `;
}

function renderLockedView({ eyebrow, title, description }) {
  const lockMessage = state.messages.auth.text || "Inicia sesion con una cuenta autorizada para ver tu negocio.";

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow,
        title,
        description,
        chip: firebaseReady ? "Cuenta necesaria" : "Panel no disponible"
      })}
      <article class="locked-panel">
        <p class="eyebrow">Acceso</p>
        <h3>Primero inicia sesion para ver la informacion de tu negocio.</h3>
        <p>${escapeHtml(lockMessage)}</p>
      </article>
    </section>
  `;
}

function renderDashboardMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Resumen",
      title: "Inicia sesion para ver el resumen del negocio.",
      description: "Cuando entres, vas a ver turnos, servicios, clientes y stock en un solo lugar."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Resumen",
        title: `Resumen de ${resolveBusinessName()}.`,
        description: "Revisa lo importante del dia y entra rapido a cada area de trabajo.",
        chip: resolveArea(state.profile)
      })}
      <section class="metrics-grid" id="metrics-grid"></section>
      <section class="section-grid section-grid--dashboard">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Turnos</p>
              <h3>Agenda cercana</h3>
            </div>
            <button class="button button-tertiary button-compact" type="button" data-nav="turnos">Abrir</button>
          </div>
          <div class="stack-list" id="dashboard-appointments"></div>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Servicios</p>
              <h3>Servicios publicados</h3>
            </div>
            <button class="button button-tertiary button-compact" type="button" data-nav="servicios">Abrir</button>
          </div>
          <div class="stack-list" id="dashboard-services"></div>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Clientes</p>
              <h3>Clientes recientes</h3>
            </div>
            <button class="button button-tertiary button-compact" type="button" data-nav="clientes">Abrir</button>
          </div>
          <div class="stack-list" id="dashboard-clients"></div>
        </article>
      </section>
    </section>
  `;
}

function renderTurnosMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Turnos",
      title: "Inicia sesion para ver la agenda.",
      description: "Aca vas a revisar reservas, confirmar turnos y cerrar trabajos."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Turnos",
        title: "Turnos y reservas.",
        description: "Revisa solicitudes, confirma visitas y marca los turnos ya atendidos.",
        chip: "Agenda"
      })}
      <article class="surface-panel">
        <div class="surface-panel__header">
          <div>
            <p class="eyebrow">Proximas reservas</p>
            <h3>Solicitudes y estados</h3>
          </div>
          <span class="card-chip">${escapeHtml(state.appointments.length)} turnos</span>
        </div>
        <div class="stack-list" id="appointments-list"></div>
      </article>
    </section>
  `;
}

function renderServicesMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Servicios",
      title: "Inicia sesion para editar tus servicios.",
      description: "Aca vas a cargar nombres, precios, duracion y descripcion para tus clientes."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Servicios",
        title: "Servicios y precios.",
        description: "Mantene actualizado lo que ofreces, cuanto dura y cuanto cuesta.",
        chip: "Catalogo"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Carga</p>
              <h3 id="service-form-title">Nuevo servicio</h3>
            </div>
            <span class="card-chip">Datos</span>
          </div>
          <form class="editor-form" id="service-form">
            <input id="service-id" type="hidden">
            <div class="form-grid">
              <label>
                <span>Nombre</span>
                <input id="service-name" type="text" required placeholder="Ej. Corte">
              </label>

              <label>
                <span>Precio</span>
                <input id="service-price" type="number" min="0" step="1" required placeholder="12000">
              </label>

              <label>
                <span>Duracion estimada (min)</span>
                <input id="service-duration" type="number" min="5" step="5" required placeholder="20">
              </label>

              <label>
                <span>Orden en la web</span>
                <input id="service-sort-order" type="number" min="1" step="1" placeholder="1">
              </label>

              <label class="field-wide">
                <span>Descripcion</span>
                <textarea id="service-description" rows="3" placeholder="Descripcion visible en la web publica."></textarea>
              </label>

              <label class="checkbox-field field-wide">
                <input id="service-public-visible" type="checkbox" checked>
                <span>Mostrar este servicio en la web publica</span>
              </label>
            </div>

            <div class="form-toolbar">
              <button class="button button-primary" id="service-submit" type="submit">Guardar servicio</button>
              <button class="button button-secondary" id="service-reset" type="button">Cancelar edicion</button>
              <p class="status-message" id="service-message" aria-live="polite"></p>
            </div>
          </form>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Catalogo actual</p>
              <h3>Servicios del negocio</h3>
            </div>
            <span class="card-chip">Lista</span>
          </div>
          <div class="stack-list" id="services-list"></div>
        </article>
      </section>
    </section>
  `;
}

function renderClientsMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Clientes",
      title: "Inicia sesion para ver tus clientes.",
      description: "Aca vas a guardar datos de contacto, notas y seguimiento de cada persona."
    });
  }

  const nataliaMarkup = isNataliaBusiness(state.profile) ? `
    <div class="accent-panel">
      <p class="eyebrow">Ficha de peluqueria</p>
      <div class="form-grid">
        <label>
          <span>Color actual</span>
          <input id="natalia-color-actual" type="text" placeholder="Ej. castano cobrizo">
        </label>

        <label>
          <span>Ultimo tratamiento</span>
          <input id="natalia-ultimo-tratamiento" type="text" placeholder="Ej. botox capilar">
        </label>

        <label>
          <span>Cambio de color</span>
          <input id="natalia-cambio-color" type="text" placeholder="Ej. de rubio a chocolate">
        </label>

        <label>
          <span>Volumen agua oxigenada</span>
          <input id="natalia-volumen-oxidante" type="text" placeholder="Ej. 20 vol">
        </label>

        <label class="checkbox-field">
          <input id="natalia-mechas" type="checkbox">
          <span>Se hizo mechas</span>
        </label>

        <label class="checkbox-field">
          <input id="natalia-formol" type="checkbox">
          <span>Tratamientos con formol</span>
        </label>

        <label>
          <span>Fecha tratamiento</span>
          <input id="natalia-treatment-date" type="date">
        </label>

        <label class="field-wide">
          <span>Detalle tratamiento</span>
          <input id="natalia-treatment-detail" type="text" placeholder="Ej. toner + nutricion profunda">
        </label>
      </div>
    </div>
  ` : "";

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Clientes",
        title: "Clientes y seguimiento.",
        description: "Guarda contactos, notas y detalles importantes para atender mejor.",
        chip: "Clientes"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Carga</p>
              <h3 id="client-form-title">Nuevo cliente</h3>
            </div>
            <span class="card-chip">Datos</span>
          </div>
          <form class="editor-form" id="client-form">
            <input id="client-id" type="hidden">
            <div class="form-grid">
              <label>
                <span>Nombre completo</span>
                <input id="client-full-name" type="text" required placeholder="Ej. Ana Lopez">
              </label>

              <label>
                <span>Telefono</span>
                <input id="client-phone-admin" type="tel" required placeholder="Ej. 11 5555 5555">
              </label>

              <label>
                <span>Email</span>
                <input id="client-email-admin" type="email" placeholder="Ej. cliente@email.com">
              </label>

              <label>
                <span>Ultima visita</span>
                <input id="client-last-visit" type="date">
              </label>

              <label class="field-wide">
                <span>Notas generales</span>
                <textarea id="client-notes-admin" rows="3" placeholder="Observaciones generales del cliente."></textarea>
              </label>
            </div>

            ${nataliaMarkup}

            <div class="form-toolbar">
              <button class="button button-primary" id="client-submit" type="submit">Guardar cliente</button>
              <button class="button button-secondary" id="client-reset" type="button">Cancelar edicion</button>
              <p class="status-message" id="client-message" aria-live="polite"></p>
            </div>
          </form>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Base reciente</p>
              <h3>Clientes del negocio</h3>
            </div>
            <span class="card-chip">Lista</span>
          </div>
          <div class="stack-list" id="clients-list"></div>
        </article>
      </section>
    </section>
  `;
}

function renderStockMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Stock",
      title: "Inicia sesion para controlar el stock.",
      description: "Aca vas a ver insumos, cantidades y productos que necesitan reposicion."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Stock",
        title: "Stock del negocio.",
        description: "Controla cantidades, precios de referencia, marcas y categorias.",
        chip: "Inventario"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Carga</p>
              <h3 id="stock-form-title">Nuevo insumo</h3>
            </div>
            <span class="card-chip">Datos</span>
          </div>
          <form class="editor-form" id="stock-form">
            <input id="stock-id" type="hidden">
            <div class="form-grid">
              <label>
                <span>Nombre</span>
                <input id="stock-name" type="text" required placeholder="Ej. Oxidante 20 vol">
              </label>

              <label>
                <span>Cantidad</span>
                <input id="stock-quantity" type="number" min="0" step="1" required placeholder="10">
              </label>

              <label>
                <span>Precio</span>
                <input id="stock-price" type="number" min="0" step="1" placeholder="4500">
              </label>

              <label>
                <span>Marca</span>
                <input id="stock-brand" type="text" placeholder="Ej. Alfaparf">
              </label>

              <label class="field-wide">
                <span>Categoria</span>
                <input id="stock-category" type="text" placeholder="Ej. coloracion, esmaltes, depilacion">
              </label>
            </div>

            <div class="form-toolbar">
              <button class="button button-primary" id="stock-submit" type="submit">Guardar stock</button>
              <button class="button button-secondary" id="stock-reset" type="button">Cancelar edicion</button>
              <p class="status-message" id="stock-message" aria-live="polite"></p>
            </div>
          </form>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Inventario</p>
              <h3>Insumos y productos del negocio</h3>
            </div>
            <span class="card-chip">Lista</span>
          </div>
          <div class="stack-list" id="stock-list"></div>
        </article>
      </section>
    </section>
  `;
}

function renderProductsMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Productos",
      title: "Inicia sesion para editar productos.",
      description: "Aca vas a organizar los articulos que vendes en el negocio."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Productos",
        title: "Productos para vender.",
        description: "Carga precios, cantidades, marcas y categorias de los articulos de venta.",
        chip: "Venta"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Carga</p>
              <h3 id="product-form-title">Nuevo producto</h3>
            </div>
            <span class="card-chip">Datos</span>
          </div>
          <form class="editor-form" id="product-form">
            <input id="product-id" type="hidden">
            <div class="form-grid">
              <label>
                <span>Nombre</span>
                <input id="product-name" type="text" required placeholder="Ej. Shampoo nutritivo">
              </label>

              <label>
                <span>Precio</span>
                <input id="product-price" type="number" min="0" step="1" required placeholder="18000">
              </label>

              <label>
                <span>Cantidad</span>
                <input id="product-quantity" type="number" min="0" step="1" placeholder="5">
              </label>

              <label>
                <span>Marca</span>
                <input id="product-brand" type="text" placeholder="Ej. Wella">
              </label>

              <label class="field-wide">
                <span>Categoria</span>
                <input id="product-category" type="text" placeholder="Ej. cuidado capilar, esmaltes, post depilacion">
              </label>
            </div>

            <div class="form-toolbar">
              <button class="button button-primary" id="product-submit" type="submit">Guardar producto</button>
              <button class="button button-secondary" id="product-reset" type="button">Cancelar edicion</button>
              <p class="status-message" id="product-message" aria-live="polite"></p>
            </div>
          </form>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Catalogo</p>
              <h3>Productos del negocio</h3>
            </div>
            <span class="card-chip">Lista</span>
          </div>
          <div class="stack-list" id="products-list"></div>
        </article>
      </section>
    </section>
  `;
}

function renderPaymentsMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Pagos",
      title: "Inicia sesion para ver pagos.",
      description: "Cuando esta area este activa, vas a poder revisar cobros y senas."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Pagos",
        title: "Pagos del negocio.",
        description: "Esta area va a ayudarte a ordenar cobros, senas y comprobantes.",
        chip: "Pagos"
      })}
      <article class="surface-panel">
        <div class="surface-panel__header">
          <div>
            <p class="eyebrow">Proximamente</p>
            <h3>Medios de pago por activar</h3>
          </div>
          <span class="card-chip">Pendiente</span>
        </div>
        <div class="payments-strip">
          <div>
            <strong>Mercado Pago</strong>
            <p>Para cobrar senas, reservas o servicios con link de pago.</p>
          </div>
          <div>
            <strong>Efectivo</strong>
            <p>Para registrar cobros del dia y revisar cierres de caja.</p>
          </div>
          <div>
            <strong>Transferencia</strong>
            <p>Para guardar pagos anticipados y comprobantes de clientes.</p>
          </div>
        </div>
      </article>
    </section>
  `;
}

function renderActiveView() {
  const hideContent = !state.authResolved || !state.user;

  if (contentShell) {
    contentShell.hidden = false;
  }

  if (privateShell) {
    privateShell.hidden = hideContent;
  }

  if (hideContent) {
    viewRoot.innerHTML = "";
    syncBannerOffset();
    return;
  }

  switch (state.activeView) {
    case "turnos":
      viewRoot.innerHTML = renderTurnosMarkup();
      break;
    case "servicios":
      viewRoot.innerHTML = renderServicesMarkup();
      break;
    case "clientes":
      viewRoot.innerHTML = renderClientsMarkup();
      break;
    case "stock":
      viewRoot.innerHTML = renderStockMarkup();
      break;
    case "productos":
      viewRoot.innerHTML = renderProductsMarkup();
      break;
    case "pagos":
      viewRoot.innerHTML = renderPaymentsMarkup();
      break;
    case "dashboard":
    default:
      viewRoot.innerHTML = renderDashboardMarkup();
      break;
  }

  hydrateCurrentView();
  refreshCurrentViewData();
  syncBannerOffset();
}

function refreshCurrentViewMessages() {
  applyMessageToElement(getViewElement("service-message"), state.messages.service);
  applyMessageToElement(getViewElement("client-message"), state.messages.client);
  applyMessageToElement(getViewElement("stock-message"), state.messages.stock);
  applyMessageToElement(getViewElement("product-message"), state.messages.product);
}

function refreshCurrentViewData() {
  refreshCurrentViewMessages();

  switch (state.activeView) {
    case "dashboard": {
      const metricsGrid = getViewElement("metrics-grid");
      const dashboardAppointments = getViewElement("dashboard-appointments");
      const dashboardServices = getViewElement("dashboard-services");
      const dashboardClients = getViewElement("dashboard-clients");

      if (metricsGrid) {
        metricsGrid.innerHTML = buildMetricsHtml();
      }

      if (dashboardAppointments) {
        dashboardAppointments.innerHTML = buildAppointmentsHtml(state.appointments.slice(0, 4), {
          emptyMessage: "Todavia no hay turnos pendientes o confirmados.",
          showActions: false
        });
      }

      if (dashboardServices) {
        dashboardServices.innerHTML = buildServicesHtml(state.services.slice(0, 4), {
          emptyMessage: "Todavia no cargaste servicios visibles.",
          showActions: false
        });
      }

      if (dashboardClients) {
        dashboardClients.innerHTML = buildClientsHtml(state.clients.slice(0, 4), {
          emptyMessage: "Todavia no hay clientes recientes.",
          showActions: false
        });
      }

      break;
    }
    case "turnos": {
      const appointmentsList = getViewElement("appointments-list");
      if (appointmentsList) {
        appointmentsList.innerHTML = buildAppointmentsHtml();
      }
      break;
    }
    case "servicios": {
      const servicesList = getViewElement("services-list");
      if (servicesList) {
        servicesList.innerHTML = buildServicesHtml();
      }
      break;
    }
    case "clientes": {
      const clientsList = getViewElement("clients-list");
      if (clientsList) {
        clientsList.innerHTML = buildClientsHtml();
      }
      break;
    }
    case "stock": {
      const stockList = getViewElement("stock-list");
      if (stockList) {
        stockList.innerHTML = buildStockHtml();
      }
      break;
    }
    case "productos": {
      const productsList = getViewElement("products-list");
      if (productsList) {
        productsList.innerHTML = buildProductsHtml();
      }
      break;
    }
    default:
      break;
  }
}

function hydrateCurrentView() {
  switch (state.activeView) {
    case "servicios":
      populateServiceForm();
      break;
    case "clientes":
      populateClientForm();
      break;
    case "stock":
      populateStockForm();
      break;
    case "productos":
      populateProductForm();
      break;
    default:
      break;
  }
}

function populateServiceForm() {
  const service = state.services.find((item) => item.id === state.editor.serviceId);
  const serviceIdInput = getViewElement("service-id");
  const serviceNameInput = getViewElement("service-name");
  const servicePriceInput = getViewElement("service-price");
  const serviceDurationInput = getViewElement("service-duration");
  const serviceSortOrderInput = getViewElement("service-sort-order");
  const serviceDescriptionInput = getViewElement("service-description");
  const servicePublicVisibleInput = getViewElement("service-public-visible");
  const serviceFormTitle = getViewElement("service-form-title");
  const serviceSubmit = getViewElement("service-submit");

  if (!serviceIdInput || !serviceNameInput || !servicePriceInput || !serviceDurationInput || !serviceSortOrderInput || !serviceDescriptionInput || !servicePublicVisibleInput || !serviceFormTitle || !serviceSubmit) {
    return;
  }

  serviceIdInput.value = service?.id || "";
  serviceNameInput.value = service?.name || "";
  servicePriceInput.value = service ? Number(service.price || 0) : "";
  serviceDurationInput.value = service ? Number(service.durationMinutes || 0) : "";
  serviceSortOrderInput.value = service ? Number(service.sortOrder || 0) : "";
  serviceDescriptionInput.value = service?.description || "";
  servicePublicVisibleInput.checked = service ? service.publicVisible !== false : true;
  serviceFormTitle.textContent = service ? `Editando ${service.name}` : "Nuevo servicio";
  serviceSubmit.textContent = service ? "Actualizar servicio" : "Guardar servicio";
  applyMessageToElement(getViewElement("service-message"), state.messages.service);
}

function populateClientForm() {
  const client = state.clients.find((item) => item.id === state.editor.clientId);
  const clientIdInput = getViewElement("client-id");
  const clientFullNameInput = getViewElement("client-full-name");
  const clientPhoneInput = getViewElement("client-phone-admin");
  const clientEmailInput = getViewElement("client-email-admin");
  const clientLastVisitInput = getViewElement("client-last-visit");
  const clientNotesInput = getViewElement("client-notes-admin");
  const clientFormTitle = getViewElement("client-form-title");
  const clientSubmit = getViewElement("client-submit");

  if (!clientIdInput || !clientFullNameInput || !clientPhoneInput || !clientEmailInput || !clientLastVisitInput || !clientNotesInput || !clientFormTitle || !clientSubmit) {
    return;
  }

  clientIdInput.value = client?.id || "";
  clientFullNameInput.value = client?.fullName || "";
  clientPhoneInput.value = client?.phone || "";
  clientEmailInput.value = client?.email || "";
  clientLastVisitInput.value = client ? formatDateOnly(client.lastVisitAt) : "";
  clientNotesInput.value = client?.notes || "";
  clientFormTitle.textContent = client ? `Editando ${client.fullName}` : "Nuevo cliente";
  clientSubmit.textContent = client ? "Actualizar cliente" : "Guardar cliente";

  const nataliaColorInput = getViewElement("natalia-color-actual");
  const nataliaLastTreatmentInput = getViewElement("natalia-ultimo-tratamiento");
  const nataliaColorShiftInput = getViewElement("natalia-cambio-color");
  const nataliaOxidantInput = getViewElement("natalia-volumen-oxidante");
  const nataliaHighlightsInput = getViewElement("natalia-mechas");
  const nataliaFormaldehydeInput = getViewElement("natalia-formol");
  const nataliaTreatmentDateInput = getViewElement("natalia-treatment-date");
  const nataliaTreatmentDetailInput = getViewElement("natalia-treatment-detail");

  if (nataliaColorInput && nataliaLastTreatmentInput && nataliaColorShiftInput && nataliaOxidantInput && nataliaHighlightsInput && nataliaFormaldehydeInput && nataliaTreatmentDateInput && nataliaTreatmentDetailInput) {
    nataliaColorInput.value = state.editor.clientProfile.colorActual || "";
    nataliaLastTreatmentInput.value = state.editor.clientProfile.ultimoTratamiento || "";
    nataliaColorShiftInput.value = state.editor.clientProfile.cambioColor || "";
    nataliaOxidantInput.value = state.editor.clientProfile.volumenAguaOxigenada || "";
    nataliaHighlightsInput.checked = state.editor.clientProfile.mechas === true;
    nataliaFormaldehydeInput.checked = state.editor.clientProfile.tratamientosConFormol === true;
    nataliaTreatmentDateInput.value = "";
    nataliaTreatmentDetailInput.value = "";
  }

  applyMessageToElement(getViewElement("client-message"), state.messages.client);
}

function populateStockForm() {
  const item = state.stock.find((entry) => entry.id === state.editor.stockId);
  const stockIdInput = getViewElement("stock-id");
  const stockNameInput = getViewElement("stock-name");
  const stockQuantityInput = getViewElement("stock-quantity");
  const stockPriceInput = getViewElement("stock-price");
  const stockBrandInput = getViewElement("stock-brand");
  const stockCategoryInput = getViewElement("stock-category");
  const stockFormTitle = getViewElement("stock-form-title");
  const stockSubmit = getViewElement("stock-submit");

  if (!stockIdInput || !stockNameInput || !stockQuantityInput || !stockPriceInput || !stockBrandInput || !stockCategoryInput || !stockFormTitle || !stockSubmit) {
    return;
  }

  stockIdInput.value = item?.id || "";
  stockNameInput.value = item?.name || "";
  stockQuantityInput.value = item ? Number(item.quantity || 0) : "";
  stockPriceInput.value = item ? Number(item.price || 0) : "";
  stockBrandInput.value = item?.brand || "";
  stockCategoryInput.value = item?.category || "";
  stockFormTitle.textContent = item ? `Editando ${item.name}` : "Nuevo insumo";
  stockSubmit.textContent = item ? "Actualizar stock" : "Guardar stock";
  applyMessageToElement(getViewElement("stock-message"), state.messages.stock);
}

function populateProductForm() {
  const item = state.products.find((entry) => entry.id === state.editor.productId);
  const productIdInput = getViewElement("product-id");
  const productNameInput = getViewElement("product-name");
  const productPriceInput = getViewElement("product-price");
  const productQuantityInput = getViewElement("product-quantity");
  const productBrandInput = getViewElement("product-brand");
  const productCategoryInput = getViewElement("product-category");
  const productFormTitle = getViewElement("product-form-title");
  const productSubmit = getViewElement("product-submit");

  if (!productIdInput || !productNameInput || !productPriceInput || !productQuantityInput || !productBrandInput || !productCategoryInput || !productFormTitle || !productSubmit) {
    return;
  }

  productIdInput.value = item?.id || "";
  productNameInput.value = item?.name || "";
  productPriceInput.value = item ? Number(item.price || 0) : "";
  productQuantityInput.value = item ? Number(item.quantity || 0) : "";
  productBrandInput.value = item?.brand || "";
  productCategoryInput.value = item?.category || "";
  productFormTitle.textContent = item ? `Editando ${item.name}` : "Nuevo producto";
  productSubmit.textContent = item ? "Actualizar producto" : "Guardar producto";
  applyMessageToElement(getViewElement("product-message"), state.messages.product);
}

function clearBusinessData() {
  state.services = [];
  state.appointments = [];
  state.clients = [];
  state.stock = [];
  state.products = [];
  resetServiceEditor({ preserveMessage: true });
  resetClientEditor({ preserveMessage: true });
  resetStockEditor({ preserveMessage: true });
  resetProductEditor({ preserveMessage: true });
}

function clearSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
  state.subscribedAdminId = null;
}

function resetServiceEditor({ preserveMessage = false } = {}) {
  state.editor.serviceId = "";

  if (!preserveMessage) {
    clearScopedMessage("service");
  }

  if (state.activeView === "servicios") {
    populateServiceForm();
  }
}

function resetClientEditor({ preserveMessage = false } = {}) {
  state.editor.clientId = "";
  state.editor.clientProfile = createEmptyClientProfile();

  if (!preserveMessage) {
    clearScopedMessage("client");
  }

  if (state.activeView === "clientes") {
    populateClientForm();
  }
}

function resetStockEditor({ preserveMessage = false } = {}) {
  state.editor.stockId = "";

  if (!preserveMessage) {
    clearScopedMessage("stock");
  }

  if (state.activeView === "stock") {
    populateStockForm();
  }
}

function resetProductEditor({ preserveMessage = false } = {}) {
  state.editor.productId = "";

  if (!preserveMessage) {
    clearScopedMessage("product");
  }

  if (state.activeView === "productos") {
    populateProductForm();
  }
}

function setAccessBlocked(message, tone = "warning") {
  clearSubscriptions();
  clearBusinessData();
  state.profile = null;
  state.messages.auth = { text: message, tone };
  renderBannerState();
  renderActiveView();
}

async function handleSignIn() {
  if (!firebaseReady || !auth) {
    setScopedMessage("auth", "El panel todavia no esta listo para iniciar sesion. Avisale al equipo de Rockeala.", "error");
    return;
  }

  state.authBusy = true;
  renderBannerState();
  setScopedMessage("auth", "Abriendo Google para iniciar sesion...", "");

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = "es";
    await signInWithPopup(auth, provider);
  } catch (error) {
    setScopedMessage("auth", "No se pudo iniciar sesion. Reintenta en unos segundos.", "error");
  } finally {
    state.authBusy = false;
    renderBannerState();
  }
}

async function handleSignOut() {
  if (!auth) {
    return;
  }

  state.authBusy = true;
  renderBannerState();

  try {
    await signOut(auth);
  } catch (error) {
    setScopedMessage("auth", "No se pudo cerrar sesion. Reintenta en unos segundos.", "error");
  } finally {
    state.authBusy = false;
    renderBannerState();
  }
}

function handleSessionAuthAction() {
  if (state.user) {
    handleSignOut();
    return;
  }

  handleSignIn();
}

async function loadAdminProfile(user) {
  try {
    const adminSnapshot = await getDoc(doc(db, "admins", user.uid));

    if (!adminSnapshot.exists()) {
      setAccessBlocked("Tu cuenta de Google todavia no tiene permiso para entrar. Pedi que habiliten tu acceso.", "error");
      return;
    }

    const profile = {
      id: adminSnapshot.id,
      ...adminSnapshot.data()
    };

    if (profile.active !== true) {
      setAccessBlocked("Tu acceso esta pausado. Consulta con quien administra Rockeala.", "warning");
      return;
    }

    state.profile = profile;
    state.messages.auth = { text: "Listo, ya puedes administrar tu negocio.", tone: "success" };
    renderBannerState();
    renderActiveView();
    startRealtimeSubscriptions(user.uid);
  } catch (error) {
    setAccessBlocked("No se pudo cargar tu cuenta. Reintenta en unos segundos.", "error");
  }
}

function startRealtimeSubscriptions(adminId) {
  if (state.subscribedAdminId === adminId && state.unsubscribers.length > 0) {
    return;
  }

  clearSubscriptions();
  state.subscribedAdminId = adminId;

  const servicesQuery = query(
    collection(db, "servicios"),
    where("adminId", "==", adminId),
    orderBy("sortOrder", "asc"),
    limit(30)
  );

  const appointmentsQuery = query(
    collection(db, "turnos"),
    where("adminId", "==", adminId),
    orderBy("requestedStartAt", "asc"),
    limit(20)
  );

  const clientsQuery = query(
    collection(db, "clientes"),
    where("adminIds", "array-contains", adminId),
    orderBy("updatedAt", "desc"),
    limit(20)
  );

  const stockQuery = query(
    collection(db, "stock"),
    where("adminId", "==", adminId),
    orderBy("updatedAt", "desc"),
    limit(20)
  );

  const productsQuery = query(
    collection(db, "productos"),
    where("adminId", "==", adminId),
    orderBy("updatedAt", "desc"),
    limit(20)
  );

  state.unsubscribers.push(
    onSnapshot(servicesQuery, (snapshot) => {
      state.services = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      refreshCurrentViewData();
    }, () => setScopedMessage("service", "No pudimos cargar tus servicios. Reintenta en unos segundos.", "error"))
  );

  state.unsubscribers.push(
    onSnapshot(appointmentsQuery, (snapshot) => {
      state.appointments = snapshot.docs.map((documentSnapshot) => {
        const data = documentSnapshot.data();
        return {
          id: documentSnapshot.id,
          serviceName: data.serviceNameSnapshot || data.serviceName || "Servicio",
          clientName: data.clientSnapshot?.fullName || data.clientName || "Cliente",
          requestedStartAt: data.requestedStartAt,
          estimatedDurationMinutes: Number(data.estimatedDurationMinutes || 0),
          status: data.status || "pending",
          source: data.source || "panel",
          notes: data.notes || ""
        };
      });
      refreshCurrentViewData();
    }, () => setScopedMessage("auth", "No pudimos cargar tus turnos. Reintenta en unos segundos.", "error"))
  );

  state.unsubscribers.push(
    onSnapshot(clientsQuery, (snapshot) => {
      state.clients = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      refreshCurrentViewData();
    }, () => setScopedMessage("client", "No pudimos cargar tus clientes. Reintenta en unos segundos.", "error"))
  );

  state.unsubscribers.push(
    onSnapshot(stockQuery, (snapshot) => {
      state.stock = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      refreshCurrentViewData();
    }, () => setScopedMessage("stock", "No pudimos cargar el stock. Reintenta en unos segundos.", "error"))
  );

  state.unsubscribers.push(
    onSnapshot(productsQuery, (snapshot) => {
      state.products = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      refreshCurrentViewData();
    }, () => setScopedMessage("product", "No pudimos cargar los productos. Reintenta en unos segundos.", "error"))
  );
}

function activateView(viewId, forceRender = false) {
  const nextView = NAV_ITEMS.some((item) => item.id === viewId) ? viewId : "dashboard";

  if (state.activeView === nextView && !forceRender) {
    return;
  }

  state.activeView = nextView;
  window.history.replaceState(null, "", `#${nextView}`);
  renderNavigation();
  renderActiveView();
}

async function saveService(event) {
  event.preventDefault();

  if (!hasPanelAccess()) {
    setScopedMessage("service", "Inicia sesion antes de guardar servicios.", "error");
    return;
  }

  const serviceNameInput = getViewElement("service-name");
  const servicePriceInput = getViewElement("service-price");
  const serviceDurationInput = getViewElement("service-duration");
  const serviceSortOrderInput = getViewElement("service-sort-order");
  const serviceDescriptionInput = getViewElement("service-description");
  const servicePublicVisibleInput = getViewElement("service-public-visible");

  const payload = {
    adminId: state.user.uid,
    adminName: resolveAdminName(),
    businessName: resolveBusinessName(),
    area: resolveArea(state.profile),
    name: serviceNameInput.value.trim(),
    description: serviceDescriptionInput.value.trim(),
    price: Number(servicePriceInput.value),
    currency: "ARS",
    durationMinutes: Number(serviceDurationInput.value),
    publicVisible: servicePublicVisibleInput.checked,
    sortOrder: Number(serviceSortOrderInput.value || state.services.length + 1),
    updatedAt: serverTimestamp()
  };

  try {
    if (state.editor.serviceId) {
      await setDoc(doc(db, "servicios", state.editor.serviceId), payload, { merge: true });
      setScopedMessage("service", "Servicio actualizado.", "success");
    } else {
      await addDoc(collection(db, "servicios"), {
        ...payload,
        createdAt: serverTimestamp()
      });
      setScopedMessage("service", "Servicio creado.", "success");
    }

    resetServiceEditor({ preserveMessage: true });
  } catch (error) {
    setScopedMessage("service", "No se pudo guardar el servicio. Revisa los datos e intenta de nuevo.", "error");
  }
}

async function saveClient(event) {
  event.preventDefault();

  if (!hasPanelAccess()) {
    setScopedMessage("client", "Inicia sesion antes de guardar clientes.", "error");
    return;
  }

  const clientFullNameInput = getViewElement("client-full-name");
  const clientPhoneInput = getViewElement("client-phone-admin");
  const clientEmailInput = getViewElement("client-email-admin");
  const clientLastVisitInput = getViewElement("client-last-visit");
  const clientNotesInput = getViewElement("client-notes-admin");

  const phoneSearch = normalizePhone(clientPhoneInput.value);
  const emailSearch = clientEmailInput.value.trim().toLowerCase();
  const clientPayload = {
    fullName: clientFullNameInput.value.trim(),
    phone: clientPhoneInput.value.trim(),
    phoneSearch,
    email: clientEmailInput.value.trim(),
    emailSearch,
    notes: clientNotesInput.value.trim(),
    lastVisitAt: clientLastVisitInput.value ? new Date(`${clientLastVisitInput.value}T12:00:00.000Z`) : null,
    updatedAt: serverTimestamp()
  };

  try {
    let clientId = state.editor.clientId;

    if (clientId) {
      await setDoc(doc(db, "clientes", clientId), {
        ...clientPayload,
        adminIds: arrayUnion(state.user.uid)
      }, { merge: true });
    } else {
      const newClientRef = await addDoc(collection(db, "clientes"), {
        ...clientPayload,
        adminIds: [state.user.uid],
        createdAt: serverTimestamp()
      });
      clientId = newClientRef.id;
    }

    if (isNataliaBusiness(state.profile)) {
      const nataliaColorInput = getViewElement("natalia-color-actual");
      const nataliaLastTreatmentInput = getViewElement("natalia-ultimo-tratamiento");
      const nataliaColorShiftInput = getViewElement("natalia-cambio-color");
      const nataliaOxidantInput = getViewElement("natalia-volumen-oxidante");
      const nataliaHighlightsInput = getViewElement("natalia-mechas");
      const nataliaFormaldehydeInput = getViewElement("natalia-formol");
      const nataliaTreatmentDateInput = getViewElement("natalia-treatment-date");
      const nataliaTreatmentDetailInput = getViewElement("natalia-treatment-detail");
      const profileRef = doc(db, "clientes", clientId, "perfilesAdmin", state.user.uid);
      const treatmentDetail = nataliaTreatmentDetailInput.value.trim();
      const treatmentDate = nataliaTreatmentDateInput.value;

      await setDoc(profileRef, {
        colorActual: nataliaColorInput.value.trim(),
        ultimoTratamiento: nataliaLastTreatmentInput.value.trim(),
        cambioColor: nataliaColorShiftInput.value.trim(),
        volumenAguaOxigenada: nataliaOxidantInput.value.trim(),
        mechas: nataliaHighlightsInput.checked,
        tratamientosConFormol: nataliaFormaldehydeInput.checked,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (treatmentDate && treatmentDetail) {
        const treatmentId = `${treatmentDate}-${slugify(treatmentDetail).slice(0, 30) || "tratamiento"}`;
        await setDoc(doc(db, "clientes", clientId, "perfilesAdmin", state.user.uid, "tratamientos", treatmentId), {
          type: nataliaLastTreatmentInput.value.trim() || "Tratamiento",
          detail: treatmentDetail,
          date: treatmentDate,
          notes: clientNotesInput.value.trim(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }

    setScopedMessage("client", state.editor.clientId ? "Cliente actualizado." : "Cliente creado.", "success");
    resetClientEditor({ preserveMessage: true });
  } catch (error) {
    setScopedMessage("client", "No se pudo guardar el cliente. Revisa los datos e intenta de nuevo.", "error");
  }
}

async function saveStock(event) {
  event.preventDefault();

  if (!hasPanelAccess()) {
    setScopedMessage("stock", "Inicia sesion antes de guardar stock.", "error");
    return;
  }

  const stockNameInput = getViewElement("stock-name");
  const stockQuantityInput = getViewElement("stock-quantity");
  const stockPriceInput = getViewElement("stock-price");
  const stockBrandInput = getViewElement("stock-brand");
  const stockCategoryInput = getViewElement("stock-category");

  const payload = {
    adminId: state.user.uid,
    name: stockNameInput.value.trim(),
    quantity: Number(stockQuantityInput.value),
    price: Number(stockPriceInput.value || 0),
    brand: stockBrandInput.value.trim(),
    category: stockCategoryInput.value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    if (state.editor.stockId) {
      await setDoc(doc(db, "stock", state.editor.stockId), payload, { merge: true });
      setScopedMessage("stock", "Producto actualizado.", "success");
    } else {
      await addDoc(collection(db, "stock"), {
        ...payload,
        createdAt: serverTimestamp()
      });
      setScopedMessage("stock", "Producto creado.", "success");
    }

    resetStockEditor({ preserveMessage: true });
  } catch (error) {
    setScopedMessage("stock", "No se pudo guardar el stock. Revisa los datos e intenta de nuevo.", "error");
  }
}

async function saveProduct(event) {
  event.preventDefault();

  if (!hasPanelAccess()) {
    setScopedMessage("product", "Inicia sesion antes de guardar productos.", "error");
    return;
  }

  const productNameInput = getViewElement("product-name");
  const productPriceInput = getViewElement("product-price");
  const productQuantityInput = getViewElement("product-quantity");
  const productBrandInput = getViewElement("product-brand");
  const productCategoryInput = getViewElement("product-category");

  const payload = {
    adminId: state.user.uid,
    name: productNameInput.value.trim(),
    quantity: Number(productQuantityInput.value || 0),
    price: Number(productPriceInput.value || 0),
    brand: productBrandInput.value.trim(),
    category: productCategoryInput.value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    if (state.editor.productId) {
      await setDoc(doc(db, "productos", state.editor.productId), payload, { merge: true });
      setScopedMessage("product", "Producto actualizado.", "success");
    } else {
      await addDoc(collection(db, "productos"), {
        ...payload,
        createdAt: serverTimestamp()
      });
      setScopedMessage("product", "Producto creado.", "success");
    }

    resetProductEditor({ preserveMessage: true });
  } catch (error) {
    setScopedMessage("product", "No se pudo guardar el producto. Revisa los datos e intenta de nuevo.", "error");
  }
}

async function updateAppointmentStatus(appointmentId, status) {
  try {
    await updateDoc(doc(db, "turnos", appointmentId), {
      status,
      updatedAt: serverTimestamp()
    });
    setScopedMessage("auth", `Turno actualizado a ${translateAppointmentStatus(status).toLowerCase()}.`, "success");
  } catch (error) {
    setScopedMessage("auth", "No se pudo actualizar el turno. Reintenta en unos segundos.", "error");
  }
}

function editService(serviceId) {
  state.editor.serviceId = serviceId;
  const service = state.services.find((item) => item.id === serviceId);
  setScopedMessage("service", service ? `Editando ${service.name}.` : "Editando servicio.", "warning");
  populateServiceForm();
  getViewElement("service-name")?.focus();
}

async function editClient(clientId) {
  state.editor.clientId = clientId;
  state.editor.clientProfile = createEmptyClientProfile();
  const client = state.clients.find((item) => item.id === clientId);

  if (isNataliaBusiness(state.profile)) {
    try {
      const profileSnapshot = await getDoc(doc(db, "clientes", clientId, "perfilesAdmin", state.user.uid));

      if (profileSnapshot.exists()) {
        state.editor.clientProfile = {
          ...createEmptyClientProfile(),
          ...profileSnapshot.data()
        };
      }
    } catch (error) {
      setScopedMessage("client", "No se pudieron cargar los datos de peluqueria.", "error");
    }
  }

  setScopedMessage("client", client ? `Editando ${client.fullName}.` : "Editando cliente.", "warning");
  populateClientForm();
  getViewElement("client-full-name")?.focus();
}

function editStock(stockId) {
  state.editor.stockId = stockId;
  const item = state.stock.find((stockItem) => stockItem.id === stockId);
  setScopedMessage("stock", item ? `Editando ${item.name}.` : "Editando stock.", "warning");
  populateStockForm();
  getViewElement("stock-name")?.focus();
}

function editProduct(productId) {
  state.editor.productId = productId;
  const item = state.products.find((productItem) => productItem.id === productId);
  setScopedMessage("product", item ? `Editando ${item.name}.` : "Editando producto.", "warning");
  populateProductForm();
  getViewElement("product-name")?.focus();
}

async function convertImageFileToWebp(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 960;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    bitmap.close();
    throw new Error("Tu navegador no pudo preparar la foto.");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
        return;
      }

      reject(new Error("Tu navegador no pudo preparar la foto."));
    }, "image/webp", 0.88);
  });

  return new File([blob], "avatar.webp", {
    type: "image/webp",
    lastModified: Date.now()
  });
}

function explainProfileUploadError(error) {
  const raw = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();

  if (raw.includes("no-default-bucket") || raw.includes("bucket") || raw.includes("storage has not been set up")) {
    return "La subida de fotos todavia no esta disponible. Avisale al equipo de Rockeala.";
  }

  if (raw.includes("permission") || raw.includes("unauthorized")) {
    return "No tenes permiso para cambiar la foto en este momento.";
  }

  return "No se pudo subir la foto de perfil. Reintenta con otra imagen.";
}

async function handleProfileUpload(event) {
  const file = event.target.files?.[0];
  profileUploadInput.value = "";

  if (!file) {
    return;
  }

  if (!String(file.type || "").startsWith("image/")) {
    setScopedMessage("profile", "El archivo seleccionado no es una imagen valida.", "error");
    return;
  }

  if (!hasPanelAccess()) {
    setScopedMessage("profile", "Necesitas iniciar sesion para cambiar la foto.", "error");
    return;
  }

  state.uploadingProfile = true;
  renderBannerState();
  setScopedMessage("profile", "Preparando y guardando tu foto...", "");

  try {
    const webpFile = await convertImageFileToWebp(file);
    const storagePath = `admins/${state.user.uid}/profile/avatar.webp`;
    const imageRef = ref(storage, storagePath);

    await uploadBytes(imageRef, webpFile, {
      contentType: "image/webp",
      cacheControl: "public,max-age=3600"
    });

    const downloadUrl = await getDownloadURL(imageRef);

    await updateDoc(doc(db, "admins", state.user.uid), {
      photoUrl: downloadUrl,
      photoStoragePath: storagePath,
      updatedAt: serverTimestamp()
    });

    state.profile = {
      ...state.profile,
      photoUrl: downloadUrl,
      photoStoragePath: storagePath
    };

    setScopedMessage("profile", "Foto actualizada.", "success");
  } catch (error) {
    setScopedMessage("profile", explainProfileUploadError(error), "error");
  } finally {
    state.uploadingProfile = false;
    renderBannerState();
  }
}

function handleNavClick(event) {
  const navButton = event.target.closest("[data-nav]");

  if (!navButton) {
    return;
  }

  activateView(navButton.dataset.nav, true);
}

function handleViewClick(event) {
  const navButton = event.target.closest("[data-nav]");

  if (navButton) {
    activateView(navButton.dataset.nav, true);
    return;
  }

  const actionButton = event.target.closest("[data-action]");

  if (actionButton) {
    const { action, id, status } = actionButton.dataset;

    if (action === "appointment-status" && id && status) {
      updateAppointmentStatus(id, status);
      return;
    }

    if (action === "edit-service" && id) {
      editService(id);
      return;
    }

    if (action === "edit-client" && id) {
      editClient(id);
      return;
    }

    if (action === "edit-stock" && id) {
      editStock(id);
      return;
    }

    if (action === "edit-product" && id) {
      editProduct(id);
      return;
    }
  }

  if (event.target.closest("#service-reset")) {
    resetServiceEditor();
    return;
  }

  if (event.target.closest("#client-reset")) {
    resetClientEditor();
    return;
  }

  if (event.target.closest("#stock-reset")) {
    resetStockEditor();
    return;
  }

  if (event.target.closest("#product-reset")) {
    resetProductEditor();
  }
}

function handleViewSubmit(event) {
  if (event.target.id === "service-form") {
    saveService(event);
    return;
  }

  if (event.target.id === "client-form") {
    saveClient(event);
    return;
  }

  if (event.target.id === "stock-form") {
    saveStock(event);
    return;
  }

  if (event.target.id === "product-form") {
    saveProduct(event);
  }
}

function attachEvents() {
  sessionAuthButton.addEventListener("click", handleSessionAuthAction);
  profileUploadTrigger.addEventListener("click", () => profileUploadInput.click());
  profileUploadInput.addEventListener("change", handleProfileUpload);
  sectionNav.addEventListener("click", handleNavClick);
  viewRoot.addEventListener("click", handleViewClick);
  viewRoot.addEventListener("submit", handleViewSubmit);
  window.addEventListener("resize", syncBannerOffset);
  window.addEventListener("hashchange", () => activateView(resolveInitialView(), true));
}

async function bootstrapAuth() {
  renderNavigation();
  renderBannerState();
  renderActiveView();

  if (!firebaseReady || !auth || !db) {
    state.messages.auth = {
      text: "El panel todavia no esta listo para iniciar sesion. Avisale al equipo de Rockeala.",
      tone: "warning"
    };
    renderBannerState();
    renderActiveView();
    return;
  }

  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, async (user) => {
    clearSubscriptions();
    state.user = user;
    state.authResolved = true;

    if (!user) {
      state.profile = null;
      clearBusinessData();
      state.messages.auth = createEmptyMessage();
      renderBannerState();
      renderActiveView();
      return;
    }

    state.messages.auth = createEmptyMessage();
    renderBannerState();
    renderActiveView();
    await loadAdminProfile(user);
  });
}

attachEvents();
bootstrapAuth();
