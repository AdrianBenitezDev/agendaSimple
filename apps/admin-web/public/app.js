import {
  addDoc,
  arrayUnion,
  browserLocalPersistence,
  collection,
  deleteDoc,
  deleteObject,
  doc,
  getDoc,
  getDocs,
  getDownloadURL,
  GoogleAuthProvider,
  httpsCallable,
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
import { auth, db, firebaseReady, functions, storage } from "./firebase-client.js";
import { resolveAdminTenantId } from "./tenant.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "Resumen" },
  { id: "turnos", label: "Turnos" },
  { id: "servicios", label: "Servicios" },
  { id: "clientes", label: "Clientes" },
  { id: "stock", label: "Stock" },
  { id: "productos", label: "Productos" },
  { id: "pagos", label: "Pagos" },
  { id: "salon", label: "Salon" },
  { id: "usuarios", label: "Usuarios" }
];
const MANAGED_ADMIN_ROLES = [
  { id: "manicura", label: "Manicura" },
  { id: "depilacion", label: "Depilacion" },
  { id: "barberia", label: "Barberia" }
];
const ADMIN_ACCESS_MANAGER_EMAILS = new Set([
  "37adrian38@gmail.com",
  "nataliasoledadromero27@gmail.com"
]);

const state = {
  tenantId: "",
  tenantData: null,
  user: null,
  profile: null,
  authResolved: false,
  services: [],
  appointments: [],
  clients: [],
  stock: [],
  products: [],
  salonMedia: [],
  stockUi: createEmptyInventoryUiState(),
  productUi: createEmptyInventoryUiState(),
  salonUi: createEmptySalonUiState(),
  unsubscribers: [],
  subscribedAdminId: null,
  activeView: resolveInitialView(),
  uploadingProfile: false,
  authBusy: false,
  clientUi: createEmptyClientUiState(),
  adminAccess: createEmptyAdminAccessState(),
  editor: {
    serviceId: "",
    clientId: "",
    stockId: "",
    productId: "",
    salonMediaId: "",
    clientProfile: createEmptyClientProfile()
  },
  messages: {
    auth: createEmptyMessage(),
    profile: createEmptyMessage(),
    service: createEmptyMessage(),
    client: createEmptyMessage(),
    stock: createEmptyMessage(),
    product: createEmptyMessage(),
    salon: createEmptyMessage(),
    team: createEmptyMessage()
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
const adminFooterLink = document.querySelector(".admin-footer__link");

function getTenantId() {
  return state.tenantId;
}

function tenantCollectionRef(collectionName) {
  return collection(db, "tenants", getTenantId(), collectionName);
}

function tenantDocRef(collectionName, documentId) {
  return doc(db, "tenants", getTenantId(), collectionName, documentId);
}

function tenantNestedDocRef(...segments) {
  return doc(db, "tenants", getTenantId(), ...segments);
}

function tenantNestedCollectionRef(...segments) {
  return collection(db, "tenants", getTenantId(), ...segments);
}

function createEmptyMessage() {
  return { text: "", tone: "" };
}

function createEmptyClientProfile() {
  return {
    colorActual: "",
    ultimoTratamiento: "",
    cambioColor: "",
    volumenAguaOxigenada: "",
    tratamientosAnteriores: "",
    tratamientosConFormolFecha: ""
  };
}

function createEmptyClientUiState() {
  return {
    searchQuery: "",
    detailClientId: "",
    detailProfile: null,
    detailTreatments: [],
    detailLoading: false,
    detailError: "",
    deletingClientId: ""
  };
}

function createEmptyInventoryUiState() {
  return {
    searchQuery: "",
    deletingId: ""
  };
}

function createEmptySalonUiState() {
  return {
    activeId: "",
    deletingId: "",
    togglingId: ""
  };
}

function createEmptyAdminAccessState() {
  return {
    admins: [],
    invites: [],
    loading: false,
    loaded: false,
    submitting: false
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

function toDateMillis(rawValue) {
  if (!rawValue) {
    return 0;
  }

  if (typeof rawValue?.toMillis === "function") {
    return rawValue.toMillis();
  }

  const dateValue = rawValue?.toDate ? rawValue.toDate() : new Date(rawValue);
  return Number.isNaN(dateValue.getTime()) ? 0 : dateValue.getTime();
}

function sortByMostRecent(items, fieldNames = ["updatedAt", "createdAt"]) {
  return [...items].sort((leftItem, rightItem) => {
    const leftDate = fieldNames.reduce((resolvedValue, fieldName) => (
      resolvedValue || toDateMillis(leftItem?.[fieldName])
    ), 0);
    const rightDate = fieldNames.reduce((resolvedValue, fieldName) => (
      resolvedValue || toDateMillis(rightItem?.[fieldName])
    ), 0);

    return rightDate - leftDate;
  });
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getInventoryQuantity(item) {
  return Number(item?.quantity || 0);
}

function filterInventoryItems(items, searchQuery) {
  const normalizedQuery = normalizeSearchText(searchQuery);

  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => normalizeSearchText(item?.name).includes(normalizedQuery));
}

function getFilteredStockItems() {
  return filterInventoryItems(state.stock, state.stockUi.searchQuery);
}

function getFilteredProductItems() {
  return filterInventoryItems(state.products, state.productUi.searchQuery);
}

function getInventorySummary(items) {
  return {
    totalProducts: items.length,
    zeroStock: items.filter((item) => getInventoryQuantity(item) === 0).length,
    lowStock: items.filter((item) => getInventoryQuantity(item) <= 3).length
  };
}

function getInventorySearchFeedback(allItems, filteredItems, searchQuery, emptyMessage, itemLabel = "productos") {
  const trimmedQuery = String(searchQuery || "").trim();
  const pluralLabel = allItems.length === 1 ? itemLabel.slice(0, -1) || itemLabel : itemLabel;

  if (!trimmedQuery) {
    return allItems.length === 0
      ? emptyMessage
      : `${allItems.length} ${allItems.length === 1 ? `${pluralLabel} disponible` : `${itemLabel} disponibles`} en esta seccion.`;
  }

  if (filteredItems.length === 0) {
    return `No encontramos coincidencias para "${trimmedQuery}".`;
  }

  return `Mostrando ${filteredItems.length} de ${allItems.length} ${itemLabel} para "${trimmedQuery}".`;
}

function getInventoryStatusTagClass(quantity) {
  if (quantity === 0) {
    return "is-cancelled";
  }

  if (quantity <= 3) {
    return "is-pending";
  }

  return "is-confirmed";
}

function buildInventorySummaryHtml(items, {
  totalLabel = "Productos cargados",
  zeroLabel = "Stock en cero",
  lowLabel = "Stock <= 3"
} = {}) {
  const summary = getInventorySummary(items);

  return `
    <article class="metric-card">
      <strong>${escapeHtml(summary.totalProducts)}</strong>
      <span>${escapeHtml(totalLabel)}</span>
    </article>
    <article class="metric-card">
      <strong>${escapeHtml(summary.zeroStock)}</strong>
      <span>${escapeHtml(zeroLabel)}</span>
    </article>
    <article class="metric-card">
      <strong>${escapeHtml(summary.lowStock)}</strong>
      <span>${escapeHtml(lowLabel)}</span>
    </article>
  `;
}

function buildProductImageHtml(item) {
  if (!item?.imageUrl) {
    return "";
  }

  return `
    <div class="stack-item__media">
      <img
        class="stack-item__image"
        src="${escapeHtml(item.imageUrl)}"
        alt="${escapeHtml(item.name || "Producto")}"
        loading="lazy"
      >
    </div>
  `;
}

function buildProductImagePreviewHtml(item) {
  if (item?.imageUrl) {
    return `
      <div class="image-preview-card">
        <img
          class="image-preview-card__image"
          src="${escapeHtml(item.imageUrl)}"
          alt="${escapeHtml(item.name || "Producto")}"
          loading="lazy"
        >
        <div>
          <strong>Imagen actual</strong>
          <p>Si eliges otra imagen, reemplazamos esta version en Storage.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="image-preview-card image-preview-card--empty">
      <strong>Sin imagen cargada</strong>
      <p>Puedes subir una foto para mostrar este producto tambien en la web publica.</p>
    </div>
  `;
}

function getSortedSalonMedia(items = state.salonMedia) {
  return [...items].sort((leftItem, rightItem) => {
    const sortOrderDiff = Number(leftItem?.sortOrder || 0) - Number(rightItem?.sortOrder || 0);

    if (sortOrderDiff !== 0) {
      return sortOrderDiff;
    }

    return toDateMillis(rightItem?.updatedAt || rightItem?.createdAt) - toDateMillis(leftItem?.updatedAt || leftItem?.createdAt);
  });
}

function resolveSalonMediaTitle(item, index = 0) {
  return item?.title?.trim() || `Imagen ${index + 1}`;
}

function getActiveSalonMedia(items = getSortedSalonMedia()) {
  if (items.length === 0) {
    state.salonUi.activeId = "";
    return null;
  }

  if (!items.some((item) => item.id === state.salonUi.activeId)) {
    state.salonUi.activeId = items[0].id;
  }

  return items.find((item) => item.id === state.salonUi.activeId) || items[0];
}

function buildSalonImagePreviewHtml(item) {
  if (item?.imageUrl) {
    return `
      <div class="image-preview-card">
        <img
          class="image-preview-card__image"
          src="${escapeHtml(item.imageUrl)}"
          alt="${escapeHtml(resolveSalonMediaTitle(item))}"
          loading="lazy"
        >
        <div>
          <strong>Imagen actual</strong>
          <p>Si eliges otra foto, reemplazamos esta version en Storage sin tocar el enlace visible.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="image-preview-card image-preview-card--empty">
      <strong>Sin imagen cargada</strong>
      <p>Sube una foto para mostrarla en el carrusel del salon de la web publica.</p>
    </div>
  `;
}

function buildSalonManagerCarouselHtml(items = getSortedSalonMedia()) {
  if (items.length === 0) {
    return `<article class="empty-state">Todavia no subiste fotos del salon.</article>`;
  }

  const activeItem = getActiveSalonMedia(items);
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeItem?.id));
  const isDeleting = state.salonUi.deletingId === activeItem?.id;
  const isToggling = state.salonUi.togglingId === activeItem?.id;
  const visibilityLabel = activeItem?.visible === false ? "Oculta en la web" : "Visible en la web";

  return `
    <article class="salon-manager-carousel">
      <div class="salon-manager-carousel__stage">
        ${items.length > 1 ? `
          <button class="salon-manager-carousel__nav" type="button" data-action="salon-prev" aria-label="Foto anterior">&lsaquo;</button>
        ` : ""}
        <img
          class="salon-manager-carousel__image"
          src="${escapeHtml(activeItem.imageUrl || "")}"
          alt="${escapeHtml(resolveSalonMediaTitle(activeItem, activeIndex))}"
          loading="lazy"
        >
        ${items.length > 1 ? `
          <button class="salon-manager-carousel__nav" type="button" data-action="salon-next" aria-label="Foto siguiente">&rsaquo;</button>
        ` : ""}
      </div>

      <div class="salon-manager-carousel__meta">
        <div>
          <strong>${escapeHtml(resolveSalonMediaTitle(activeItem, activeIndex))}</strong>
          <p>${escapeHtml(visibilityLabel)} - orden ${escapeHtml(Number(activeItem.sortOrder || 0) || activeIndex + 1)}</p>
        </div>
        <span class="card-chip">${escapeHtml(activeIndex + 1)} / ${escapeHtml(items.length)}</span>
      </div>

      <div class="salon-manager-carousel__actions">
        <button class="button button-tertiary button-compact" type="button" data-action="edit-salon-media" data-id="${escapeHtml(activeItem.id)}" ${isDeleting || isToggling ? "disabled" : ""}>Editar</button>
        <button class="button button-secondary button-compact" type="button" data-action="toggle-salon-media" data-id="${escapeHtml(activeItem.id)}" ${isDeleting || isToggling ? "disabled" : ""}>
          ${isToggling ? "Actualizando..." : (activeItem.visible === false ? "Mostrar" : "Ocultar")}
        </button>
        <button class="button button-danger button-compact" type="button" data-action="delete-salon-media" data-id="${escapeHtml(activeItem.id)}" ${isDeleting || isToggling ? "disabled" : ""}>
          ${isDeleting ? "Eliminando..." : "Eliminar"}
        </button>
      </div>

      <div class="salon-manager-carousel__thumbs">
        ${items.map((item, index) => `
          <button
            class="salon-manager-carousel__thumb ${item.id === activeItem.id ? "is-active" : ""}"
            type="button"
            data-action="select-salon-media"
            data-id="${escapeHtml(item.id)}"
            aria-label="Ver ${escapeHtml(resolveSalonMediaTitle(item, index))}"
          >
            <img src="${escapeHtml(item.imageUrl || "")}" alt="${escapeHtml(resolveSalonMediaTitle(item, index))}" loading="lazy">
          </button>
        `).join("")}
      </div>
    </article>
  `;
}

function humanizeFieldName(fieldName) {
  const friendlyLabels = {
    fullName: "Nombre completo",
    phone: "Telefono",
    phoneSearch: "Telefono normalizado",
    email: "Email",
    emailSearch: "Email normalizado",
    notes: "Notas",
    lastVisitAt: "Ultima visita",
    createdAt: "Creado",
    updatedAt: "Actualizado",
    adminId: "Admin principal",
    adminIds: "Admins asociados",
    source: "Origen",
    preferredArea: "Area preferida",
    colorActual: "Color",
    ultimoTratamiento: "Ultimo tratamiento",
    cambioColor: "Cambio de color",
    volumenAguaOxigenada: "Volumen de agua oxigenada",
    tratamientosAnteriores: "Tratamientos anteriores",
    tratamientosConFormolFecha: "Tratamientos con formol",
    mechas: "Mechas",
    tratamientosConFormol: "Tratamientos con formol",
    type: "Tipo",
    detail: "Detalle",
    date: "Fecha"
  };

  if (friendlyLabels[fieldName]) {
    return friendlyLabels[fieldName];
  }

  const words = String(fieldName || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "Campo";
}

function formatClientDetailValue(value) {
  if (value == null || value === "") {
    return "Sin dato";
  }

  if (typeof value?.toDate === "function" || value instanceof Date) {
    return formatDateTime(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((entry) => formatClientDetailValue(entry)).join(", ")
      : "Sin dato";
  }

  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00.000Z`));
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([fieldName, fieldValue]) => `${humanizeFieldName(fieldName)}: ${formatClientDetailValue(fieldValue)}`)
      .join(" | ");
  }

  return String(value);
}

function sortDetailEntries(data, preferredOrder = []) {
  const orderMap = new Map(preferredOrder.map((fieldName, index) => [fieldName, index]));

  return Object.entries(data || {}).sort(([leftKey], [rightKey]) => {
    const leftRank = orderMap.has(leftKey) ? orderMap.get(leftKey) : Number.MAX_SAFE_INTEGER;
    const rightRank = orderMap.has(rightKey) ? orderMap.get(rightKey) : Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return leftKey.localeCompare(rightKey);
  });
}

function buildDetailFieldsHtml(data, {
  emptyMessage = "No hay datos guardados para mostrar.",
  preferredOrder = [],
  hiddenFields = []
} = {}) {
  const hiddenFieldSet = new Set(["id", ...hiddenFields]);
  const entries = sortDetailEntries(data, preferredOrder).filter(([fieldName]) => !hiddenFieldSet.has(fieldName));

  if (entries.length === 0) {
    return `<p class="client-detail-empty">${escapeHtml(emptyMessage)}</p>`;
  }

  return `
    <dl class="client-detail-grid">
      ${entries.map(([fieldName, fieldValue]) => `
        <div class="client-detail-field">
          <dt>${escapeHtml(humanizeFieldName(fieldName))}</dt>
          <dd>${escapeHtml(formatClientDetailValue(fieldValue))}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function getFilteredClients() {
  const normalizedQuery = normalizeSearchText(state.clientUi.searchQuery);

  if (!normalizedQuery) {
    return state.clients;
  }

  return state.clients.filter((client) => (
    normalizeSearchText(client.fullName).includes(normalizedQuery)
  ));
}

function getClientSearchFeedback(items) {
  const trimmedQuery = state.clientUi.searchQuery.trim();

  if (!trimmedQuery) {
    return state.clients.length === 0
      ? "Todavia no hay clientes cargados para este negocio."
      : `${state.clients.length} ${state.clients.length === 1 ? "cliente disponible" : "clientes disponibles"} en tu base.`;
  }

  if (items.length === 0) {
    return `No encontramos clientes que coincidan con "${trimmedQuery}".`;
  }

  return `Mostrando ${items.length} de ${state.clients.length} clientes para "${trimmedQuery}".`;
}

function buildClientAvatarIconHtml() {
  return `
    <span class="client-list-card__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 2.2c-3.9 0-7 2-7 4.5V20h14v-1.1c0-2.5-3.1-4.5-7-4.5Z" fill="currentColor"/>
      </svg>
    </span>
  `;
}

function buildClientDirectoryHtml(items = getFilteredClients()) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(getClientSearchFeedback(items))}</article>`;
  }

  return items.map((client) => {
    const isDeleting = state.clientUi.deletingClientId === client.id;

    return `
    <article class="client-list-card">
      ${buildClientAvatarIconHtml()}
      <strong class="client-list-card__name">${escapeHtml(client.fullName || "Cliente sin nombre")}</strong>
      <div class="client-list-card__actions">
        <button class="button button-tertiary button-compact" type="button" data-action="edit-client" data-id="${escapeHtml(client.id)}" ${isDeleting ? "disabled" : ""}>Editar</button>
        <button class="button button-primary button-compact" type="button" data-action="view-client-detail" data-id="${escapeHtml(client.id)}" ${isDeleting ? "disabled" : ""}>Ver mas</button>
        <button class="button button-danger button-compact" type="button" data-action="delete-client" data-id="${escapeHtml(client.id)}" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Eliminando..." : "Eliminar"}</button>
      </div>
    </article>
  `;
  }).join("");
}

function getActiveClientDetail() {
  return state.clients.find((client) => client.id === state.clientUi.detailClientId) || null;
}

function buildClientTreatmentsHtml() {
  if (state.clientUi.detailLoading) {
    return `<p class="client-detail-state">Cargando historial y perfil del cliente...</p>`;
  }

  if (state.clientUi.detailTreatments.length === 0) {
    return `<p class="client-detail-empty">Todavia no hay tratamientos guardados para este cliente.</p>`;
  }

  return `
    <div class="client-treatment-list">
      ${state.clientUi.detailTreatments.map((treatment) => `
        <article class="client-treatment-card">
          <div class="client-treatment-card__header">
            <strong>${escapeHtml(treatment.type || treatment.detail || "Tratamiento")}</strong>
            <span class="card-chip">${escapeHtml(formatClientDetailValue(treatment.date || treatment.updatedAt || treatment.createdAt))}</span>
          </div>
          ${buildDetailFieldsHtml(treatment, {
            preferredOrder: ["type", "detail", "date", "notes", "updatedAt"]
          })}
        </article>
      `).join("")}
    </div>
  `;
}

function buildClientDetailModalHtml() {
  const client = getActiveClientDetail();

  if (!client || state.activeView !== "clientes") {
    return "";
  }

  const profileSection = state.clientUi.detailLoading
    ? `<p class="client-detail-state">Cargando datos complementarios...</p>`
    : buildDetailFieldsHtml(state.clientUi.detailProfile, {
      emptyMessage: "No hay datos adicionales guardados para este negocio.",
      preferredOrder: [
        "colorActual",
        "ultimoTratamiento",
        "cambioColor",
        "volumenAguaOxigenada",
        "tratamientosAnteriores",
        "tratamientosConFormolFecha",
        "tratamientosConFormol",
        "updatedAt"
      ]
    });

  return `
    <div class="client-detail-overlay" id="client-detail-overlay" role="presentation">
      <article class="client-detail-modal" role="dialog" aria-modal="true" aria-labelledby="client-detail-title">
        <button class="client-detail-close" id="client-detail-close" type="button" data-action="close-client-detail" aria-label="Cerrar detalle del cliente">X</button>
        <header class="client-detail-header">
          <div>
            <p class="eyebrow">Detalle del cliente</p>
            <h3 id="client-detail-title">${escapeHtml(client.fullName || "Cliente")}</h3>
            <p>Revisa toda la informacion guardada sin salir del panel.</p>
          </div>
          <span class="card-chip">${escapeHtml(client.lastVisitAt ? "Con historial" : "Registro nuevo")}</span>
        </header>

        ${state.clientUi.detailError ? `<p class="status-message is-warning client-detail-status">${escapeHtml(state.clientUi.detailError)}</p>` : ""}

        <section class="client-detail-section">
          <div class="client-detail-section__header">
            <h4>Ficha general</h4>
            <span class="card-chip">Principal</span>
          </div>
          ${buildDetailFieldsHtml(client, {
            preferredOrder: [
              "fullName",
              "phone",
              "email",
              "notes",
              "lastVisitAt",
              "source",
              "preferredArea",
              "createdAt",
              "updatedAt"
            ],
            hiddenFields: ["adminId", "adminIds", "phoneSearch", "emailSearch"]
          })}
        </section>

        <section class="client-detail-section">
          <div class="client-detail-section__header">
            <h4>Perfil del negocio</h4>
            <span class="card-chip">Extra</span>
          </div>
          ${profileSection}
        </section>

        <section class="client-detail-section">
          <div class="client-detail-section__header">
            <h4>Historial de tratamientos</h4>
            <span class="card-chip">${escapeHtml(String(state.clientUi.detailTreatments.length))}</span>
          </div>
          ${buildClientTreatmentsHtml()}
        </section>
      </article>
    </div>
  `;
}

function syncClientDetailOverlayState() {
  document.body.classList.toggle(
    "is-client-detail-open",
    state.activeView === "clientes" && Boolean(state.clientUi.detailClientId)
  );
}

function closeClientDetail({ rerender = true } = {}) {
  state.clientUi.detailClientId = "";
  state.clientUi.detailProfile = null;
  state.clientUi.detailTreatments = [];
  state.clientUi.detailLoading = false;
  state.clientUi.detailError = "";
  syncClientDetailOverlayState();

  if (rerender && state.activeView === "clientes") {
    refreshCurrentViewData();
  }
}

async function openClientDetail(clientId) {
  const client = state.clients.find((item) => item.id === clientId);

  if (!client) {
    return;
  }

  state.clientUi.detailClientId = clientId;
  state.clientUi.detailProfile = null;
  state.clientUi.detailTreatments = [];
  state.clientUi.detailLoading = true;
  state.clientUi.detailError = "";
  syncClientDetailOverlayState();
  refreshCurrentViewData();
  window.requestAnimationFrame(() => getViewElement("client-detail-close")?.focus());

  if (!db || !state.user) {
    state.clientUi.detailLoading = false;
    refreshCurrentViewData();
    return;
  }

  try {
    const profileRef = tenantNestedDocRef("clientes", clientId, "perfilesAdmin", state.user.uid);
    const treatmentsRef = tenantNestedCollectionRef("clientes", clientId, "perfilesAdmin", state.user.uid, "tratamientos");
    const [profileSnapshot, treatmentsSnapshot] = await Promise.all([
      getDoc(profileRef),
      getDocs(treatmentsRef)
    ]);

    if (state.clientUi.detailClientId !== clientId) {
      return;
    }

    state.clientUi.detailProfile = profileSnapshot.exists() ? profileSnapshot.data() : null;
    state.clientUi.detailTreatments = sortByMostRecent(treatmentsSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    })), ["date", "updatedAt", "createdAt"]);
  } catch (error) {
    console.error("[admin:client-detail] load failed", error);
    state.clientUi.detailError = "No pudimos cargar algunos datos extra de este cliente.";
  } finally {
    if (state.clientUi.detailClientId === clientId) {
      state.clientUi.detailLoading = false;
      refreshCurrentViewData();
    }
  }
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
  return state.profile?.displayName
    || state.profile?.businessName
    || state.tenantData?.businessName
    || state.user?.displayName
    || "Admin del negocio";
}

function resolveBusinessName() {
  return state.profile?.businessName || state.tenantData?.businessName || resolveAdminName();
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

function normalizeAdminEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hasAllowedManagerEmail() {
  const candidateEmails = [
    state.user?.email,
    state.profile?.email,
    state.profile?.emailNormalized
  ].map(normalizeAdminEmail);

  return candidateEmails.some((email) => ADMIN_ACCESS_MANAGER_EMAILS.has(email));
}

function canManageAdminAccess() {
  return hasPanelAccess() && (
    state.profile?.canManageAdminAccess === true
    || hasAllowedManagerEmail()
    || isNataliaBusiness(state.profile)
  );
}

function getVisibleNavItems() {
  return NAV_ITEMS.filter((item) => (
    (item.id !== "usuarios" && item.id !== "salon")
    || canManageAdminAccess()
  ));
}

function translateManagedAdminRole(role) {
  return MANAGED_ADMIN_ROLES.find((item) => item.id === role)?.label || role || "Sin rol";
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

function resolveTenantPublicUrl() {
  const customDomain = String(state.tenantData?.customDomain || "").trim();

  if (customDomain) {
    return `https://${customDomain.replace(/^https?:\/\//, "")}`;
  }

  if (!state.tenantId) {
    return "#";
  }

  const currentUrl = new URL(window.location.href);
  const publicHost = currentUrl.host.startsWith("admin.")
    ? currentUrl.host.replace(/^admin\./, "")
    : currentUrl.host;

  return `${currentUrl.protocol}//${publicHost}/${state.tenantId}`;
}

function applyTenantBranding() {
  const brandName = resolveBusinessName();
  document.title = `${brandName} Admin`;

  const titleNode = document.querySelector(".session-brand__title");
  const subtitleNode = document.querySelector(".session-brand__subtitle");
  const footerCopy = document.querySelector(".admin-footer__copy");

  if (titleNode) {
    titleNode.textContent = `${brandName} Admin`;
  }

  if (subtitleNode) {
    subtitleNode.textContent = state.tenantId ? `Panel del negocio - ${state.tenantId}` : "Panel del negocio";
  }

  if (footerCopy) {
    footerCopy.textContent = `${brandName} Admin`;
  }

  if (adminFooterLink) {
    adminFooterLink.href = resolveTenantPublicUrl();
    adminFooterLink.textContent = state.tenantId ? `Ir a /${state.tenantId}` : "Ir al sitio publico";
  }
}

async function loadTenantContext() {
  const tenantId = resolveAdminTenantId();

  if (!tenantId) {
    state.authResolved = true;
    setAccessBlocked("Negocio no encontrado o URL incompleta.", "error");
    return false;
  }

  if (!firebaseReady || !db) {
    state.authResolved = true;
    setAccessBlocked("No se pudo conectar con Firebase para cargar este negocio.", "error");
    return false;
  }

  try {
    const tenantSnapshot = await getDoc(doc(db, "tenants", tenantId));

    if (!tenantSnapshot.exists()) {
      state.authResolved = true;
      setAccessBlocked("No encontramos este negocio.", "error");
      return false;
    }

    const tenantData = tenantSnapshot.data() || {};

    if (tenantData.active !== true) {
      state.authResolved = true;
      setAccessBlocked("Este negocio esta inactivo.", "warning");
      return false;
    }

    if (tenantData.adminEnabled === false) {
      state.authResolved = true;
      setAccessBlocked("El panel admin de este negocio no esta habilitado.", "warning");
      return false;
    }

    state.tenantId = tenantId;
    state.tenantData = {
      id: tenantSnapshot.id,
      ...tenantData
    };
    applyTenantBranding();
    return true;
  } catch (error) {
    state.authResolved = true;
    setAccessBlocked("No pudimos cargar la configuracion de este negocio.", "error");
    return false;
  }
}

async function callAdminCallable(name, payload = {}) {
  if (!functions) {
    throw new Error("functions-not-ready");
  }

  const callable = httpsCallable(functions, name);
  const response = await callable({
    tenantId: getTenantId(),
    ...payload
  });
  return response.data || {};
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
  return viewRoot ? viewRoot.querySelector(`#${id}`) : null;
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

function explainRealtimeLoadError(subject, error) {
  const errorCode = String(error?.code || "").toLowerCase();

  if (errorCode === "permission-denied") {
    return `Tu cuenta no tiene permiso para cargar ${subject}.`;
  }

  if (errorCode === "failed-precondition") {
    return `Hace falta una configuracion de Firestore para cargar ${subject}.`;
  }

  if (errorCode === "unavailable") {
    return `No pudimos conectar con Firestore para cargar ${subject}.`;
  }

  return `No pudimos cargar ${subject}. Reintenta en unos segundos.`;
}

function reportRealtimeLoadError(scope, subject, error) {
  console.error(`[admin:${scope}] realtime load failed`, error);
  setScopedMessage(scope, explainRealtimeLoadError(subject, error), "error");
}

function syncBannerOffset() {
  window.requestAnimationFrame(() => {
    if (!topBanner) {
      return;
    }

    document.documentElement.style.setProperty("--banner-offset", `${topBanner.offsetHeight + 28}px`);
  });
}

function renderNavigation() {
  if (!sectionNav) {
    return;
  }

  sectionNav.innerHTML = getVisibleNavItems().map((item) => `
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


  sessionPanel?.classList.toggle("is-guest", guestMode);

  if (sessionBrand) {
    sessionBrand.hidden = false;
  }

  profileCluster?.classList.toggle("is-guest", guestMode);
  sessionActions?.classList.toggle("is-guest", guestMode);

  if (sessionHelper) {
    sessionHelper.hidden = guestMode;
    sessionHelper.dataset.tooltip = resolveSessionHelperText();
    sessionHelper.setAttribute("title", resolveSessionHelperText());
  }

  if (guestBanner) {
    guestBanner.hidden = !guestMode;
  }

  if (sectionNav) {
    sectionNav.hidden = !hasPanelAccess();
  }

  if (profileImage) {
    profileImage.src = resolveProfileImage();
    profileImage.alt = `Foto de perfil de ${currentName}`;
  }

  if (profileUploadTrigger) {
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
  }

  if (bannerAside) {
    bannerAside.hidden = !hasPanelAccess();
  }

  if (sessionAuthButton) {
    sessionAuthButton.hidden = !configured || !state.authResolved;
    sessionAuthButton.disabled = state.uploadingProfile || state.authBusy;
    sessionAuthButton.textContent = resolveSessionAuthButtonText(signedIn);
    sessionAuthButton.classList.toggle("button-primary", !signedIn);
    sessionAuthButton.classList.toggle("button-secondary", signedIn);
  }

  if (profileCluster) {
    profileCluster.hidden = !hasPanelAccess();
  }

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

  return items.map((item) => {
    const quantity = getInventoryQuantity(item);
    const isDeleting = state.stockUi.deletingId === item.id;

    return `
    <article class="stack-item">
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.brand || "Sin marca")} - ${escapeHtml(item.category || "Sin categoria")}</p>
        </div>
        <span class="tag ${getInventoryStatusTagClass(quantity)}">${escapeHtml(quantity)}</span>
      </div>
      <p>${escapeHtml(formatMoney(item.price || 0))} - actualizado ${escapeHtml(formatDateTime(item.updatedAt))}</p>
      ${showActions ? `
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="edit-stock" data-id="${escapeHtml(item.id)}" ${isDeleting ? "disabled" : ""}>Editar</button>
          <button class="button button-danger button-compact" type="button" data-action="delete-stock" data-id="${escapeHtml(item.id)}" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Eliminando..." : "Eliminar"}</button>
        </div>
      ` : ""}
    </article>
  `;
  }).join("");
}

function buildProductsHtml(items = state.products, { emptyMessage = "Todavia no hay productos cargados para venta.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((item) => {
    const quantity = getInventoryQuantity(item);
    const isDeleting = state.productUi.deletingId === item.id;

    return `
    <article class="stack-item stack-item--product">
      ${buildProductImageHtml(item)}
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.brand || "Sin marca")} - ${escapeHtml(item.category || "Sin categoria")}</p>
        </div>
        <span class="tag ${getInventoryStatusTagClass(quantity)}">${escapeHtml(quantity)}</span>
      </div>
      <p>${escapeHtml(formatMoney(item.price || 0))} - actualizado ${escapeHtml(formatDateTime(item.updatedAt))}</p>
      ${item.description ? `<p class="stack-item__description">${escapeHtml(item.description)}</p>` : ""}
      ${showActions ? `
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="edit-product" data-id="${escapeHtml(item.id)}" ${isDeleting ? "disabled" : ""}>Editar</button>
          <button class="button button-danger button-compact" type="button" data-action="delete-product" data-id="${escapeHtml(item.id)}" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Eliminando..." : "Eliminar"}</button>
        </div>
      ` : ""}
    </article>
  `;
  }).join("");
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
          <span>Color</span>
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
          <input id="natalia-volumen-oxidante" type="number" min="0" step="1" placeholder="Ej. 20">
        </label>

        <label>
          <span>Tratamientos anteriores</span>
          <input id="natalia-tratamientos-anteriores" type="text" placeholder="Ej. alisado, nutricion, keratina">
        </label>

        <label>
          <span>Tratamientos con formol</span>
          <input id="natalia-formol-fecha" type="date">
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
                <input id="client-phone-admin" type="tel" placeholder="Opcional">
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
            <span class="card-chip" id="client-list-count">Lista</span>
          </div>
          <form class="client-search-bar" id="client-search-form" role="search">
            <label class="client-search-bar__field" for="client-search-input">
              <span class="visually-hidden">Buscar clientes por nombre</span>
              <input id="client-search-input" type="search" value="${escapeHtml(state.clientUi.searchQuery)}" placeholder="Buscar clientes por nombre">
            </label>
            <button class="button button-primary" type="submit">Buscar</button>
          </form>
          <p class="client-search-feedback" id="client-search-feedback" aria-live="polite"></p>
          <div class="stack-list stack-list--clients" id="clients-list"></div>
        </article>
      </section>
      <div id="client-detail-root"></div>
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
          <div class="metrics-grid inventory-summary-grid" id="stock-summary"></div>
          <label class="inventory-search-bar">
            <span class="visually-hidden">Buscar stock por nombre</span>
            <input id="stock-search-input" type="search" placeholder="Buscar insumos o productos por nombre">
          </label>
          <p class="inventory-search-feedback" id="stock-search-feedback" aria-live="polite"></p>
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

              <label class="field-wide">
                <span>Descripcion</span>
                <textarea id="product-description" rows="4" placeholder="Texto visible en el panel y en la web publica."></textarea>
              </label>

              <label class="field-wide">
                <span>Imagen</span>
                <input id="product-image" type="file" accept="image/*">
              </label>

              <div class="field-wide" id="product-image-preview"></div>
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
          <div class="metrics-grid inventory-summary-grid" id="products-summary"></div>
          <label class="inventory-search-bar">
            <span class="visually-hidden">Buscar productos por nombre</span>
            <input id="product-search-input" type="search" placeholder="Buscar productos por nombre">
          </label>
          <p class="inventory-search-feedback" id="product-search-feedback" aria-live="polite"></p>
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

function renderSalonMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Salon",
      title: "Inicia sesion para gestionar la galeria del salon.",
      description: "Aca vas a subir fotos reales del espacio para mostrarlas en la web publica."
    });
  }

  if (!canManageAdminAccess()) {
    return renderLockedView({
      eyebrow: "Salon",
      title: "Esta seccion esta reservada para la administradora principal.",
      description: "Solo la cuenta principal puede decidir que imagenes del salon se muestran en la web publica."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Salon",
        title: "Galeria del salon.",
        description: "Sube fotos del local, ordénalas en el carrusel y decide cuales se muestran en la web publica.",
        chip: "Principal"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Carga</p>
              <h3 id="salon-form-title">Nueva imagen del salon</h3>
            </div>
            <span class="card-chip">Galeria</span>
          </div>
          <form class="editor-form" id="salon-form">
            <input id="salon-media-id" type="hidden">
            <div class="form-grid">
              <label>
                <span>Titulo</span>
                <input id="salon-title" type="text" placeholder="Ej. Sector de recepcion">
              </label>

              <label>
                <span>Orden en el carrusel</span>
                <input id="salon-sort-order" type="number" min="1" step="1" placeholder="1">
              </label>

              <label class="checkbox-field field-wide">
                <input id="salon-visible" type="checkbox" checked>
                <span>Mostrar esta imagen en la web publica</span>
              </label>

              <label class="field-wide">
                <span>Imagen</span>
                <input id="salon-image" type="file" accept="image/*">
              </label>

              <div class="field-wide" id="salon-image-preview"></div>
            </div>

            <div class="form-toolbar">
              <button class="button button-primary" id="salon-submit" type="submit">Guardar imagen</button>
              <button class="button button-secondary" id="salon-reset" type="button">Cancelar edicion</button>
              <p class="status-message" id="salon-message" aria-live="polite"></p>
            </div>
          </form>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Carrusel actual</p>
              <h3>Imagenes del local</h3>
            </div>
            <span class="card-chip" id="salon-list-count">${escapeHtml(state.salonMedia.length)} imagenes</span>
          </div>
          <p>Desde aqui puedes revisar como rota la galeria, ocultar una foto sin borrarla o reemplazarla cuando quieras.</p>
          <div id="salon-media-carousel"></div>
        </article>
      </section>
    </section>
  `;
}

function buildManagedAdminEntriesHtml() {
  if (state.adminAccess.loading) {
    return `<article class="empty-state">Cargando accesos del equipo...</article>`;
  }

  const items = [
    ...state.adminAccess.admins.map((admin) => ({
      ...admin,
      entryType: "admin"
    })),
    ...state.adminAccess.invites.map((invite) => ({
      ...invite,
      entryType: "invite"
    }))
  ].sort((leftItem, rightItem) => (
    toDateMillis(rightItem.updatedAt || rightItem.createdAt) - toDateMillis(leftItem.updatedAt || leftItem.createdAt)
  ));

  if (items.length === 0) {
    return `<article class="empty-state">Todavia no creaste usuarios para el equipo.</article>`;
  }

  return items.map((item) => {
    const isInvite = item.entryType === "invite";
    const badgeTone = isInvite ? "is-pending" : (item.active === false ? "is-cancelled" : "is-confirmed");
    const badgeText = isInvite ? "Pendiente" : (item.active === false ? "Pausado" : "Activo");
    const businessName = item.businessName || `Rockeala ${translateManagedAdminRole(item.role)}`;

    return `
      <article class="stack-item">
        <div class="stack-item__meta">
          <div>
            <strong>${escapeHtml(item.displayName || "Usuario del equipo")}</strong>
            <p>${escapeHtml(item.email || "Sin email")} - ${escapeHtml(translateManagedAdminRole(item.role))}</p>
          </div>
          <span class="tag ${badgeTone}">${escapeHtml(badgeText)}</span>
        </div>
        <p>${escapeHtml(businessName)} - ${escapeHtml(isInvite ? "Esperando primer ingreso con Google." : "Ya puede entrar al panel.")}</p>
        <div class="stack-item__notes">
          ${escapeHtml(isInvite ? "Invitado" : "Alta activa")} desde ${escapeHtml(formatDateTime(item.createdAt || item.updatedAt))}
        </div>
      </article>
    `;
  }).join("");
}

function renderUsersMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Usuarios",
      title: "Inicia sesion para administrar accesos.",
      description: "Desde aca Natalia puede crear usuarios del equipo y asignarles un rol."
    });
  }

  if (!canManageAdminAccess()) {
    return renderLockedView({
      eyebrow: "Usuarios",
      title: "Esta seccion esta reservada para la administradora principal.",
      description: "Solo Natalia puede crear accesos y asignar roles para otras personas del equipo."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Usuarios",
        title: "Usuarios y accesos del equipo.",
        description: "Crea usuarios para que entren al panel con Google y asignales un rol de trabajo.",
        chip: "Equipo"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Alta</p>
              <h3>Nuevo acceso</h3>
            </div>
            <span class="card-chip">Invitacion</span>
          </div>
          <form class="editor-form" id="team-form">
            <div class="form-grid">
              <label>
                <span>Nombre para mostrar</span>
                <input id="team-display-name" type="text" required placeholder="Ej. Carla Perez">
              </label>

              <label>
                <span>Email de Google</span>
                <input id="team-email" type="email" required placeholder="ejemplo@gmail.com">
              </label>

              <label>
                <span>Rol</span>
                <select id="team-role" required>
                  ${MANAGED_ADMIN_ROLES.map((roleOption) => `
                    <option value="${escapeHtml(roleOption.id)}">${escapeHtml(roleOption.label)}</option>
                  `).join("")}
                </select>
              </label>

              <label>
                <span>Negocio visible</span>
                <input id="team-business-name" type="text" placeholder="Opcional. Si lo dejas vacio usamos uno sugerido.">
              </label>
            </div>
            <p class="status-message" id="team-message"></p>
            <div class="form-toolbar">
              <button class="button button-primary" id="team-submit" type="submit" ${state.adminAccess.submitting ? "disabled" : ""}>
                ${state.adminAccess.submitting ? "Creando acceso..." : "Crear usuario"}
              </button>
            </div>
          </form>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Accesos creados</p>
              <h3>Equipo habilitado</h3>
            </div>
            <span class="card-chip" id="team-list-count">${escapeHtml(state.adminAccess.admins.length + state.adminAccess.invites.length)} accesos</span>
          </div>
          <p>Las personas invitadas deben entrar con Google usando exactamente el email cargado aca.</p>
          <div class="stack-list" id="team-list"></div>
        </article>
      </section>
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
    closeClientDetail({ rerender: false });
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
    case "salon":
      viewRoot.innerHTML = renderSalonMarkup();
      break;
    case "usuarios":
      viewRoot.innerHTML = renderUsersMarkup();
      break;
    case "dashboard":
    default:
      viewRoot.innerHTML = renderDashboardMarkup();
      break;
  }

  hydrateCurrentView();
  refreshCurrentViewData();
  syncClientDetailOverlayState();
  syncBannerOffset();
}

function refreshCurrentViewMessages() {
  applyMessageToElement(getViewElement("service-message"), state.messages.service);
  applyMessageToElement(getViewElement("client-message"), state.messages.client);
  applyMessageToElement(getViewElement("stock-message"), state.messages.stock);
  applyMessageToElement(getViewElement("product-message"), state.messages.product);
  applyMessageToElement(getViewElement("salon-message"), state.messages.salon);
  applyMessageToElement(getViewElement("team-message"), state.messages.team);
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
      const filteredClients = getFilteredClients();
      const clientsList = getViewElement("clients-list");
      const clientListCount = getViewElement("client-list-count");
      const clientSearchInput = getViewElement("client-search-input");
      const clientSearchFeedback = getViewElement("client-search-feedback");
      const clientDetailRoot = getViewElement("client-detail-root");

      if (state.clientUi.detailClientId && !state.clients.some((item) => item.id === state.clientUi.detailClientId)) {
        closeClientDetail({ rerender: false });
      }

      if (clientsList) {
        clientsList.innerHTML = buildClientDirectoryHtml(filteredClients);
      }

      if (clientListCount) {
        clientListCount.textContent = state.clientUi.searchQuery.trim()
          ? `${filteredClients.length} resultado${filteredClients.length === 1 ? "" : "s"}`
          : `${state.clients.length} cliente${state.clients.length === 1 ? "" : "s"}`;
      }

      if (clientSearchInput && clientSearchInput.value !== state.clientUi.searchQuery) {
        clientSearchInput.value = state.clientUi.searchQuery;
      }

      if (clientSearchFeedback) {
        clientSearchFeedback.textContent = getClientSearchFeedback(filteredClients);
      }

      if (clientDetailRoot) {
        clientDetailRoot.innerHTML = buildClientDetailModalHtml();
      }

      syncClientDetailOverlayState();
      break;
    }
    case "stock": {
      const stockList = getViewElement("stock-list");
      const stockSummary = getViewElement("stock-summary");
      const stockSearchInput = getViewElement("stock-search-input");
      const stockSearchFeedback = getViewElement("stock-search-feedback");
      const filteredStockItems = getFilteredStockItems();

      if (stockList) {
        stockList.innerHTML = buildStockHtml(filteredStockItems, {
          emptyMessage: state.stockUi.searchQuery.trim()
            ? "No hay resultados para la busqueda actual."
            : "Todavia no hay insumos o productos cargados."
        });
      }

      if (stockSummary) {
        stockSummary.innerHTML = buildInventorySummaryHtml(state.stock);
      }

      if (stockSearchInput) {
        stockSearchInput.value = state.stockUi.searchQuery;
      }

      if (stockSearchFeedback) {
        stockSearchFeedback.textContent = getInventorySearchFeedback(
          state.stock,
          filteredStockItems,
          state.stockUi.searchQuery,
          "Todavia no hay insumos o productos cargados.",
          "items"
        );
      }

      break;
    }
    case "productos": {
      const productsList = getViewElement("products-list");
      const productsSummary = getViewElement("products-summary");
      const productSearchInput = getViewElement("product-search-input");
      const productSearchFeedback = getViewElement("product-search-feedback");
      const filteredProductItems = getFilteredProductItems();

      if (productsList) {
        productsList.innerHTML = buildProductsHtml(filteredProductItems, {
          emptyMessage: state.productUi.searchQuery.trim()
            ? "No hay resultados para la busqueda actual."
            : "Todavia no hay productos cargados para venta."
        });
      }

      if (productsSummary) {
        productsSummary.innerHTML = buildInventorySummaryHtml(state.products);
      }

      if (productSearchInput) {
        productSearchInput.value = state.productUi.searchQuery;
      }

      if (productSearchFeedback) {
        productSearchFeedback.textContent = getInventorySearchFeedback(
          state.products,
          filteredProductItems,
          state.productUi.searchQuery,
          "Todavia no hay productos cargados para venta.",
          "productos"
        );
      }

      break;
    }
    case "salon": {
      const salonListCount = getViewElement("salon-list-count");
      const salonMediaCarousel = getViewElement("salon-media-carousel");
      const salonItems = getSortedSalonMedia();

      if (salonListCount) {
        salonListCount.textContent = `${salonItems.length} imagen${salonItems.length === 1 ? "" : "es"}`;
      }

      if (salonMediaCarousel) {
        salonMediaCarousel.innerHTML = buildSalonManagerCarouselHtml(salonItems);
      }

      break;
    }
    case "usuarios": {
      const teamList = getViewElement("team-list");
      const teamListCount = getViewElement("team-list-count");
      const teamSubmit = getViewElement("team-submit");

      if (teamList) {
        teamList.innerHTML = buildManagedAdminEntriesHtml();
      }

      if (teamListCount) {
        teamListCount.textContent = `${state.adminAccess.admins.length + state.adminAccess.invites.length} accesos`;
      }

      if (teamSubmit) {
        teamSubmit.disabled = state.adminAccess.submitting;
        teamSubmit.textContent = state.adminAccess.submitting ? "Creando acceso..." : "Crear usuario";
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
    case "salon":
      populateSalonForm();
      break;
    case "usuarios":
      if (canManageAdminAccess() && !state.adminAccess.loaded && !state.adminAccess.loading) {
        loadManagedAdminAccess();
      }
      break;
    default:
      syncClientDetailOverlayState();
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
  const nataliaPreviousTreatmentsInput = getViewElement("natalia-tratamientos-anteriores");
  const nataliaFormaldehydeDateInput = getViewElement("natalia-formol-fecha");

  if (nataliaColorInput && nataliaLastTreatmentInput && nataliaColorShiftInput && nataliaOxidantInput && nataliaPreviousTreatmentsInput && nataliaFormaldehydeDateInput) {
    nataliaColorInput.value = state.editor.clientProfile.colorActual || "";
    nataliaLastTreatmentInput.value = state.editor.clientProfile.ultimoTratamiento || "";
    nataliaColorShiftInput.value = state.editor.clientProfile.cambioColor || "";
    nataliaOxidantInput.value = state.editor.clientProfile.volumenAguaOxigenada ?? "";
    nataliaPreviousTreatmentsInput.value = state.editor.clientProfile.tratamientosAnteriores || "";
    nataliaFormaldehydeDateInput.value = state.editor.clientProfile.tratamientosConFormolFecha || "";
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
  const productDescriptionInput = getViewElement("product-description");
  const productImageInput = getViewElement("product-image");
  const productImagePreview = getViewElement("product-image-preview");
  const productFormTitle = getViewElement("product-form-title");
  const productSubmit = getViewElement("product-submit");

  if (!productIdInput || !productNameInput || !productPriceInput || !productQuantityInput || !productBrandInput || !productCategoryInput || !productDescriptionInput || !productImageInput || !productImagePreview || !productFormTitle || !productSubmit) {
    return;
  }

  productIdInput.value = item?.id || "";
  productNameInput.value = item?.name || "";
  productPriceInput.value = item ? Number(item.price || 0) : "";
  productQuantityInput.value = item ? Number(item.quantity || 0) : "";
  productBrandInput.value = item?.brand || "";
  productCategoryInput.value = item?.category || "";
  productDescriptionInput.value = item?.description || "";
  productImageInput.value = "";
  productImagePreview.innerHTML = buildProductImagePreviewHtml(item);
  productFormTitle.textContent = item ? `Editando ${item.name}` : "Nuevo producto";
  productSubmit.textContent = item ? "Actualizar producto" : "Guardar producto";
  applyMessageToElement(getViewElement("product-message"), state.messages.product);
}

function populateSalonForm() {
  const item = state.salonMedia.find((entry) => entry.id === state.editor.salonMediaId);
  const salonMediaIdInput = getViewElement("salon-media-id");
  const salonTitleInput = getViewElement("salon-title");
  const salonSortOrderInput = getViewElement("salon-sort-order");
  const salonVisibleInput = getViewElement("salon-visible");
  const salonImageInput = getViewElement("salon-image");
  const salonImagePreview = getViewElement("salon-image-preview");
  const salonFormTitle = getViewElement("salon-form-title");
  const salonSubmit = getViewElement("salon-submit");

  if (!salonMediaIdInput || !salonTitleInput || !salonSortOrderInput || !salonVisibleInput || !salonImageInput || !salonImagePreview || !salonFormTitle || !salonSubmit) {
    return;
  }

  salonMediaIdInput.value = item?.id || "";
  salonTitleInput.value = item?.title || "";
  salonSortOrderInput.value = item ? Number(item.sortOrder || 0) : "";
  salonVisibleInput.checked = item ? item.visible !== false : true;
  salonImageInput.value = "";
  salonImagePreview.innerHTML = buildSalonImagePreviewHtml(item);
  salonFormTitle.textContent = item ? `Editando ${resolveSalonMediaTitle(item)}` : "Nueva imagen del salon";
  salonSubmit.textContent = item ? "Actualizar imagen" : "Guardar imagen";
  applyMessageToElement(getViewElement("salon-message"), state.messages.salon);
}

function clearBusinessData() {
  state.services = [];
  state.appointments = [];
  state.clients = [];
  state.stock = [];
  state.products = [];
  state.salonMedia = [];
  state.stockUi = createEmptyInventoryUiState();
  state.productUi = createEmptyInventoryUiState();
  state.salonUi = createEmptySalonUiState();
  state.clientUi = createEmptyClientUiState();
  state.adminAccess = createEmptyAdminAccessState();
  state.messages.salon = createEmptyMessage();
  state.messages.team = createEmptyMessage();
  syncClientDetailOverlayState();
  resetServiceEditor({ preserveMessage: true });
  resetClientEditor({ preserveMessage: true });
  resetStockEditor({ preserveMessage: true });
  resetProductEditor({ preserveMessage: true });
  resetSalonEditor({ preserveMessage: true });
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

function resetSalonEditor({ preserveMessage = false } = {}) {
  state.editor.salonMediaId = "";

  if (!preserveMessage) {
    clearScopedMessage("salon");
  }

  if (state.activeView === "salon") {
    populateSalonForm();
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

async function claimManagedAdminAccess() {
  if (!state.user || !functions) {
    return false;
  }

  try {
    const response = await callAdminCallable("claimManagedAdminAccess");
    return response.claimed === true || response.alreadyActive === true;
  } catch (error) {
    console.error("[admin:team] claim access failed", error);
    return false;
  }
}

async function loadManagedAdminAccess(force = false) {
  if (!canManageAdminAccess() || !functions) {
    return;
  }

  if (state.adminAccess.loading || (state.adminAccess.loaded && !force)) {
    return;
  }

  state.adminAccess.loading = true;
  refreshCurrentViewData();

  try {
    const response = await callAdminCallable("listManagedAdminAccess");
    state.adminAccess.admins = Array.isArray(response.admins) ? response.admins : [];
    state.adminAccess.invites = Array.isArray(response.invites) ? response.invites : [];
    state.adminAccess.loaded = true;

    if (state.messages.team.tone === "error") {
      state.messages.team = createEmptyMessage();
    }
  } catch (error) {
    console.error("[admin:team] list access failed", error);
    setScopedMessage("team", "No pudimos cargar los usuarios del equipo. Reintenta en unos segundos.", "error");
  } finally {
    state.adminAccess.loading = false;
    refreshCurrentViewData();
  }
}

async function loadAdminProfile(user) {
  try {
    let adminSnapshot = await getDoc(tenantDocRef("admins", user.uid));

    if (!adminSnapshot.exists()) {
      const claimed = await claimManagedAdminAccess();

      if (claimed) {
        adminSnapshot = await getDoc(tenantDocRef("admins", user.uid));
      }
    }

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
    state.adminAccess = createEmptyAdminAccessState();
    state.messages.auth = { text: "Listo, ya puedes administrar tu negocio.", tone: "success" };
    applyTenantBranding();
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
    tenantCollectionRef("servicios"),
    where("adminId", "==", adminId),
    orderBy("sortOrder", "asc"),
    limit(30)
  );

  const appointmentsQuery = query(
    tenantCollectionRef("turnos"),
    where("adminId", "==", adminId),
    orderBy("requestedStartAt", "asc"),
    limit(20)
  );

  const clientsQuery = query(
    tenantCollectionRef("clientes"),
    where("adminId", "==", adminId)
  );

  const stockQuery = query(
    tenantCollectionRef("stock"),
    where("adminId", "==", adminId),
    orderBy("updatedAt", "desc")
  );

  const productsQuery = query(
    tenantCollectionRef("productos"),
    where("adminId", "==", adminId),
    orderBy("updatedAt", "desc")
  );

  const salonMediaQuery = query(
    tenantCollectionRef("salonMedia"),
    orderBy("updatedAt", "desc")
  );

  state.unsubscribers.push(
    onSnapshot(servicesQuery, (snapshot) => {
      state.services = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      refreshCurrentViewData();
    }, (error) => reportRealtimeLoadError("service", "tus servicios", error))
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
    }, (error) => reportRealtimeLoadError("auth", "tus turnos", error))
  );

  state.unsubscribers.push(
    onSnapshot(clientsQuery, (snapshot) => {
      state.clients = sortByMostRecent(snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      })));
      refreshCurrentViewData();
    }, (error) => reportRealtimeLoadError("client", "tus clientes", error))
  );

  state.unsubscribers.push(
    onSnapshot(stockQuery, (snapshot) => {
      state.stock = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      refreshCurrentViewData();
    }, (error) => reportRealtimeLoadError("stock", "el stock", error))
  );

  state.unsubscribers.push(
    onSnapshot(productsQuery, (snapshot) => {
      state.products = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      refreshCurrentViewData();
    }, (error) => reportRealtimeLoadError("product", "los productos", error))
  );

  if (canManageAdminAccess()) {
    state.unsubscribers.push(
      onSnapshot(salonMediaQuery, (snapshot) => {
        state.salonMedia = snapshot.docs.map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }));
        refreshCurrentViewData();
      }, (error) => reportRealtimeLoadError("salon", "las fotos del salon", error))
    );
  } else {
    state.salonMedia = [];
  }
}

function activateView(viewId, forceRender = false) {
  const declaredView = NAV_ITEMS.some((item) => item.id === viewId) ? viewId : "dashboard";
  const nextView = (declaredView === "usuarios" || declaredView === "salon") && !canManageAdminAccess()
    ? "dashboard"
    : declaredView;

  if (state.activeView === nextView && !forceRender) {
    return;
  }

  if (nextView !== "clientes" && state.clientUi.detailClientId) {
    closeClientDetail({ rerender: false });
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
    tenantId: getTenantId(),
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
      await setDoc(tenantDocRef("servicios", state.editor.serviceId), payload, { merge: true });
      setScopedMessage("service", "Servicio actualizado.", "success");
    } else {
      await addDoc(tenantCollectionRef("servicios"), {
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
  const fullName = clientFullNameInput.value.trim();

  if (!fullName) {
    setScopedMessage("client", "Ingresa al menos el nombre del cliente.", "error");
    clientFullNameInput.focus();
    return;
  }

  const phoneSearch = normalizePhone(clientPhoneInput.value);
  const emailSearch = clientEmailInput.value.trim().toLowerCase();
  const clientPayload = {
    tenantId: getTenantId(),
    fullName,
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
      await setDoc(tenantDocRef("clientes", clientId), {
        ...clientPayload,
        adminId: state.user.uid,
        adminIds: arrayUnion(state.user.uid)
      }, { merge: true });
    } else {
      const newClientRef = await addDoc(tenantCollectionRef("clientes"), {
        ...clientPayload,
        adminId: state.user.uid,
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
      const nataliaPreviousTreatmentsInput = getViewElement("natalia-tratamientos-anteriores");
      const nataliaFormaldehydeDateInput = getViewElement("natalia-formol-fecha");
      const profileRef = tenantNestedDocRef("clientes", clientId, "perfilesAdmin", state.user.uid);
      const oxidantValue = nataliaOxidantInput.value.trim();

      await setDoc(profileRef, {
        tenantId: getTenantId(),
        colorActual: nataliaColorInput.value.trim(),
        ultimoTratamiento: nataliaLastTreatmentInput.value.trim(),
        cambioColor: nataliaColorShiftInput.value.trim(),
        volumenAguaOxigenada: oxidantValue ? Number(oxidantValue) : null,
        tratamientosAnteriores: nataliaPreviousTreatmentsInput.value.trim(),
        tratamientosConFormolFecha: nataliaFormaldehydeDateInput.value || "",
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    setScopedMessage("client", state.editor.clientId ? "Cliente actualizado." : "Cliente creado.", "success");
    resetClientEditor({ preserveMessage: true });
  } catch (error) {
    setScopedMessage("client", "No se pudo guardar el cliente. Revisa los datos e intenta de nuevo.", "error");
  }
}

async function deleteClient(clientId) {
  if (!hasPanelAccess()) {
    setScopedMessage("client", "Inicia sesion antes de eliminar clientes.", "error");
    return;
  }

  const client = state.clients.find((item) => item.id === clientId);

  if (!client || state.clientUi.deletingClientId === clientId) {
    return;
  }

  const confirmed = window.confirm(`Vas a eliminar a ${client.fullName || "este cliente"} de forma permanente. Esta accion no se puede deshacer. Deseas continuar?`);

  if (!confirmed) {
    return;
  }

  state.clientUi.deletingClientId = clientId;
  setScopedMessage("client", `Eliminando ${client.fullName || "cliente"}...`, "warning");
  refreshCurrentViewData();

  try {
    const clientRef = tenantDocRef("clientes", clientId);
    const profileRef = tenantNestedDocRef("clientes", clientId, "perfilesAdmin", state.user.uid);
    const treatmentsRef = tenantNestedCollectionRef("clientes", clientId, "perfilesAdmin", state.user.uid, "tratamientos");
    const treatmentsSnapshot = await getDocs(treatmentsRef);

    await Promise.all(treatmentsSnapshot.docs.map((documentSnapshot) => deleteDoc(documentSnapshot.ref)));
    await deleteDoc(profileRef);
    await deleteDoc(clientRef);

    if (state.clientUi.detailClientId === clientId) {
      closeClientDetail({ rerender: false });
    }

    if (state.editor.clientId === clientId) {
      resetClientEditor({ preserveMessage: true });
    }

    setScopedMessage("client", `${client.fullName || "El cliente"} fue eliminado.`, "success");
  } catch (error) {
    console.error("[admin:client] delete failed", error);

    if (String(error?.code || "").toLowerCase() === "permission-denied") {
      setScopedMessage("client", "Tu cuenta no tiene permiso para eliminar este cliente.", "error");
    } else {
      setScopedMessage("client", "No se pudo eliminar el cliente. Intenta nuevamente en unos segundos.", "error");
    }
  } finally {
    if (state.clientUi.deletingClientId === clientId) {
      state.clientUi.deletingClientId = "";
    }

    refreshCurrentViewData();
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
    tenantId: getTenantId(),
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
      await setDoc(tenantDocRef("stock", state.editor.stockId), payload, { merge: true });
      setScopedMessage("stock", "Producto actualizado.", "success");
    } else {
      await addDoc(tenantCollectionRef("stock"), {
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

async function deleteStock(stockId) {
  if (!hasPanelAccess()) {
    setScopedMessage("stock", "Inicia sesion antes de eliminar stock.", "error");
    return;
  }

  const item = state.stock.find((entry) => entry.id === stockId);

  if (!item || state.stockUi.deletingId === stockId) {
    return;
  }

  const confirmed = window.confirm(`Vas a eliminar ${item.name || "este item"} del stock. Esta accion no se puede deshacer. Deseas continuar?`);

  if (!confirmed) {
    return;
  }

  state.stockUi.deletingId = stockId;
  setScopedMessage("stock", `Eliminando ${item.name || "item"}...`, "warning");
  refreshCurrentViewData();

  try {
    await deleteDoc(tenantDocRef("stock", stockId));

    if (state.editor.stockId === stockId) {
      resetStockEditor({ preserveMessage: true });
    }

    setScopedMessage("stock", `${item.name || "El item"} fue eliminado.`, "success");
  } catch (error) {
    console.error("[admin:stock] delete failed", error);
    setScopedMessage("stock", "No se pudo eliminar el item. Intenta nuevamente en unos segundos.", "error");
  } finally {
    if (state.stockUi.deletingId === stockId) {
      state.stockUi.deletingId = "";
    }

    refreshCurrentViewData();
  }
}

function explainProductImageError(error) {
  const raw = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();

  if (raw.includes("storage has not been set up") || raw.includes("no-default-bucket") || raw.includes("bucket")) {
    return "No se pudo subir la imagen porque Storage todavia no esta listo en Firebase.";
  }

  if (raw.includes("permission") || raw.includes("unauthorized")) {
    return "Tu cuenta no tiene permiso para subir imagenes para este producto.";
  }

  return "No se pudo subir la imagen del producto. Reintenta con otra foto.";
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
  const productDescriptionInput = getViewElement("product-description");
  const productImageInput = getViewElement("product-image");
  const productRef = state.editor.productId
    ? tenantDocRef("productos", state.editor.productId)
    : doc(tenantCollectionRef("productos"));

  const payload = {
    tenantId: getTenantId(),
    adminId: state.user.uid,
    name: productNameInput.value.trim(),
    quantity: Number(productQuantityInput.value || 0),
    price: Number(productPriceInput.value || 0),
    brand: productBrandInput.value.trim(),
    category: productCategoryInput.value.trim(),
    description: productDescriptionInput.value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    const selectedImage = productImageInput?.files?.[0];

    if (selectedImage) {
      if (!storage) {
        throw new Error("storage-not-ready");
      }

      if (!String(selectedImage.type || "").startsWith("image/")) {
        setScopedMessage("product", "El archivo seleccionado no es una imagen valida.", "error");
        return;
      }

      const webpFile = await convertImageFileToWebp(selectedImage);
      const storagePath = `tenants/${getTenantId()}/productos/${productRef.id}/cover.webp`;
      const imageRef = ref(storage, storagePath);

      await uploadBytes(imageRef, webpFile, {
        contentType: "image/webp",
        cacheControl: "public,max-age=3600"
      });

      payload.imageUrl = await getDownloadURL(imageRef);
      payload.imageStoragePath = storagePath;
    }

    if (state.editor.productId) {
      await setDoc(productRef, payload, { merge: true });
      setScopedMessage("product", "Producto actualizado.", "success");
    } else {
      await setDoc(productRef, {
        ...payload,
        createdAt: serverTimestamp()
      }, { merge: true });
      setScopedMessage("product", "Producto creado.", "success");
    }

    resetProductEditor({ preserveMessage: true });
  } catch (error) {
    console.error("[admin:product] save failed", error);

    if (`${error?.message || ""}`.includes("storage-not-ready")) {
      setScopedMessage("product", "Storage no esta disponible todavia para subir imagenes.", "error");
    } else if (productImageInput?.files?.[0]) {
      setScopedMessage("product", explainProductImageError(error), "error");
    } else {
      setScopedMessage("product", "No se pudo guardar el producto. Revisa los datos e intenta de nuevo.", "error");
    }
  }
}

async function deleteProduct(productId) {
  if (!hasPanelAccess()) {
    setScopedMessage("product", "Inicia sesion antes de eliminar productos.", "error");
    return;
  }

  const item = state.products.find((entry) => entry.id === productId);

  if (!item || state.productUi.deletingId === productId) {
    return;
  }

  const confirmed = window.confirm(`Vas a eliminar ${item.name || "este producto"} del catalogo. Esta accion no se puede deshacer. Deseas continuar?`);

  if (!confirmed) {
    return;
  }

  state.productUi.deletingId = productId;
  setScopedMessage("product", `Eliminando ${item.name || "producto"}...`, "warning");
  refreshCurrentViewData();

  try {
    if (item.imageStoragePath && storage) {
      try {
        await deleteObject(ref(storage, item.imageStoragePath));
      } catch (storageError) {
        const storageCode = String(storageError?.code || "").toLowerCase();

        if (!storageCode.includes("object-not-found")) {
          console.error("[admin:product] image delete failed", storageError);
        }
      }
    }

    await deleteDoc(tenantDocRef("productos", productId));

    if (state.editor.productId === productId) {
      resetProductEditor({ preserveMessage: true });
    }

    setScopedMessage("product", `${item.name || "El producto"} fue eliminado.`, "success");
  } catch (error) {
    console.error("[admin:product] delete failed", error);
    setScopedMessage("product", "No se pudo eliminar el producto. Intenta nuevamente en unos segundos.", "error");
  } finally {
    if (state.productUi.deletingId === productId) {
      state.productUi.deletingId = "";
    }

    refreshCurrentViewData();
  }
}

function explainSalonImageError(error) {
  const raw = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();

  if (raw.includes("storage has not been set up") || raw.includes("no-default-bucket") || raw.includes("bucket")) {
    return "No se pudo subir la imagen porque Storage todavia no esta listo en Firebase.";
  }

  if (raw.includes("permission") || raw.includes("unauthorized")) {
    return "Tu cuenta no tiene permiso para subir fotos del salon.";
  }

  return "No se pudo subir la imagen del salon. Reintenta con otra foto.";
}

async function saveSalonMedia(event) {
  event.preventDefault();

  if (!canManageAdminAccess()) {
    setScopedMessage("salon", "Solo la administradora principal puede guardar fotos del salon.", "error");
    return;
  }

  const salonTitleInput = getViewElement("salon-title");
  const salonSortOrderInput = getViewElement("salon-sort-order");
  const salonVisibleInput = getViewElement("salon-visible");
  const salonImageInput = getViewElement("salon-image");
  const currentItem = state.salonMedia.find((item) => item.id === state.editor.salonMediaId);
  const salonRef = state.editor.salonMediaId
    ? tenantDocRef("salonMedia", state.editor.salonMediaId)
    : doc(tenantCollectionRef("salonMedia"));
  const selectedImage = salonImageInput?.files?.[0];

  if (!currentItem && !selectedImage) {
    setScopedMessage("salon", "Sube una imagen antes de guardar la foto del salon.", "error");
    return;
  }

  const payload = {
    tenantId: getTenantId(),
    adminId: state.user.uid,
    title: salonTitleInput?.value.trim() || "",
    visible: salonVisibleInput?.checked !== false,
    sortOrder: Number(salonSortOrderInput?.value || getSortedSalonMedia().length + 1),
    updatedAt: serverTimestamp()
  };

  try {
    if (selectedImage) {
      if (!storage) {
        throw new Error("storage-not-ready");
      }

      if (!String(selectedImage.type || "").startsWith("image/")) {
        setScopedMessage("salon", "El archivo seleccionado no es una imagen valida.", "error");
        return;
      }

      const webpFile = await convertImageFileToWebp(selectedImage);
      const storagePath = `tenants/${getTenantId()}/salon/${salonRef.id}/slide.webp`;
      const imageRef = ref(storage, storagePath);

      await uploadBytes(imageRef, webpFile, {
        contentType: "image/webp",
        cacheControl: "public,max-age=3600"
      });

      payload.imageUrl = await getDownloadURL(imageRef);
      payload.imageStoragePath = storagePath;
    }

    if (state.editor.salonMediaId) {
      await setDoc(salonRef, payload, { merge: true });
      setScopedMessage("salon", "Imagen del salon actualizada.", "success");
    } else {
      await setDoc(salonRef, {
        ...payload,
        createdAt: serverTimestamp()
      }, { merge: true });
      state.salonUi.activeId = salonRef.id;
      setScopedMessage("salon", "Imagen del salon guardada.", "success");
    }

    resetSalonEditor({ preserveMessage: true });
  } catch (error) {
    console.error("[admin:salon] save failed", error);

    if (`${error?.message || ""}`.includes("storage-not-ready")) {
      setScopedMessage("salon", "Storage no esta disponible todavia para subir imagenes.", "error");
    } else if (selectedImage) {
      setScopedMessage("salon", explainSalonImageError(error), "error");
    } else {
      setScopedMessage("salon", "No se pudo guardar la imagen del salon. Revisa los datos e intenta de nuevo.", "error");
    }
  }
}

async function deleteSalonMedia(salonMediaId) {
  if (!canManageAdminAccess()) {
    setScopedMessage("salon", "Solo la administradora principal puede eliminar fotos del salon.", "error");
    return;
  }

  const item = state.salonMedia.find((entry) => entry.id === salonMediaId);

  if (!item || state.salonUi.deletingId === salonMediaId) {
    return;
  }

  const confirmed = window.confirm(`Vas a eliminar ${resolveSalonMediaTitle(item)} del carrusel del salon. Esta accion no se puede deshacer. Deseas continuar?`);

  if (!confirmed) {
    return;
  }

  state.salonUi.deletingId = salonMediaId;
  setScopedMessage("salon", `Eliminando ${resolveSalonMediaTitle(item)}...`, "warning");
  refreshCurrentViewData();

  try {
    if (item.imageStoragePath && storage) {
      try {
        await deleteObject(ref(storage, item.imageStoragePath));
      } catch (storageError) {
        const storageCode = String(storageError?.code || "").toLowerCase();

        if (!storageCode.includes("object-not-found")) {
          console.error("[admin:salon] image delete failed", storageError);
        }
      }
    }

    await deleteDoc(tenantDocRef("salonMedia", salonMediaId));

    if (state.editor.salonMediaId === salonMediaId) {
      resetSalonEditor({ preserveMessage: true });
    }

    if (state.salonUi.activeId === salonMediaId) {
      state.salonUi.activeId = "";
    }

    setScopedMessage("salon", `${resolveSalonMediaTitle(item)} fue eliminada.`, "success");
  } catch (error) {
    console.error("[admin:salon] delete failed", error);
    setScopedMessage("salon", "No se pudo eliminar la foto del salon. Intenta nuevamente en unos segundos.", "error");
  } finally {
    if (state.salonUi.deletingId === salonMediaId) {
      state.salonUi.deletingId = "";
    }

    refreshCurrentViewData();
  }
}

async function toggleSalonMediaVisibility(salonMediaId) {
  if (!canManageAdminAccess()) {
    setScopedMessage("salon", "Solo la administradora principal puede ocultar o mostrar fotos del salon.", "error");
    return;
  }

  const item = state.salonMedia.find((entry) => entry.id === salonMediaId);

  if (!item || state.salonUi.togglingId === salonMediaId) {
    return;
  }

  state.salonUi.togglingId = salonMediaId;
  setScopedMessage("salon", item.visible === false ? "Mostrando imagen en la web..." : "Ocultando imagen en la web...", "");
  refreshCurrentViewData();

  try {
    await updateDoc(tenantDocRef("salonMedia", salonMediaId), {
      visible: item.visible === false,
      updatedAt: serverTimestamp()
    });

    setScopedMessage("salon", item.visible === false ? "La imagen vuelve a mostrarse en la web publica." : "La imagen ya no se muestra en la web publica.", "success");
  } catch (error) {
    console.error("[admin:salon] toggle visibility failed", error);
    setScopedMessage("salon", "No se pudo actualizar la visibilidad de la imagen.", "error");
  } finally {
    if (state.salonUi.togglingId === salonMediaId) {
      state.salonUi.togglingId = "";
    }

    refreshCurrentViewData();
  }
}

function editSalonMedia(salonMediaId) {
  state.editor.salonMediaId = salonMediaId;
  state.salonUi.activeId = salonMediaId;
  const item = state.salonMedia.find((entry) => entry.id === salonMediaId);
  setScopedMessage("salon", item ? `Editando ${resolveSalonMediaTitle(item)}.` : "Editando imagen del salon.", "warning");
  populateSalonForm();
  getViewElement("salon-title")?.focus();
}

function selectSalonMedia(salonMediaId) {
  state.salonUi.activeId = salonMediaId;

  if (state.activeView === "salon") {
    refreshCurrentViewData();
  }
}

function shiftSalonCarousel(direction) {
  const items = getSortedSalonMedia();

  if (items.length <= 1) {
    return;
  }

  const activeItem = getActiveSalonMedia(items);
  const currentIndex = Math.max(0, items.findIndex((item) => item.id === activeItem?.id));
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  state.salonUi.activeId = items[nextIndex].id;
  refreshCurrentViewData();
}

async function createManagedAdminAccess(event) {
  event.preventDefault();

  if (!canManageAdminAccess()) {
    setScopedMessage("team", "Solo Natalia puede crear accesos para otros usuarios.", "error");
    return;
  }

  const displayNameInput = getViewElement("team-display-name");
  const emailInput = getViewElement("team-email");
  const roleInput = getViewElement("team-role");
  const businessNameInput = getViewElement("team-business-name");
  const displayName = displayNameInput?.value.trim() || "";
  const email = emailInput?.value.trim().toLowerCase() || "";
  const role = roleInput?.value || "";

  if (!displayName || !email || !role) {
    setScopedMessage("team", "Completa nombre, email y rol antes de crear el acceso.", "error");
    return;
  }

  state.adminAccess.submitting = true;
  setScopedMessage("team", "Creando acceso para el equipo...", "");
  refreshCurrentViewData();

  try {
    const response = await callAdminCallable("createManagedAdminAccess", {
      displayName,
      email,
      role,
      businessName: businessNameInput?.value.trim() || ""
    });

    setScopedMessage("team", response.message || "Acceso creado. La persona ya puede reclamarlo con Google.", "success");
    event.target.reset();
    state.adminAccess.loaded = false;
    await loadManagedAdminAccess(true);
  } catch (error) {
    console.error("[admin:team] create access failed", error);
    const errorCode = String(error?.code || "").toLowerCase();

    if (errorCode.includes("permission-denied")) {
      setScopedMessage("team", "Tu cuenta no tiene permiso para crear accesos.", "error");
    } else if (errorCode.includes("failed-precondition") || errorCode.includes("invalid-argument")) {
      setScopedMessage("team", error?.message || "Revisa los datos y vuelve a intentarlo.", "error");
    } else {
      setScopedMessage("team", "No pudimos crear el acceso. Reintenta en unos segundos.", "error");
    }
  } finally {
    state.adminAccess.submitting = false;
    refreshCurrentViewData();
  }
}

async function updateAppointmentStatus(appointmentId, status) {
  try {
    await updateDoc(tenantDocRef("turnos", appointmentId), {
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
  closeClientDetail({ rerender: false });
  state.editor.clientId = clientId;
  state.editor.clientProfile = createEmptyClientProfile();
  const client = state.clients.find((item) => item.id === clientId);

  if (isNataliaBusiness(state.profile)) {
    try {
      const profileSnapshot = await getDoc(tenantNestedDocRef("clientes", clientId, "perfilesAdmin", state.user.uid));

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
    const storagePath = `tenants/${getTenantId()}/admins/${state.user.uid}/profile/avatar.webp`;
    const imageRef = ref(storage, storagePath);

    await uploadBytes(imageRef, webpFile, {
      contentType: "image/webp",
      cacheControl: "public,max-age=3600"
    });

    const downloadUrl = await getDownloadURL(imageRef);

    await updateDoc(tenantDocRef("admins", state.user.uid), {
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

  if (event.target.classList.contains("client-detail-overlay")) {
    closeClientDetail();
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

    if (action === "view-client-detail" && id) {
      openClientDetail(id);
      return;
    }

    if (action === "delete-client" && id) {
      deleteClient(id);
      return;
    }

    if (action === "close-client-detail") {
      closeClientDetail();
      return;
    }

    if (action === "edit-stock" && id) {
      editStock(id);
      return;
    }

    if (action === "delete-stock" && id) {
      deleteStock(id);
      return;
    }

    if (action === "edit-product" && id) {
      editProduct(id);
      return;
    }

    if (action === "delete-product" && id) {
      deleteProduct(id);
      return;
    }

    if (action === "edit-salon-media" && id) {
      editSalonMedia(id);
      return;
    }

    if (action === "delete-salon-media" && id) {
      deleteSalonMedia(id);
      return;
    }

    if (action === "toggle-salon-media" && id) {
      toggleSalonMediaVisibility(id);
      return;
    }

    if (action === "select-salon-media" && id) {
      selectSalonMedia(id);
      return;
    }

    if (action === "salon-prev") {
      shiftSalonCarousel(-1);
      return;
    }

    if (action === "salon-next") {
      shiftSalonCarousel(1);
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
    return;
  }

  if (event.target.closest("#salon-reset")) {
    resetSalonEditor();
  }
}

function handleViewSubmit(event) {
  if (event.target.id === "client-search-form") {
    event.preventDefault();
    state.clientUi.searchQuery = getViewElement("client-search-input")?.value || "";
    refreshCurrentViewData();
    return;
  }

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
    return;
  }

  if (event.target.id === "salon-form") {
    saveSalonMedia(event);
    return;
  }

  if (event.target.id === "team-form") {
    createManagedAdminAccess(event);
  }
}

function handleViewInput(event) {
  if (event.target.id === "client-search-input") {
    state.clientUi.searchQuery = event.target.value || "";
    refreshCurrentViewData();
    return;
  }

  if (event.target.id === "stock-search-input") {
    state.stockUi.searchQuery = event.target.value || "";
    refreshCurrentViewData();
    return;
  }

  if (event.target.id === "product-search-input") {
    state.productUi.searchQuery = event.target.value || "";
    refreshCurrentViewData();
  }
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && state.clientUi.detailClientId) {
    closeClientDetail();
  }
}

function attachEvents() {
  sessionAuthButton.addEventListener("click", handleSessionAuthAction);
  profileUploadTrigger.addEventListener("click", () => profileUploadInput.click());
  profileUploadInput.addEventListener("change", handleProfileUpload);
  sectionNav.addEventListener("click", handleNavClick);
  viewRoot.addEventListener("click", handleViewClick);
  viewRoot.addEventListener("input", handleViewInput);
  viewRoot.addEventListener("submit", handleViewSubmit);
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("resize", syncBannerOffset);
  window.addEventListener("hashchange", () => activateView(resolveInitialView(), true));
}

async function bootstrapAuth() {
  const tenantReady = await loadTenantContext();

  renderNavigation();
  renderBannerState();
  renderActiveView();

  if (!tenantReady) {
    return;
  }

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
