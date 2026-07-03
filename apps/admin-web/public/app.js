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
  { id: "usuarios", label: "Usuarios" },
  { id: "configuraciones", label: "Configuraciones" }
];
const MANAGED_ADMIN_ROLES = [
  { id: "peluqueria", label: "Peluqueria" },
  { id: "manicura", label: "Manicura" },
  { id: "depilacion", label: "Depilacion" },
  { id: "barberia", label: "Barberia" }
];
const ADMIN_ACCESS_MANAGER_EMAILS = new Set([
  "37adrian38@gmail.com",
  "nataliasoledadromero27@gmail.com"
]);
const TENANT_STORAGE_KEY = "agendasimple.admin.tenantId";
const TOAST_AUTO_DISMISS_MS = 4200;
const APPOINTMENT_WEEK_START_DAY = 2;
const APPOINTMENT_WEEK_DAY_COUNT = 5;
const APPOINTMENT_DAY_START_HOUR = 10;
const APPOINTMENT_DAY_END_HOUR = 20;
const APPOINTMENT_HOUR_ROW_HEIGHT = 78;
const APPOINTMENT_THEME_PALETTE = [
  { color: "rgba(189, 68, 57, 0.94)", background: "rgba(189, 68, 57, 0.18)" },
  { color: "rgba(43, 122, 120, 0.94)", background: "rgba(43, 122, 120, 0.18)" },
  { color: "rgba(194, 141, 31, 0.94)", background: "rgba(194, 141, 31, 0.18)" },
  { color: "rgba(108, 77, 173, 0.94)", background: "rgba(108, 77, 173, 0.18)" },
  { color: "rgba(33, 97, 166, 0.94)", background: "rgba(33, 97, 166, 0.18)" }
];

const state = {
  tenantId: "",
  tenantData: null,
  tenantRoles: [],
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
  appointmentUi: createEmptyAppointmentUiState(),
  unsubscribers: [],
  subscribedAdminId: null,
  activeView: resolveInitialView(),
  uploadingProfile: false,
  authBusy: false,
  clientUi: createEmptyClientUiState(),
  adminAccess: createEmptyAdminAccessState(),
  settingsUi: createEmptySettingsUiState(),
  editor: {
    serviceId: "",
    clientId: "",
    stockId: "",
    productId: "",
    salonMediaId: "",
    teamEntryId: "",
    teamEntryType: "",
    tenantRoleId: "",
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
    team: createEmptyMessage(),
    settings: createEmptyMessage(),
    roles: createEmptyMessage()
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
const toastDismissTimers = {
  auth: 0,
  profile: 0
};
const panelDomReady = Boolean(
  sessionAuthButton
  && profileUploadTrigger
  && profileUploadInput
  && sectionNav
  && viewRoot
);

function debugLog(event, payload = {}) {
  console.info("[admin-panel]", event, payload);
}

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

function createEmptyAppointmentUiState() {
  return {
    selectedProfessionalId: "all",
    detailAppointmentId: "",
    detailFeedback: ""
  };
}

function createEmptyAdminAccessState() {
  return {
    admins: [],
    invites: [],
    loading: false,
    loaded: false,
    submitting: false,
    actionId: ""
  };
}

function createEmptySettingsUiState() {
  return {
    saving: false,
    roleSubmitting: false,
    roleDeletingId: ""
  };
}

function resolveInitialView() {
  const hashView = String(window.location.hash || "").replace("#", "").trim();
  return NAV_ITEMS.some((item) => item.id === hashView) ? hashView : "dashboard";
}

function normalizeTenantRoleEntry(roleEntry) {
  if (!roleEntry) {
    return null;
  }

  const roleId = slugify(typeof roleEntry === "string" ? roleEntry : (roleEntry.id || roleEntry.label || ""));
  const roleLabel = String(typeof roleEntry === "string" ? roleEntry : (roleEntry.label || roleEntry.id || "")).trim();

  if (!roleId || !roleLabel) {
    return null;
  }

  return {
    id: roleId,
    label: roleLabel
  };
}

function getTenantRolesFromData(tenantData = {}) {
  const rawRoles = Array.isArray(tenantData.roles) ? tenantData.roles : [];
  const normalizedRoles = rawRoles
    .map(normalizeTenantRoleEntry)
    .filter(Boolean)
    .filter((roleEntry, index, roleEntries) => roleEntries.findIndex((candidate) => candidate.id === roleEntry.id) === index)
    .sort((leftRole, rightRole) => leftRole.label.localeCompare(rightRole.label, "es"));

  if (normalizedRoles.length > 0) {
    return normalizedRoles;
  }

  return [...MANAGED_ADMIN_ROLES];
}

function syncTenantRolesFromTenantData() {
  state.tenantRoles = getTenantRolesFromData(state.tenantData || {});
}

function getAvailableManagedAdminRoles() {
  return state.tenantRoles.length ? state.tenantRoles : [...MANAGED_ADMIN_ROLES];
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
    timeZone: resolveTenantTimeZone(),
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

function resolveTenantTimeZone() {
  return state.tenantData?.timezone || "America/Argentina/Buenos_Aires";
}

function toTenantDate(rawValue) {
  if (!rawValue) {
    return null;
  }

  const sourceDate = rawValue?.toDate ? rawValue.toDate() : new Date(rawValue);

  if (Number.isNaN(sourceDate.getTime())) {
    return null;
  }

  try {
    return new Date(sourceDate.toLocaleString("en-US", { timeZone: resolveTenantTimeZone() }));
  } catch (_error) {
    return new Date(sourceDate.getTime());
  }
}

function capitalizeSentence(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function getDateKeyFromDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return "";
  }

  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAppointmentDateKey(rawValue) {
  const dateValue = toTenantDate(rawValue);
  return dateValue ? getDateKeyFromDate(dateValue) : "";
}

function getAppointmentMinutesInDay(rawValue) {
  const dateValue = toTenantDate(rawValue);

  if (!dateValue) {
    return 0;
  }

  return dateValue.getHours() * 60 + dateValue.getMinutes();
}

function getAppointmentWeekStart(referenceDate) {
  const resolvedDate = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date();
  resolvedDate.setHours(0, 0, 0, 0);
  const diff = (resolvedDate.getDay() + 7 - APPOINTMENT_WEEK_START_DAY) % 7;
  resolvedDate.setDate(resolvedDate.getDate() - diff);
  return resolvedDate;
}

function buildAppointmentWeekDays(referenceDate) {
  const weekStart = getAppointmentWeekStart(referenceDate);

  return Array.from({ length: APPOINTMENT_WEEK_DAY_COUNT }, (_, index) => {
    const dateValue = new Date(weekStart.getTime());
    dateValue.setDate(weekStart.getDate() + index);

    return {
      key: getDateKeyFromDate(dateValue),
      date: dateValue,
      dayName: capitalizeSentence(new Intl.DateTimeFormat("es-AR", {
        weekday: "long"
      }).format(dateValue)),
      shortLabel: capitalizeSentence(new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "short"
      }).format(dateValue)),
      fullLabel: capitalizeSentence(new Intl.DateTimeFormat("es-AR", {
        weekday: "long",
        day: "2-digit",
        month: "short"
      }).format(dateValue))
    };
  });
}

function formatAppointmentWeekRange(days = []) {
  if (!days.length) {
    return "Semana actual";
  }

  const firstDay = days[0]?.date;
  const lastDay = days[days.length - 1]?.date;

  if (!(firstDay instanceof Date) || Number.isNaN(firstDay.getTime()) || !(lastDay instanceof Date) || Number.isNaN(lastDay.getTime())) {
    return "Semana actual";
  }

  return `${capitalizeSentence(new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short"
  }).format(firstDay))} al ${capitalizeSentence(new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short"
  }).format(lastDay))}`;
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

function parseTimeInputToMinutes(rawValue) {
  const [hours, minutes] = String(rawValue || "").split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function formatMinutesForTimeInput(rawValue) {
  const minutes = Number(rawValue);

  if (!Number.isFinite(minutes) || minutes < 0) {
    return "";
  }

  const resolvedHours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const resolvedMinutes = String(minutes % 60).padStart(2, "0");
  return `${resolvedHours}:${resolvedMinutes}`;
}

function normalizeServiceSpecialSchedule(rawSchedule = []) {
  return (Array.isArray(rawSchedule) ? rawSchedule : [])
    .map((entry) => {
      const dateKey = String(entry?.dateKey || "").trim();
      const startMinutes = Number(entry?.startMinutes);
      const endMinutes = Number(entry?.endMinutes);

      if (!dateKey || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes < 0 || endMinutes > 1440 || startMinutes >= endMinutes) {
        return null;
      }

      return {
        dateKey,
        startMinutes,
        endMinutes
      };
    })
    .filter(Boolean)
    .sort((leftEntry, rightEntry) => (
      leftEntry.dateKey.localeCompare(rightEntry.dateKey, "es")
      || leftEntry.startMinutes - rightEntry.startMinutes
      || leftEntry.endMinutes - rightEntry.endMinutes
    ));
}

function buildServiceImagePreviewHtml(item) {
  if (item?.imageUrl) {
    return `
      <div class="image-preview-card">
        <img
          class="image-preview-card__image"
          src="${escapeHtml(item.imageUrl)}"
          alt="${escapeHtml(item.name || "Servicio")}"
          loading="lazy"
        >
        <div>
          <strong>Imagen actual</strong>
          <p>La guardamos para usarla mas adelante cuando abramos el detalle del servicio en la web publica.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="image-preview-card image-preview-card--empty">
      <strong>Sin imagen cargada</strong>
      <p>Puedes subirla ahora aunque todavia no se renderice en la web publica.</p>
    </div>
  `;
}

function formatServiceSpecialScheduleSummary(service) {
  if (service?.isSpecial !== true) {
    return "Agenda regular del profesional.";
  }

  const schedule = normalizeServiceSpecialSchedule(service?.specialSchedule);

  if (!schedule.length) {
    return "Servicio especial sin fechas definidas.";
  }

  const uniqueDates = new Set(schedule.map((entry) => entry.dateKey)).size;
  const firstWindow = schedule[0];
  return `${uniqueDates} ${uniqueDates === 1 ? "fecha habilitada" : "fechas habilitadas"} desde ${firstWindow.dateKey}.`;
}

function buildServiceSpecialWindowRowHtml(windowEntry = {}) {
  return `
    <div class="service-special-window">
      <label>
        <span>Fecha</span>
        <input class="service-special-window__date" type="date" value="${escapeHtml(windowEntry.dateKey || "")}">
      </label>
      <label>
        <span>Desde</span>
        <input class="service-special-window__start" type="time" step="1800" value="${escapeHtml(formatMinutesForTimeInput(windowEntry.startMinutes))}">
      </label>
      <label>
        <span>Hasta</span>
        <input class="service-special-window__end" type="time" step="1800" value="${escapeHtml(formatMinutesForTimeInput(windowEntry.endMinutes))}">
      </label>
      <button class="button button-secondary button-compact service-special-window__remove" type="button" data-action="remove-service-special-window">Quitar</button>
    </div>
  `;
}

function renderServiceSpecialScheduleEditor(entries = []) {
  const container = getViewElement("service-special-windows");

  if (!container) {
    return;
  }

  const normalizedEntries = normalizeServiceSpecialSchedule(entries);
  container.innerHTML = normalizedEntries.length
    ? normalizedEntries.map((entry) => buildServiceSpecialWindowRowHtml(entry)).join("")
    : `<p class="service-special-empty">Agrega al menos una fecha con rango horario para este servicio especial.</p>`;
}

function addServiceSpecialWindowRow(entry = {}) {
  const container = getViewElement("service-special-windows");

  if (!container) {
    return;
  }

  const emptyState = container.querySelector(".service-special-empty");

  if (emptyState) {
    emptyState.remove();
  }

  container.insertAdjacentHTML("beforeend", buildServiceSpecialWindowRowHtml(entry));
}

function syncServiceSpecialFieldsVisibility() {
  const serviceIsSpecialInput = getViewElement("service-is-special");
  const serviceSpecialSettings = getViewElement("service-special-settings");
  const serviceSpecialWindows = getViewElement("service-special-windows");

  if (!serviceIsSpecialInput || !serviceSpecialSettings || !serviceSpecialWindows) {
    return;
  }

  const isSpecial = serviceIsSpecialInput.checked;
  serviceSpecialSettings.hidden = !isSpecial;

  if (isSpecial && !serviceSpecialWindows.querySelector(".service-special-window")) {
    addServiceSpecialWindowRow();
  }
}

function collectServiceSpecialSchedule() {
  const rows = [...document.querySelectorAll(".service-special-window")];
  const entries = rows.map((row, index) => {
    const dateKey = row.querySelector(".service-special-window__date")?.value || "";
    const startMinutes = parseTimeInputToMinutes(row.querySelector(".service-special-window__start")?.value);
    const endMinutes = parseTimeInputToMinutes(row.querySelector(".service-special-window__end")?.value);

    if (!dateKey || startMinutes === null || endMinutes === null) {
      throw new Error(`Completa fecha, hora de inicio y hora de fin en la fila ${index + 1}.`);
    }

    if (startMinutes >= endMinutes) {
      throw new Error(`La hora de fin debe ser posterior a la de inicio en la fila ${index + 1}.`);
    }

    return {
      dateKey,
      startMinutes,
      endMinutes
    };
  }).sort((leftEntry, rightEntry) => (
    leftEntry.dateKey.localeCompare(rightEntry.dateKey, "es")
    || leftEntry.startMinutes - rightEntry.startMinutes
    || leftEntry.endMinutes - rightEntry.endMinutes
  ));

  entries.forEach((entry, index) => {
    const nextEntry = entries[index + 1];

    if (nextEntry && nextEntry.dateKey === entry.dateKey && nextEntry.startMinutes < entry.endMinutes) {
      throw new Error(`Hay rangos horarios superpuestos el ${entry.dateKey}. Ajusta las franjas antes de guardar.`);
    }
  });

  return entries;
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
    || ["owner", "admin"].includes(String(state.profile?.membershipRole || "").toLowerCase())
    || hasAllowedManagerEmail()
    || isNataliaBusiness(state.profile)
  );
}

function getVisibleNavItems() {
  return NAV_ITEMS.filter((item) => (
    !["usuarios", "salon", "configuraciones"].includes(item.id)
    || canManageAdminAccess()
  ));
}

function translateManagedAdminRole(role) {
  return getAvailableManagedAdminRoles().find((item) => item.id === role)?.label || role || "Sin rol";
}

function translateMembershipRole(role) {
  const normalizedRole = String(role || "").toLowerCase();

  if (normalizedRole === "owner") {
    return "Owner";
  }

  if (normalizedRole === "admin") {
    return "Admin";
  }

  if (normalizedRole === "professional") {
    return "Profesional";
  }

  return role || "Sin perfil";
}

function findManagedAdminEntry(entryId = state.editor.teamEntryId, entryType = state.editor.teamEntryType) {
  const sourceItems = entryType === "invite" ? state.adminAccess.invites : state.adminAccess.admins;
  return sourceItems.find((item) => item.id === entryId) || null;
}

function isEditingManagedAdminEntry() {
  return Boolean(state.editor.teamEntryId && state.editor.teamEntryType);
}

function canManageTargetAdmin(item) {
  return item
    && item.entryType === "admin"
    && item.membershipRole !== "owner"
    && item.id !== state.user?.uid;
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

  return "Inicia sesion desde admin-web para administrar tu negocio.";
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
    web: "Web",
    "public-web": "Web publica"
  };

  return sources[source] || source || "Sin origen";
}

function resolveTenantPublicUrl() {
  if (!state.tenantId) {
    return "https://agendasimple-public.web.app/";
  }

  const currentUrl = new URL(window.location.href);
  let publicHost = currentUrl.host;

  if (publicHost === "rockeala-admin.web.app" || publicHost === "agendasimple-admin.web.app") {
    publicHost = "agendasimple-public.web.app";
  } else if (publicHost.startsWith("admin.")) {
    publicHost = publicHost.replace(/^admin\./, "");
  }

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

function applyTenantSnapshot(tenantId, tenantData) {
  state.tenantId = tenantId;
  state.tenantData = {
    id: tenantId,
    ...tenantData
  };
  syncTenantRolesFromTenantData();
  localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
}

async function refreshTenantContext() {
  if (!state.tenantId || !firebaseReady || !db) {
    return false;
  }

  const tenantSnapshot = await getDoc(doc(db, "tenants", state.tenantId));

  if (!tenantSnapshot.exists()) {
    throw new Error("tenant-not-found");
  }

  applyTenantSnapshot(tenantSnapshot.id, tenantSnapshot.data() || {});
  applyTenantBranding();
  return true;
}

async function loadTenantContext() {
  const tenantId = resolveAdminTenantId();
  debugLog("load-tenant-context-start", {
    pathname: window.location.pathname,
    search: window.location.search,
    tenantId
  });

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

    applyTenantSnapshot(tenantId, tenantData);
    debugLog("load-tenant-context-success", {
      tenantId,
      adminEnabled: tenantData.adminEnabled !== false,
      active: tenantData.active === true
    });
    applyTenantBranding();
    return true;
  } catch (error) {
    debugLog("load-tenant-context-error", {
      tenantId,
      code: error?.code || "",
      message: error?.message || ""
    });
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

function syncTurnosWeekFocus() {
  if (state.activeView !== "turnos" || !window.matchMedia("(max-width: 760px)").matches) {
    return;
  }

  const currentDayColumn = viewRoot?.querySelector(".day-column.is-current");

  if (!currentDayColumn) {
    return;
  }

  window.requestAnimationFrame(() => {
    currentDayColumn.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "center"
    });
  });
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

function clearToastDismissTimer(scope) {
  if (!toastDismissTimers[scope]) {
    return;
  }

  window.clearTimeout(toastDismissTimers[scope]);
  toastDismissTimers[scope] = 0;
}

function shouldAutoDismissToast(scope, text = "") {
  if (!text || !["auth", "profile"].includes(scope)) {
    return false;
  }

  return hasPanelAccess();
}

function scheduleToastDismiss(scope, text = "") {
  clearToastDismissTimer(scope);

  if (!shouldAutoDismissToast(scope, text)) {
    return;
  }

  toastDismissTimers[scope] = window.setTimeout(() => {
    if (state.messages[scope]?.text !== text) {
      return;
    }

    state.messages[scope] = createEmptyMessage();
    renderBannerState();
  }, TOAST_AUTO_DISMISS_MS);
}

function setScopedMessage(scope, text = "", tone = "") {
  state.messages[scope] = { text, tone };

  if (scope === "auth" || scope === "profile") {
    if (!text) {
      clearToastDismissTimer(scope);
    } else {
      scheduleToastDismiss(scope, text);
    }

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

function resolveAdminDisplayName(adminId) {
  if (!adminId) {
    return "";
  }

  if (state.profile?.id === adminId) {
    return resolveAdminName();
  }

  return state.adminAccess.admins.find((admin) => admin.id === adminId)?.displayName || "";
}

function formatAppointmentTime(rawValue) {
  if (!rawValue) {
    return "--:--";
  }

  const dateValue = rawValue?.toDate ? rawValue.toDate() : new Date(rawValue);

  if (Number.isNaN(dateValue.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: resolveTenantTimeZone(),
    hour: "2-digit",
    minute: "2-digit"
  }).format(dateValue);
}

function formatAppointmentDay(rawValue) {
  if (!rawValue) {
    return "Sin fecha";
  }

  const dateValue = rawValue?.toDate ? rawValue.toDate() : new Date(rawValue);

  if (Number.isNaN(dateValue.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: resolveTenantTimeZone(),
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(dateValue);
}

function getAppointmentCardClass(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "cancelled") {
    return "is-cancelled";
  }

  if (normalizedStatus === "completed") {
    return "is-completed";
  }

  if (normalizedStatus === "confirmed") {
    return "is-confirmed";
  }

  return "is-pending";
}

function buildAppointmentActionsHtml(appointment) {
  const appointmentId = escapeHtml(appointment.id);
  const status = String(appointment.status || "").toLowerCase();

  if (status === "pending") {
    return `
      <div class="appointment-card__actions">
        <button class="button button-primary button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="confirmed">Confirmar</button>
        <button class="button button-danger button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="cancelled">Cancelar</button>
      </div>
    `;
  }

  if (status === "confirmed") {
    return `
      <div class="appointment-card__actions">
        <button class="button button-primary button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="completed">Completar</button>
        <button class="button button-secondary button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="cancelled">Cancelar</button>
      </div>
    `;
  }

  return `
    <div class="appointment-card__actions appointment-card__actions--closed">
      <span class="appointment-card__closed-copy">Este turno ya no requiere acciones.</span>
    </div>
  `;
}

function buildAppointmentsHtml(items = state.appointments, { emptyMessage = "Todavia no hay turnos para mostrar.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((appointment) => {
    const cardClass = getAppointmentCardClass(appointment.status);
    const serviceName = appointment.serviceName || "Servicio sin nombre";
    const clientName = appointment.clientName || "Cliente sin nombre";
    const professionalName = canManageAdminAccess() && appointment.adminId
      ? resolveAdminDisplayName(appointment.adminId) || appointment.adminId
      : "";
    const durationLabel = `${escapeHtml(appointment.estimatedDurationMinutes || 0)} min`;
    const sourceLabel = translateAppointmentSource(appointment.source);

    return `
      <article class="stack-item appointment-card ${cardClass}">
        <div class="appointment-card__header">
          <div class="appointment-card__time-block">
            <strong class="appointment-card__time">${escapeHtml(formatAppointmentTime(appointment.requestedStartAt))}</strong>
            <span class="appointment-card__day">${escapeHtml(formatAppointmentDay(appointment.requestedStartAt))}</span>
          </div>
          <span class="tag is-${escapeHtml(String(appointment.status || "").toLowerCase())}">${escapeHtml(translateAppointmentStatus(appointment.status))}</span>
        </div>
        <div class="appointment-card__body">
          <strong class="appointment-card__client">${escapeHtml(clientName)}</strong>
          <p class="appointment-card__service">${escapeHtml(serviceName)}</p>
          <div class="appointment-card__meta">
            ${professionalName ? `<span>Profesional: ${escapeHtml(professionalName)}</span>` : ""}
            <span>Duracion: ${durationLabel}</span>
            <span>Origen: ${escapeHtml(sourceLabel)}</span>
          </div>
          ${appointment.notes ? `<div class="stack-item__notes appointment-card__notes">${escapeHtml(appointment.notes)}</div>` : ""}
        </div>
        ${showActions ? buildAppointmentActionsHtml(appointment) : ""}
      </article>
    `;
  }).join("");
}

function resolveAppointmentProfessionalName(appointment) {
  if (!appointment) {
    return "Profesional";
  }

  const explicitName = String(
    appointment.professionalName
    || appointment.adminDisplayName
    || appointment.adminName
    || ""
  ).trim();

  if (explicitName) {
    return explicitName;
  }

  if (appointment.adminId && state.profile?.id === appointment.adminId) {
    return resolveAdminName();
  }

  const managedName = resolveAdminDisplayName(appointment.adminId);

  if (managedName) {
    return managedName;
  }

  if (appointment.serviceArea) {
    return appointment.serviceArea;
  }

  return appointment.adminId || "Profesional";
}

function resolveAppointmentProfessionalKey(appointment) {
  return appointment?.adminId || slugify(resolveAppointmentProfessionalName(appointment)) || appointment?.id || "unknown";
}

function getAppointmentProfessionalTheme(index) {
  return APPOINTMENT_THEME_PALETTE[index % APPOINTMENT_THEME_PALETTE.length] || APPOINTMENT_THEME_PALETTE[0];
}

function buildAppointmentThemeStyle(theme) {
  return `--pro-color:${theme.color}; --card-bg:${theme.background};`;
}

function buildTurnosWeekModel(items = state.appointments) {
  const sortedAppointments = [...items]
    .map((appointment) => ({
      ...appointment,
      appointmentDate: toTenantDate(appointment.requestedStartAt),
      dateKey: getAppointmentDateKey(appointment.requestedStartAt),
      professionalKey: resolveAppointmentProfessionalKey(appointment),
      professionalName: resolveAppointmentProfessionalName(appointment)
    }))
    .filter((appointment) => appointment.appointmentDate && appointment.dateKey)
    .sort((leftAppointment, rightAppointment) => {
      const dateDiff = leftAppointment.appointmentDate.getTime() - rightAppointment.appointmentDate.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return leftAppointment.professionalName.localeCompare(rightAppointment.professionalName, "es");
    });

  const today = toTenantDate(new Date()) || new Date();
  today.setHours(0, 0, 0, 0);
  const todayWeekDays = buildAppointmentWeekDays(today);
  const todayWeekKeys = new Set(todayWeekDays.map((day) => day.key));
  const referenceAppointment = sortedAppointments.find((appointment) => appointment.appointmentDate >= today)
    || sortedAppointments[0]
    || null;
  const referenceDate = sortedAppointments.some((appointment) => todayWeekKeys.has(appointment.dateKey))
    ? today
    : (referenceAppointment?.appointmentDate || today);
  const weekDays = buildAppointmentWeekDays(referenceDate);
  const weekKeys = new Set(weekDays.map((day) => day.key));
  const weekAppointments = sortedAppointments.filter((appointment) => weekKeys.has(appointment.dateKey));
  const professionalEntries = Array.from(new Map(
    weekAppointments.map((appointment) => [
      appointment.professionalKey,
      {
        id: appointment.professionalKey,
        name: appointment.professionalName
      }
    ])
  ).values()).sort((leftProfessional, rightProfessional) => (
    leftProfessional.name.localeCompare(rightProfessional.name, "es")
  )).map((professional, index) => ({
    ...professional,
    index,
    theme: getAppointmentProfessionalTheme(index)
  }));
  const professionalMap = new Map(professionalEntries.map((professional) => [professional.id, professional]));

  if (
    state.appointmentUi.selectedProfessionalId !== "all"
    && !professionalMap.has(state.appointmentUi.selectedProfessionalId)
  ) {
    state.appointmentUi.selectedProfessionalId = "all";
  }

  const visibleAppointments = state.appointmentUi.selectedProfessionalId === "all"
    ? weekAppointments
    : weekAppointments.filter((appointment) => appointment.professionalKey === state.appointmentUi.selectedProfessionalId);
  const focusDayKey = weekKeys.has(getDateKeyFromDate(today))
    ? getDateKeyFromDate(today)
    : (weekAppointments[0]?.dateKey || weekDays[0]?.key || "");

  return {
    weekDays,
    weekAppointments,
    visibleAppointments,
    professionals: professionalEntries,
    professionalMap,
    focusDayKey,
    weekRangeLabel: formatAppointmentWeekRange(weekDays)
  };
}

function buildAppointmentsProfessionalFilterHtml(model) {
  const professionals = model?.professionals || [];

  if (!professionals.length) {
    return `<p class="weekly-agenda__helper">No hay especialistas activos para esta semana.</p>`;
  }

  const activeProfessionalId = state.appointmentUi.selectedProfessionalId || "all";

  return `
    <button class="pro-pill ${activeProfessionalId === "all" ? "is-active" : ""}" type="button" data-action="appointment-filter" data-id="all">
      <span class="pro-pill__swatch"></span>
      Todos
    </button>
    ${professionals.map((professional) => {
      const isActive = professional.id === activeProfessionalId;
      return `
        <button
          class="pro-pill ${isActive ? "is-active" : ""} ${activeProfessionalId !== "all" && !isActive ? "is-muted" : ""}"
          type="button"
          data-action="appointment-filter"
          data-id="${escapeHtml(professional.id)}"
          style="${buildAppointmentThemeStyle(professional.theme)}"
        >
          <span class="pro-pill__swatch"></span>
          ${escapeHtml(professional.name)}
        </button>
      `;
    }).join("")}
  `;
}

function buildAppointmentsWeekBoardHtml(model) {
  if (!model.weekAppointments.length) {
    return `<article class="empty-state">Todavia no hay turnos para la semana seleccionada.</article>`;
  }

  const hours = Array.from(
    { length: APPOINTMENT_DAY_END_HOUR - APPOINTMENT_DAY_START_HOUR },
    (_, index) => APPOINTMENT_DAY_START_HOUR + index
  );

  return `
    <div class="week-board">
      <aside class="time-rail" aria-hidden="true">
        ${hours.map((hour) => `<span>${String(hour).padStart(2, "0")}:00</span>`).join("")}
      </aside>
      <div class="week-board__viewport">
        <div class="week-board__days">
          ${model.weekDays.map((day) => {
            const dayAppointments = model.visibleAppointments.filter((appointment) => appointment.dateKey === day.key);
            const overlapMap = new Map();

            return `
              <section class="day-column ${day.key === model.focusDayKey ? "is-current" : ""}">
                <header class="day-column__header">
                  <div class="day-column__label">
                    <span class="day-column__name">${escapeHtml(day.dayName)}</span>
                    <span class="day-column__date">${escapeHtml(day.shortLabel)}</span>
                  </div>
                  <span class="day-column__count">${escapeHtml(dayAppointments.length)}</span>
                </header>
                <div class="day-column__body">
                  ${dayAppointments.map((appointment) => {
                    const professional = model.professionalMap.get(appointment.professionalKey)
                      || { index: 0, theme: getAppointmentProfessionalTheme(0), name: appointment.professionalName };
                    const overlapKey = String(getAppointmentMinutesInDay(appointment.requestedStartAt));
                    const stackIndex = overlapMap.get(overlapKey) || 0;
                    overlapMap.set(overlapKey, stackIndex + 1);

                    const startMinutes = Math.max(0, getAppointmentMinutesInDay(appointment.requestedStartAt) - (APPOINTMENT_DAY_START_HOUR * 60));
                    const topPx = Math.round((startMinutes / 60) * APPOINTMENT_HOUR_ROW_HEIGHT);
                    const heightPx = Math.max(
                      58,
                      Math.round(((Math.max(appointment.estimatedDurationMinutes || 60, 30)) / 60) * APPOINTMENT_HOUR_ROW_HEIGHT) - 12
                    );
                    const statusClass = getAppointmentCardClass(appointment.status);

                    return `
                      <article
                        class="booking-card ${statusClass}"
                        data-action="appointment-open"
                        data-id="${escapeHtml(appointment.id)}"
                        style="${buildAppointmentThemeStyle(professional.theme)} --booking-top:${topPx}px; --booking-height:${heightPx}px; --stack:${stackIndex}; --pro-offset:${professional.index % 4}; --z:${stackIndex + 2};"
                      >
                        <span class="booking-card__pro">${escapeHtml(professional.name)}</span>
                        <strong class="booking-card__client">${escapeHtml(appointment.clientName || "Cliente sin nombre")}</strong>
                        <p class="booking-card__service">${escapeHtml(appointment.serviceName || "Servicio sin nombre")}</p>
                      </article>
                    `;
                  }).join("")}
                </div>
              </section>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

function buildAppointmentDetailActionsHtml(appointment) {
  const appointmentId = escapeHtml(appointment.id);
  const status = String(appointment.status || "").toLowerCase();

  if (status === "pending") {
    return `
      <button class="button button-danger button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="cancelled">Cancelar</button>
      <button class="button button-primary button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="confirmed">Confirmar</button>
      <button class="button button-secondary button-compact" type="button" data-action="appointment-reschedule" data-id="${appointmentId}">Reprogramar</button>
    `;
  }

  if (status === "confirmed") {
    return `
      <button class="button button-danger button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="cancelled">Cancelar</button>
      <button class="button button-primary button-compact" type="button" data-action="appointment-status" data-id="${appointmentId}" data-status="completed">Completar</button>
      <button class="button button-secondary button-compact" type="button" data-action="appointment-reschedule" data-id="${appointmentId}">Reprogramar</button>
    `;
  }

  return `
    <span class="appointment-detail__helper">Este turno ya cambio de estado. Solo dejamos visible la opcion de reprogramar.</span>
    <button class="button button-secondary button-compact" type="button" data-action="appointment-reschedule" data-id="${appointmentId}">Reprogramar</button>
  `;
}

function buildAppointmentDetailModalHtml() {
  const appointment = state.appointments.find((item) => item.id === state.appointmentUi.detailAppointmentId);

  if (!appointment) {
    if (state.appointmentUi.detailAppointmentId) {
      state.appointmentUi.detailAppointmentId = "";
      state.appointmentUi.detailFeedback = "";
    }
    return "";
  }

  const professionalName = resolveAppointmentProfessionalName(appointment);
  const professionalKey = resolveAppointmentProfessionalKey(appointment);
  const professionalKeys = Array.from(new Set(state.appointments.map(resolveAppointmentProfessionalKey))).sort();
  const professionalIndex = Math.max(0, professionalKeys.indexOf(professionalKey));
  const theme = getAppointmentProfessionalTheme(professionalIndex);
  const statusClass = `is-${escapeHtml(String(appointment.status || "").toLowerCase())}`;
  const statusLabel = translateAppointmentStatus(appointment.status);
  const detailFeedback = state.appointmentUi.detailFeedback
    || "Desde aca puedes revisar el turno y disparar sus acciones principales.";

  return `
    <div class="appointment-detail-overlay" id="appointment-detail-overlay">
      <article class="appointment-detail" style="${buildAppointmentThemeStyle(theme)}">
        <header class="appointment-detail__header">
          <div class="appointment-detail__topbar">
            <div>
              <span class="appointment-detail__status tag ${statusClass}">${escapeHtml(statusLabel)}</span>
              <strong class="appointment-detail__time">${escapeHtml(formatAppointmentTime(appointment.requestedStartAt))}</strong>
              <p class="appointment-detail__service">${escapeHtml(appointment.serviceName || "Servicio sin nombre")}</p>
            </div>
            <button class="appointment-detail__close" type="button" data-action="appointment-close-detail" aria-label="Cerrar detalle">x</button>
          </div>
        </header>
        <div class="appointment-detail__body">
          <div>
            <strong class="appointment-detail__client">${escapeHtml(appointment.clientName || "Cliente sin nombre")}</strong>
          </div>
          <div class="appointment-detail__meta">
            <div class="appointment-detail__meta-item">
              <span class="appointment-detail__label">Profesional</span>
              <span class="appointment-detail__value">${escapeHtml(professionalName)}</span>
            </div>
            <div class="appointment-detail__meta-item">
              <span class="appointment-detail__label">Dia</span>
              <span class="appointment-detail__value">${escapeHtml(formatDateTime(appointment.requestedStartAt))}</span>
            </div>
            <div class="appointment-detail__meta-item">
              <span class="appointment-detail__label">Duracion</span>
              <span class="appointment-detail__value">${escapeHtml(appointment.estimatedDurationMinutes || 0)} min</span>
            </div>
            <div class="appointment-detail__meta-item">
              <span class="appointment-detail__label">Origen</span>
              <span class="appointment-detail__value">${escapeHtml(translateAppointmentSource(appointment.source))}</span>
            </div>
            <div class="appointment-detail__meta-item">
              <span class="appointment-detail__label">Telefono</span>
              <span class="appointment-detail__value">${escapeHtml(appointment.clientPhone || "Sin telefono")}</span>
            </div>
            <div class="appointment-detail__meta-item">
              <span class="appointment-detail__label">Email</span>
              <span class="appointment-detail__value">${escapeHtml(appointment.clientEmail || "Sin email")}</span>
            </div>
          </div>
          ${appointment.notes ? `<p class="appointment-detail__notes">${escapeHtml(appointment.notes)}</p>` : ""}
          ${appointment.serviceArea ? `
            <div class="appointment-detail__meta-item appointment-detail__meta-item--wide">
              <span class="appointment-detail__label">Area</span>
              <span class="appointment-detail__value">${escapeHtml(appointment.serviceArea)}</span>
            </div>
          ` : ""}
          <div class="appointment-detail__footer">
            <div class="appointment-detail__actions">
              ${buildAppointmentDetailActionsHtml(appointment)}
            </div>
            <p class="appointment-detail__feedback">${escapeHtml(detailFeedback)}</p>
          </div>
        </div>
      </article>
    </div>
  `;
}

function buildServicesHtml(items = state.services, { emptyMessage = "Todavia no cargaste servicios.", showActions = true } = {}) {
  if (items.length === 0) {
    return `<article class="empty-state">${escapeHtml(emptyMessage)}</article>`;
  }

  return items.map((service) => `
    <article class="stack-item">
      ${service.imageUrl ? `
        <div class="stack-item__media">
          <img
            class="stack-item__image"
            src="${escapeHtml(service.imageUrl)}"
            alt="${escapeHtml(service.name || "Servicio")}"
            loading="lazy"
          >
        </div>
      ` : ""}
      <div class="stack-item__meta">
        <div>
          <strong>${escapeHtml(service.name)}</strong>
          <p>${escapeHtml(service.description || "Sin descripcion publica.")}</p>
        </div>
        <div class="surface-panel__chips">
          <span class="tag">${service.publicVisible ? "Publico" : "Oculto"}</span>
          ${service.isSpecial ? `<span class="tag is-pending">Especial</span>` : ""}
          ${service.imageUrl ? `<span class="tag is-confirmed">Con imagen</span>` : ""}
        </div>
      </div>
      <p>${escapeHtml(formatMoney(service.price))} - ${escapeHtml(service.durationMinutes)} min - posicion en la web ${escapeHtml(service.sortOrder || 0)}</p>
      <p>${escapeHtml(formatServiceSpecialScheduleSummary(service))}</p>
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
  return "";
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
      <article class="surface-panel">
        <div class="weekly-agenda__intro surface-panel__header">
          <div>
            <p class="eyebrow">Alternativa semanal</p>
            <h3>Agenda por especialistas</h3>
            <p class="weekly-agenda__copy">
              Cada bloque muestra cliente y servicio, con color por profesional y superposicion suave cuando coinciden horarios.
            </p>
          </div>
          <div class="surface-panel__chips">
            <span class="card-chip" id="appointments-week-range">Semana actual</span>
            <span class="card-chip" id="appointments-week-count">${escapeHtml(state.appointments.length)} turnos</span>
          </div>
        </div>
        <div class="professional-filter" id="appointments-professional-filter"></div>
        <div id="appointments-week-board"></div>
      </article>
      <div id="appointment-detail-root"></div>
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

              <label class="field-wide">
                <span>Imagen del servicio</span>
                <input id="service-image" type="file" accept="image/*">
              </label>

              <div class="field-wide" id="service-image-preview"></div>

              <label class="checkbox-field field-wide">
                <input id="service-is-special" type="checkbox">
                <span>Este es un servicio especial con fechas y horarios definidos por la profesional</span>
              </label>

              <div class="field-wide service-special-panel" id="service-special-settings" hidden>
                <div class="service-special-panel__header">
                  <div>
                    <strong>Agenda especial</strong>
                    <p>Los clientes solo podran reservar dentro de estas fechas y rangos horarios.</p>
                  </div>
                  <button class="button button-secondary button-compact" type="button" data-action="add-service-special-window">Agregar fecha</button>
                </div>
                <div class="service-special-windows" id="service-special-windows"></div>
              </div>

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
    const businessName = item.businessName || `${state.tenantData?.businessName || "Rockeala"} ${translateManagedAdminRole(item.role)}`;
    const canManageEntry = isInvite || canManageTargetAdmin(item);
    const isBusy = state.adminAccess.actionId === `${item.entryType}:${item.id}`;
    const roleLabel = `${translateManagedAdminRole(item.role)} - ${translateMembershipRole(item.membershipRole)}`;

    return `
      <article class="stack-item">
        <div class="stack-item__meta">
          <div>
            <strong>${escapeHtml(item.displayName || "Usuario del equipo")}</strong>
            <p>${escapeHtml(item.email || "Sin email")} - ${escapeHtml(roleLabel)}</p>
          </div>
          <span class="tag ${badgeTone}">${escapeHtml(badgeText)}</span>
        </div>
        <p>${escapeHtml(businessName)} - ${escapeHtml(isInvite ? "Esperando primer ingreso con ese email." : "Ya puede entrar al panel.")}</p>
        <div class="stack-item__notes">
          ${escapeHtml(isInvite ? "Invitado" : "Alta activa")} desde ${escapeHtml(formatDateTime(item.createdAt || item.updatedAt))}
          ${!isInvite ? ` - Turnos web: ${escapeHtml(item.publicBookingEnabled === false ? "ocultos" : "habilitados")}` : ""}
        </div>
        ${canManageEntry ? `
          <div class="stack-item__actions">
            <button class="button button-tertiary button-compact" type="button" data-action="edit-team-entry" data-entry-type="${escapeHtml(item.entryType)}" data-id="${escapeHtml(item.id)}" ${isBusy ? "disabled" : ""}>Editar</button>
            ${!isInvite ? `
              <button class="button button-secondary button-compact" type="button" data-action="toggle-team-access" data-entry-type="admin" data-id="${escapeHtml(item.id)}" ${isBusy ? "disabled" : ""}>${item.active === false ? "Reactivar" : "Suspender"}</button>
            ` : ""}
            <button class="button button-danger button-compact" type="button" data-action="delete-team-access" data-entry-type="${escapeHtml(item.entryType)}" data-id="${escapeHtml(item.id)}" ${isBusy ? "disabled" : ""}>${isBusy ? "Procesando..." : "Eliminar"}</button>
          </div>
        ` : `
          <div class="stack-item__notes">Cuenta principal del tenant.</div>
        `}
      </article>
    `;
  }).join("");
}

function buildTenantRolesHtml() {
  const roleOptions = getAvailableManagedAdminRoles();

  if (roleOptions.length === 0) {
    return `<article class="empty-state">Todavia no configuraste roles para este tenant.</article>`;
  }

  return roleOptions.map((roleOption) => {
    const isDeleting = state.settingsUi.roleDeletingId === roleOption.id;

    return `
      <article class="stack-item">
        <div class="stack-item__meta">
          <div>
            <strong>${escapeHtml(roleOption.label)}</strong>
            <p>Id interno: ${escapeHtml(roleOption.id)}</p>
          </div>
          <span class="tag is-confirmed">Activo</span>
        </div>
        <div class="stack-item__actions">
          <button class="button button-tertiary button-compact" type="button" data-action="edit-tenant-role" data-id="${escapeHtml(roleOption.id)}" ${state.settingsUi.roleSubmitting || isDeleting ? "disabled" : ""}>Editar</button>
          <button class="button button-danger button-compact" type="button" data-action="delete-tenant-role" data-id="${escapeHtml(roleOption.id)}" ${state.settingsUi.roleSubmitting || isDeleting ? "disabled" : ""}>${isDeleting ? "Eliminando..." : "Eliminar"}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderSettingsMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Configuraciones",
      title: "Inicia sesion para editar este tenant.",
      description: "Desde aca la cuenta principal puede actualizar los datos del negocio y sus roles."
    });
  }

  if (!canManageAdminAccess()) {
    return renderLockedView({
      eyebrow: "Configuraciones",
      title: "Esta seccion esta reservada para la administradora principal.",
      description: "Solo una cuenta owner o admin del tenant puede cambiar los datos del negocio y administrar roles."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Configuraciones",
        title: "Configuracion del tenant.",
        description: "Actualiza los datos generales del negocio y administra los roles disponibles para crear usuarios.",
        chip: "Tenant"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Datos del negocio</p>
              <h3>Configuracion general</h3>
            </div>
            <span class="card-chip">${escapeHtml(state.tenantId || "tenant")}</span>
          </div>
          <form class="editor-form" id="tenant-settings-form">
            <div class="form-grid">
              <label>
                <span>Tenant ID</span>
                <input id="tenant-id" type="text" value="${escapeHtml(state.tenantId)}" disabled>
              </label>

              <label>
                <span>Slug</span>
                <input id="tenant-slug" type="text" value="${escapeHtml(state.tenantData?.slug || state.tenantId)}" disabled>
              </label>

              <label>
                <span>Nombre interno</span>
                <input id="tenant-name" type="text" required>
              </label>

              <label>
                <span>Nombre visible del negocio</span>
                <input id="tenant-business-name" type="text" required>
              </label>

              <label>
                <span>Dominio personalizado</span>
                <input id="tenant-custom-domain" type="text" placeholder="Opcional">
              </label>

              <label>
                <span>Zona horaria</span>
                <input id="tenant-timezone" type="text" required placeholder="America/Argentina/Buenos_Aires">
              </label>

              <label>
                <span>WhatsApp</span>
                <input id="tenant-whatsapp-phone" type="text" placeholder="54 9 11 ...">
              </label>

              <label class="field-wide">
                <span>Mensaje inicial de WhatsApp</span>
                <textarea id="tenant-whatsapp-message" rows="3" placeholder="Hola, quiero reservar un turno."></textarea>
              </label>

              <label class="checkbox-field">
                <input id="tenant-public-enabled" type="checkbox">
                <span>Web publica habilitada</span>
              </label>

              <label class="checkbox-field">
                <input id="tenant-admin-enabled" type="checkbox">
                <span>Panel admin habilitado</span>
              </label>
            </div>
            <p class="status-message" id="tenant-settings-message"></p>
            <div class="form-toolbar">
              <button class="button button-primary" id="tenant-settings-submit" type="submit" ${state.settingsUi.saving ? "disabled" : ""}>
                ${state.settingsUi.saving ? "Guardando..." : "Guardar configuracion"}
              </button>
            </div>
          </form>
        </article>

        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Roles</p>
              <h3>Roles del tenant</h3>
            </div>
            <span class="card-chip" id="tenant-role-count">${escapeHtml(getAvailableManagedAdminRoles().length)} roles</span>
          </div>
          <form class="editor-form" id="tenant-role-form">
            <div class="form-grid">
              <label class="field-wide">
                <span>Nombre del rol</span>
                <input id="tenant-role-label" type="text" required placeholder="Ej. Cosmetologia">
              </label>
            </div>
            <p class="status-message" id="tenant-roles-message"></p>
            <div class="form-toolbar">
              <button class="button button-primary" id="tenant-role-submit" type="submit" ${state.settingsUi.roleSubmitting ? "disabled" : ""}>
                ${state.settingsUi.roleSubmitting ? "Guardando..." : "Guardar rol"}
              </button>
              <button class="button button-secondary" id="tenant-role-reset" type="button" ${state.editor.tenantRoleId ? "" : "hidden"}>Cancelar edicion</button>
            </div>
          </form>
          <div class="stack-list" id="tenant-role-list"></div>
        </article>
      </section>
    </section>
  `;
}

function renderUsersMarkup() {
  if (!hasPanelAccess()) {
    return renderLockedView({
      eyebrow: "Usuarios",
      title: "Inicia sesion para administrar accesos.",
      description: "Desde aca la cuenta owner puede crear usuarios del equipo y asignarles un rol."
    });
  }

  if (!canManageAdminAccess()) {
    return renderLockedView({
      eyebrow: "Usuarios",
      title: "Esta seccion esta reservada para la administradora principal.",
      description: "Solo una cuenta owner o admin del tenant puede crear accesos y asignar roles para otras personas del equipo."
    });
  }

  return `
    <section class="view-stage">
      ${renderViewHero({
        eyebrow: "Usuarios",
        title: "Usuarios y accesos del equipo.",
        description: "Crea usuarios para que entren al panel y asignales un rol de trabajo.",
        chip: "Equipo"
      })}
      <section class="section-grid section-grid--split">
        <article class="surface-panel">
          <div class="surface-panel__header">
            <div>
              <p class="eyebrow">Alta</p>
              <h3 id="team-form-title">Nuevo acceso</h3>
            </div>
            <span class="card-chip" id="team-form-chip">Invitacion</span>
          </div>
          <form class="editor-form" id="team-form">
            <div class="form-grid">
              <label>
                <span>Nombre para mostrar</span>
                <input id="team-display-name" type="text" required placeholder="Ej. Carla Perez">
              </label>

              <label>
                <span>Email de acceso</span>
                <input id="team-email" type="email" required placeholder="ejemplo@gmail.com">
              </label>

              <label>
                <span>Rol</span>
                <select id="team-role" required>
                  ${getAvailableManagedAdminRoles().map((roleOption) => `
                    <option value="${escapeHtml(roleOption.id)}">${escapeHtml(roleOption.label)}</option>
                  `).join("")}
                </select>
              </label>

              <label>
                <span>Negocio visible</span>
                <input id="team-business-name" type="text" placeholder="Opcional. Si lo dejas vacio usamos uno sugerido.">
              </label>

              <label class="checkbox-field field-wide">
                <input id="team-public-booking-enabled" type="checkbox" checked>
                <span>Recibe turnos desde la web publica</span>
              </label>
            </div>
            <p class="status-message" id="team-message"></p>
            <div class="form-toolbar">
              <button class="button button-primary" id="team-submit" type="submit" ${state.adminAccess.submitting ? "disabled" : ""}>
                ${state.adminAccess.submitting ? "Creando acceso..." : "Crear usuario"}
              </button>
              <button class="button button-secondary" id="team-reset" type="button" ${isEditingManagedAdminEntry() ? "" : "hidden"}>Cancelar edicion</button>
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
          <p>Las personas invitadas deben iniciar sesion usando exactamente el email cargado aca.</p>
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
    case "configuraciones":
      viewRoot.innerHTML = renderSettingsMarkup();
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
  applyMessageToElement(getViewElement("tenant-settings-message"), state.messages.settings);
  applyMessageToElement(getViewElement("tenant-roles-message"), state.messages.roles);
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
      const weekRange = getViewElement("appointments-week-range");
      const weekCount = getViewElement("appointments-week-count");
      const professionalFilter = getViewElement("appointments-professional-filter");
      const weekBoard = getViewElement("appointments-week-board");
      const appointmentDetailRoot = getViewElement("appointment-detail-root");
      const weekModel = buildTurnosWeekModel();

      if (weekRange) {
        weekRange.textContent = weekModel.weekRangeLabel;
      }

      if (weekCount) {
        weekCount.textContent = `${weekModel.weekAppointments.length} turnos`;
      }

      if (professionalFilter) {
        professionalFilter.innerHTML = buildAppointmentsProfessionalFilterHtml(weekModel);
      }

      if (weekBoard) {
        weekBoard.innerHTML = buildAppointmentsWeekBoardHtml(weekModel);
      }

      if (appointmentDetailRoot) {
        appointmentDetailRoot.innerHTML = buildAppointmentDetailModalHtml();
      }

      syncTurnosWeekFocus();
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
      const teamReset = getViewElement("team-reset");

      if (teamList) {
        teamList.innerHTML = buildManagedAdminEntriesHtml();
      }

      if (teamListCount) {
        teamListCount.textContent = `${state.adminAccess.admins.length + state.adminAccess.invites.length} accesos`;
      }

      if (teamSubmit) {
        teamSubmit.disabled = state.adminAccess.submitting;
        teamSubmit.textContent = state.adminAccess.submitting
          ? (isEditingManagedAdminEntry() ? "Guardando..." : "Creando acceso...")
          : (isEditingManagedAdminEntry() ? "Guardar cambios" : "Crear usuario");
      }

      if (teamReset) {
        teamReset.hidden = !isEditingManagedAdminEntry();
      }

      break;
    }
    case "configuraciones": {
      const tenantRoleList = getViewElement("tenant-role-list");
      const tenantRoleCount = getViewElement("tenant-role-count");
      const tenantSettingsSubmit = getViewElement("tenant-settings-submit");
      const tenantRoleSubmit = getViewElement("tenant-role-submit");
      const tenantRoleReset = getViewElement("tenant-role-reset");

      if (tenantRoleList) {
        tenantRoleList.innerHTML = buildTenantRolesHtml();
      }

      if (tenantRoleCount) {
        tenantRoleCount.textContent = `${getAvailableManagedAdminRoles().length} roles`;
      }

      if (tenantSettingsSubmit) {
        tenantSettingsSubmit.disabled = state.settingsUi.saving;
        tenantSettingsSubmit.textContent = state.settingsUi.saving ? "Guardando..." : "Guardar configuracion";
      }

      if (tenantRoleSubmit) {
        tenantRoleSubmit.disabled = state.settingsUi.roleSubmitting;
        tenantRoleSubmit.textContent = state.settingsUi.roleSubmitting ? "Guardando..." : "Guardar rol";
      }

      if (tenantRoleReset) {
        tenantRoleReset.hidden = !state.editor.tenantRoleId;
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
      populateTeamForm();
      if (canManageAdminAccess() && !state.adminAccess.loaded && !state.adminAccess.loading) {
        loadManagedAdminAccess();
      }
      break;
    case "turnos":
      if (canManageAdminAccess() && !state.adminAccess.loaded && !state.adminAccess.loading) {
        loadManagedAdminAccess();
      }
      syncTurnosWeekFocus();
      break;
    case "configuraciones":
      populateTenantSettingsForm();
      populateTenantRoleForm();
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
  const serviceImageInput = getViewElement("service-image");
  const serviceImagePreview = getViewElement("service-image-preview");
  const serviceIsSpecialInput = getViewElement("service-is-special");
  const servicePublicVisibleInput = getViewElement("service-public-visible");
  const serviceFormTitle = getViewElement("service-form-title");
  const serviceSubmit = getViewElement("service-submit");

  if (!serviceIdInput || !serviceNameInput || !servicePriceInput || !serviceDurationInput || !serviceSortOrderInput || !serviceDescriptionInput || !serviceImageInput || !serviceImagePreview || !serviceIsSpecialInput || !servicePublicVisibleInput || !serviceFormTitle || !serviceSubmit) {
    return;
  }

  serviceIdInput.value = service?.id || "";
  serviceNameInput.value = service?.name || "";
  servicePriceInput.value = service ? Number(service.price || 0) : "";
  serviceDurationInput.value = service ? Number(service.durationMinutes || 0) : "";
  serviceSortOrderInput.value = service ? Number(service.sortOrder || 0) : "";
  serviceDescriptionInput.value = service?.description || "";
  serviceImageInput.value = "";
  serviceImagePreview.innerHTML = buildServiceImagePreviewHtml(service);
  serviceIsSpecialInput.checked = service?.isSpecial === true;
  renderServiceSpecialScheduleEditor(service?.specialSchedule || []);
  syncServiceSpecialFieldsVisibility();
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

function populateTeamForm() {
  const teamEntry = findManagedAdminEntry();
  const teamDisplayNameInput = getViewElement("team-display-name");
  const teamEmailInput = getViewElement("team-email");
  const teamRoleInput = getViewElement("team-role");
  const teamBusinessNameInput = getViewElement("team-business-name");
  const teamPublicBookingInput = getViewElement("team-public-booking-enabled");
  const teamFormTitle = getViewElement("team-form-title");
  const teamFormChip = getViewElement("team-form-chip");
  const teamSubmit = getViewElement("team-submit");
  const teamReset = getViewElement("team-reset");

  if (!teamDisplayNameInput || !teamEmailInput || !teamRoleInput || !teamBusinessNameInput || !teamPublicBookingInput || !teamFormTitle || !teamFormChip || !teamSubmit || !teamReset) {
    return;
  }

  const availableRoles = getAvailableManagedAdminRoles();
  teamDisplayNameInput.value = teamEntry?.displayName || "";
  teamEmailInput.value = teamEntry?.email || "";
  teamRoleInput.innerHTML = availableRoles.map((roleOption) => `
    <option value="${escapeHtml(roleOption.id)}">${escapeHtml(roleOption.label)}</option>
  `).join("");
  teamRoleInput.disabled = availableRoles.length === 0;
  teamRoleInput.value = teamEntry?.role && availableRoles.some((roleOption) => roleOption.id === teamEntry.role)
    ? teamEntry.role
    : (availableRoles[0]?.id || "");
  teamBusinessNameInput.value = teamEntry?.businessName || "";
  teamPublicBookingInput.checked = teamEntry?.publicBookingEnabled !== false;
  teamPublicBookingInput.disabled = state.editor.teamEntryType !== "admin";
  teamEmailInput.disabled = isEditingManagedAdminEntry();
  teamFormTitle.textContent = isEditingManagedAdminEntry()
    ? `Editando ${teamEntry?.displayName || "usuario"}`
    : "Nuevo acceso";
  teamFormChip.textContent = state.editor.teamEntryType === "admin"
    ? "Usuario activo"
    : (state.editor.teamEntryType === "invite" ? "Invitacion pendiente" : "Invitacion");
  teamSubmit.textContent = state.adminAccess.submitting
    ? (isEditingManagedAdminEntry() ? "Guardando..." : "Creando acceso...")
    : (isEditingManagedAdminEntry() ? "Guardar cambios" : "Crear usuario");
  teamSubmit.disabled = state.adminAccess.submitting || availableRoles.length === 0;
  teamReset.hidden = !isEditingManagedAdminEntry();
  applyMessageToElement(getViewElement("team-message"), state.messages.team);
}

function populateTenantSettingsForm() {
  const tenantNameInput = getViewElement("tenant-name");
  const tenantBusinessNameInput = getViewElement("tenant-business-name");
  const tenantCustomDomainInput = getViewElement("tenant-custom-domain");
  const tenantTimezoneInput = getViewElement("tenant-timezone");
  const tenantWhatsAppPhoneInput = getViewElement("tenant-whatsapp-phone");
  const tenantWhatsAppMessageInput = getViewElement("tenant-whatsapp-message");
  const tenantPublicEnabledInput = getViewElement("tenant-public-enabled");
  const tenantAdminEnabledInput = getViewElement("tenant-admin-enabled");

  if (!tenantNameInput || !tenantBusinessNameInput || !tenantCustomDomainInput || !tenantTimezoneInput || !tenantWhatsAppPhoneInput || !tenantWhatsAppMessageInput || !tenantPublicEnabledInput || !tenantAdminEnabledInput) {
    return;
  }

  tenantNameInput.value = state.tenantData?.name || "";
  tenantBusinessNameInput.value = state.tenantData?.businessName || "";
  tenantCustomDomainInput.value = state.tenantData?.customDomain || "";
  tenantTimezoneInput.value = state.tenantData?.timezone || "America/Argentina/Buenos_Aires";
  tenantWhatsAppPhoneInput.value = state.tenantData?.whatsAppPhone || "";
  tenantWhatsAppMessageInput.value = state.tenantData?.whatsAppMessage || "";
  tenantPublicEnabledInput.checked = state.tenantData?.publicEnabled !== false;
  tenantAdminEnabledInput.checked = state.tenantData?.adminEnabled !== false;
  applyMessageToElement(getViewElement("tenant-settings-message"), state.messages.settings);
}

function populateTenantRoleForm() {
  const tenantRoleLabelInput = getViewElement("tenant-role-label");
  const tenantRoleSubmit = getViewElement("tenant-role-submit");
  const tenantRoleReset = getViewElement("tenant-role-reset");
  const editingRole = getAvailableManagedAdminRoles().find((roleOption) => roleOption.id === state.editor.tenantRoleId);

  if (!tenantRoleLabelInput || !tenantRoleSubmit || !tenantRoleReset) {
    return;
  }

  tenantRoleLabelInput.value = editingRole?.label || "";
  tenantRoleSubmit.textContent = state.settingsUi.roleSubmitting
    ? "Guardando..."
    : (editingRole ? "Guardar cambios" : "Guardar rol");
  tenantRoleReset.hidden = !editingRole;
  applyMessageToElement(getViewElement("tenant-roles-message"), state.messages.roles);
}

function clearBusinessData() {
  clearToastDismissTimer("auth");
  clearToastDismissTimer("profile");
  state.services = [];
  state.appointments = [];
  state.clients = [];
  state.stock = [];
  state.products = [];
  state.salonMedia = [];
  state.stockUi = createEmptyInventoryUiState();
  state.productUi = createEmptyInventoryUiState();
  state.salonUi = createEmptySalonUiState();
  state.appointmentUi = createEmptyAppointmentUiState();
  state.clientUi = createEmptyClientUiState();
  state.adminAccess = createEmptyAdminAccessState();
  state.settingsUi = createEmptySettingsUiState();
  state.messages.profile = createEmptyMessage();
  state.messages.salon = createEmptyMessage();
  state.messages.team = createEmptyMessage();
  state.messages.settings = createEmptyMessage();
  state.messages.roles = createEmptyMessage();
  syncClientDetailOverlayState();
  resetServiceEditor({ preserveMessage: true });
  resetClientEditor({ preserveMessage: true });
  resetStockEditor({ preserveMessage: true });
  resetProductEditor({ preserveMessage: true });
  resetSalonEditor({ preserveMessage: true });
  resetTeamEditor({ preserveMessage: true });
  resetTenantRoleEditor({ preserveMessage: true });
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

function resetTeamEditor({ preserveMessage = false } = {}) {
  state.editor.teamEntryId = "";
  state.editor.teamEntryType = "";

  if (!preserveMessage) {
    clearScopedMessage("team");
  }

  if (state.activeView === "usuarios") {
    populateTeamForm();
    refreshCurrentViewData();
  }
}

function resetTenantRoleEditor({ preserveMessage = false } = {}) {
  state.editor.tenantRoleId = "";

  if (!preserveMessage) {
    clearScopedMessage("roles");
  }

  if (state.activeView === "configuraciones") {
    populateTenantRoleForm();
    refreshCurrentViewData();
  }
}

function setAccessBlocked(message, tone = "warning") {
  debugLog("access-blocked", {
    message,
    tone,
    tenantId: state.tenantId,
    uid: state.user?.uid || ""
  });
  clearSubscriptions();
  clearBusinessData();
  state.profile = null;
  setScopedMessage("auth", message, tone);
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
  debugLog("google-sign-in-start", {
    tenantId: state.tenantId
  });

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = "es";
    await signInWithPopup(auth, provider);
  } catch (error) {
    debugLog("google-sign-in-error", {
      tenantId: state.tenantId,
      code: error?.code || "",
      message: error?.message || ""
    });
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
    debugLog("sign-out-start", {
      tenantId: state.tenantId,
      uid: state.user?.uid || ""
    });
    await signOut(auth);
  } catch (error) {
    debugLog("sign-out-error", {
      tenantId: state.tenantId,
      code: error?.code || "",
      message: error?.message || ""
    });
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
    debugLog("claim-managed-admin-access-start", {
      tenantId: state.tenantId,
      uid: state.user.uid,
      email: state.user.email || ""
    });
    const response = await callAdminCallable("claimManagedAdminAccess");
    debugLog("claim-managed-admin-access-result", {
      tenantId: state.tenantId,
      claimed: response.claimed === true,
      alreadyActive: response.alreadyActive === true
    });
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
    debugLog("load-admin-profile-start", {
      tenantId: state.tenantId,
      uid: user.uid,
      email: user.email || ""
    });
    let adminSnapshot = await getDoc(tenantDocRef("admins", user.uid));

    if (!adminSnapshot.exists()) {
      const claimed = await claimManagedAdminAccess();

      if (claimed) {
        adminSnapshot = await getDoc(tenantDocRef("admins", user.uid));
      }
    }

    if (!adminSnapshot.exists()) {
      setAccessBlocked("Tu cuenta todavia no tiene permiso para entrar. Pedi que habiliten tu acceso.", "error");
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
    debugLog("load-admin-profile-success", {
      tenantId: state.tenantId,
      uid: user.uid,
      active: profile.active === true,
      role: profile.role || profile.specialtyKey || "",
      membershipRole: profile.membershipRole || ""
    });
    await refreshTenantContext();
    state.adminAccess = createEmptyAdminAccessState();
    setScopedMessage("auth", "Listo, ya puedes administrar tu negocio.", "success");
    applyTenantBranding();
    renderNavigation();
    renderActiveView();
    startRealtimeSubscriptions(user.uid);

    if (canManageAdminAccess()) {
      loadManagedAdminAccess(true);
    }
  } catch (error) {
    debugLog("load-admin-profile-error", {
      tenantId: state.tenantId,
      uid: user.uid,
      code: error?.code || "",
      message: error?.message || ""
    });
    setAccessBlocked("No se pudo cargar tu cuenta. Reintenta en unos segundos.", "error");
  }
}

function startRealtimeSubscriptions(adminId) {
  if (state.subscribedAdminId === adminId && state.unsubscribers.length > 0) {
    return;
  }

  clearSubscriptions();
  state.subscribedAdminId = adminId;
  debugLog("start-realtime-subscriptions", {
    tenantId: state.tenantId,
    adminId
  });

  const servicesQuery = query(
    tenantCollectionRef("servicios"),
    where("adminId", "==", adminId),
    orderBy("sortOrder", "asc"),
    limit(30)
  );

  const appointmentsQuery = canManageAdminAccess()
    ? query(
      tenantCollectionRef("turnos"),
      orderBy("requestedStartAt", "asc"),
      limit(80)
    )
    : query(
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
          adminId: data.adminId || "",
          serviceName: data.serviceNameSnapshot || data.serviceName || "Servicio",
          serviceArea: data.serviceAreaSnapshot || data.serviceArea || "",
          clientName: data.clientSnapshot?.fullName || data.clientName || "Cliente",
          clientPhone: data.clientSnapshot?.phone || data.clientPhone || "",
          clientEmail: data.clientSnapshot?.email || data.clientEmail || "",
          requestedStartAt: data.requestedStartAt,
          estimatedDurationMinutes: Number(data.estimatedDurationMinutes || 0),
          status: data.status || "pending",
          source: data.source || "panel",
          notes: data.notes || "",
          professionalName: data.adminDisplayName || data.professionalName || ""
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
  const nextView = ["usuarios", "salon", "configuraciones"].includes(declaredView) && !canManageAdminAccess()
    ? "dashboard"
    : declaredView;

  if (state.activeView === nextView && !forceRender) {
    return;
  }

  if (nextView !== "clientes" && state.clientUi.detailClientId) {
    closeClientDetail({ rerender: false });
  }

  if (nextView !== "turnos") {
    state.appointmentUi.detailAppointmentId = "";
    state.appointmentUi.detailFeedback = "";
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
  const serviceImageInput = getViewElement("service-image");
  const serviceIsSpecialInput = getViewElement("service-is-special");
  const servicePublicVisibleInput = getViewElement("service-public-visible");
  const serviceRef = state.editor.serviceId
    ? tenantDocRef("servicios", state.editor.serviceId)
    : doc(tenantCollectionRef("servicios"));

  let specialSchedule = [];

  if (serviceIsSpecialInput?.checked) {
    try {
      specialSchedule = collectServiceSpecialSchedule();
    } catch (error) {
      setScopedMessage("service", error.message || "Revisa las fechas del servicio especial.", "error");
      return;
    }

    if (!specialSchedule.length) {
      setScopedMessage("service", "Agrega al menos una fecha para el servicio especial.", "error");
      return;
    }
  }

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
    isSpecial: serviceIsSpecialInput?.checked === true,
    specialSchedule,
    publicVisible: servicePublicVisibleInput.checked,
    sortOrder: Number(serviceSortOrderInput.value || state.services.length + 1),
    updatedAt: serverTimestamp()
  };

  try {
    const selectedImage = serviceImageInput?.files?.[0];

    if (selectedImage) {
      if (!storage) {
        throw new Error("storage-not-ready");
      }

      if (!String(selectedImage.type || "").startsWith("image/")) {
        setScopedMessage("service", "El archivo seleccionado no es una imagen valida.", "error");
        return;
      }

      const webpFile = await convertImageFileToWebp(selectedImage);
      const storagePath = `tenants/${getTenantId()}/servicios/${serviceRef.id}/cover.webp`;
      const imageRef = ref(storage, storagePath);

      await uploadBytes(imageRef, webpFile, {
        contentType: "image/webp",
        cacheControl: "public,max-age=3600"
      });

      payload.imageUrl = await getDownloadURL(imageRef);
      payload.imageStoragePath = storagePath;
    }

    if (state.editor.serviceId) {
      await setDoc(serviceRef, payload, { merge: true });
      setScopedMessage("service", "Servicio actualizado.", "success");
    } else {
      await setDoc(serviceRef, {
        ...payload,
        createdAt: serverTimestamp()
      });
      setScopedMessage("service", "Servicio creado.", "success");
    }

    resetServiceEditor({ preserveMessage: true });
  } catch (error) {
    console.error("[admin:service] save failed", error);

    if (`${error?.message || ""}`.includes("storage-not-ready")) {
      setScopedMessage("service", "Storage no esta disponible todavia para subir imagenes.", "error");
    } else if (serviceImageInput?.files?.[0]) {
      setScopedMessage("service", "No se pudo subir la imagen del servicio. Reintenta con otra foto.", "error");
    } else {
      setScopedMessage("service", "No se pudo guardar el servicio. Revisa los datos e intenta de nuevo.", "error");
    }
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

function findTenantRole(roleId = state.editor.tenantRoleId) {
  return getAvailableManagedAdminRoles().find((roleOption) => roleOption.id === roleId) || null;
}

function editTenantRole(roleId) {
  state.editor.tenantRoleId = roleId;
  const roleEntry = findTenantRole(roleId);
  setScopedMessage("roles", roleEntry ? `Editando ${roleEntry.label}.` : "Editando rol.", "warning");
  populateTenantRoleForm();
  getViewElement("tenant-role-label")?.focus();
}

async function saveTenantSettings(event) {
  event.preventDefault();

  if (!canManageAdminAccess()) {
    setScopedMessage("settings", "Tu cuenta no tiene permiso para editar la configuracion del tenant.", "error");
    return;
  }

  const nameInput = getViewElement("tenant-name");
  const businessNameInput = getViewElement("tenant-business-name");
  const customDomainInput = getViewElement("tenant-custom-domain");
  const timezoneInput = getViewElement("tenant-timezone");
  const whatsAppPhoneInput = getViewElement("tenant-whatsapp-phone");
  const whatsAppMessageInput = getViewElement("tenant-whatsapp-message");
  const publicEnabledInput = getViewElement("tenant-public-enabled");
  const adminEnabledInput = getViewElement("tenant-admin-enabled");
  const payload = {
    name: nameInput?.value.trim() || "",
    businessName: businessNameInput?.value.trim() || "",
    customDomain: customDomainInput?.value.trim() || "",
    timezone: timezoneInput?.value.trim() || "",
    whatsAppPhone: whatsAppPhoneInput?.value.trim() || "",
    whatsAppMessage: whatsAppMessageInput?.value.trim() || "",
    publicEnabled: publicEnabledInput?.checked !== false,
    adminEnabled: adminEnabledInput?.checked !== false
  };

  if (!payload.name || !payload.businessName || !payload.timezone) {
    setScopedMessage("settings", "Completa nombre, nombre visible y zona horaria antes de guardar.", "error");
    return;
  }

  state.settingsUi.saving = true;
  setScopedMessage("settings", "Guardando configuracion del tenant...", "");
  refreshCurrentViewData();

  try {
    const response = await callAdminCallable("updateTenantSettings", payload);

    if (response.tenant && typeof response.tenant === "object") {
      state.tenantData = response.tenant;
      syncTenantRolesFromTenantData();
      applyTenantBranding();
    } else {
      await refreshTenantContext();
    }

    renderNavigation();
    renderBannerState();
    renderActiveView();
    setScopedMessage("settings", response.message || "Configuracion actualizada.", "success");
  } catch (error) {
    console.error("[admin:settings] save tenant failed", error);
    setScopedMessage("settings", error?.message || "No se pudo guardar la configuracion del tenant.", "error");
  } finally {
    state.settingsUi.saving = false;
    refreshCurrentViewData();
  }
}

async function saveTenantRole(event) {
  event.preventDefault();

  if (!canManageAdminAccess()) {
    setScopedMessage("roles", "Tu cuenta no tiene permiso para administrar roles.", "error");
    return;
  }

  const labelInput = getViewElement("tenant-role-label");
  const label = labelInput?.value.trim() || "";

  if (!label) {
    setScopedMessage("roles", "Escribe un nombre para el rol antes de guardarlo.", "error");
    return;
  }

  state.settingsUi.roleSubmitting = true;
  setScopedMessage("roles", state.editor.tenantRoleId ? "Guardando cambios del rol..." : "Agregando rol al tenant...", "");
  refreshCurrentViewData();

  try {
    const response = await callAdminCallable("saveTenantRole", {
      roleId: state.editor.tenantRoleId,
      label
    });

    if (Array.isArray(response.roles)) {
      state.tenantRoles = response.roles.map(normalizeTenantRoleEntry).filter(Boolean);
      state.tenantData = {
        ...(state.tenantData || {}),
        roles: response.roles
      };
    } else {
      await refreshTenantContext();
    }

    resetTenantRoleEditor({ preserveMessage: true });
    renderActiveView();
    setScopedMessage("roles", response.message || "Rol guardado.", "success");
  } catch (error) {
    console.error("[admin:settings] save role failed", error);
    setScopedMessage("roles", error?.message || "No se pudo guardar el rol.", "error");
  } finally {
    state.settingsUi.roleSubmitting = false;
    refreshCurrentViewData();
  }
}

async function deleteTenantRole(roleId) {
  if (!canManageAdminAccess()) {
    setScopedMessage("roles", "Tu cuenta no tiene permiso para eliminar roles.", "error");
    return;
  }

  const roleEntry = findTenantRole(roleId);

  if (!roleEntry) {
    return;
  }

  const confirmed = window.confirm(`Vas a eliminar el rol ${roleEntry.label}. Esta accion no se puede deshacer. Deseas continuar?`);

  if (!confirmed) {
    return;
  }

  state.settingsUi.roleDeletingId = roleId;
  setScopedMessage("roles", `Eliminando ${roleEntry.label}...`, "warning");
  refreshCurrentViewData();

  try {
    const response = await callAdminCallable("deleteTenantRole", { roleId });

    if (Array.isArray(response.roles)) {
      state.tenantRoles = response.roles.map(normalizeTenantRoleEntry).filter(Boolean);
      state.tenantData = {
        ...(state.tenantData || {}),
        roles: response.roles
      };
    } else {
      await refreshTenantContext();
    }

    if (state.editor.tenantRoleId === roleId) {
      resetTenantRoleEditor({ preserveMessage: true });
    }

    renderActiveView();
    setScopedMessage("roles", response.message || "Rol eliminado.", "success");
  } catch (error) {
    console.error("[admin:settings] delete role failed", error);
    setScopedMessage("roles", error?.message || "No se pudo eliminar el rol.", "error");
  } finally {
    if (state.settingsUi.roleDeletingId === roleId) {
      state.settingsUi.roleDeletingId = "";
    }

    refreshCurrentViewData();
  }
}

function editManagedAdminEntry(entryId, entryType) {
  state.editor.teamEntryId = entryId;
  state.editor.teamEntryType = entryType;
  const teamEntry = findManagedAdminEntry(entryId, entryType);
  setScopedMessage("team", teamEntry ? `Editando ${teamEntry.displayName || teamEntry.email}.` : "Editando acceso.", "warning");
  populateTeamForm();
  getViewElement("team-display-name")?.focus();
}

async function toggleManagedAdminAccess(entryId) {
  if (!canManageAdminAccess()) {
    setScopedMessage("team", "Tu cuenta no tiene permiso para suspender accesos.", "error");
    return;
  }

  const teamEntry = findManagedAdminEntry(entryId, "admin");

  if (!teamEntry || !canManageTargetAdmin({ ...teamEntry, entryType: "admin" })) {
    return;
  }

  const actionKey = `admin:${entryId}`;
  state.adminAccess.actionId = actionKey;
  setScopedMessage("team", teamEntry.active === false ? `Reactivando ${teamEntry.displayName || teamEntry.email}...` : `Suspendiendo ${teamEntry.displayName || teamEntry.email}...`, "warning");
  refreshCurrentViewData();

  try {
    const response = await callAdminCallable("updateManagedAdminAccess", {
      adminId: entryId,
      displayName: teamEntry.displayName,
      businessName: teamEntry.businessName,
      role: teamEntry.role,
      publicBookingEnabled: teamEntry.publicBookingEnabled !== false,
      active: teamEntry.active === false
    });

    setScopedMessage("team", response.message || "Acceso actualizado.", "success");
    state.adminAccess.loaded = false;
    await loadManagedAdminAccess(true);
  } catch (error) {
    console.error("[admin:team] toggle access failed", error);
    setScopedMessage("team", error?.message || "No se pudo actualizar el acceso del usuario.", "error");
  } finally {
    if (state.adminAccess.actionId === actionKey) {
      state.adminAccess.actionId = "";
    }

    refreshCurrentViewData();
  }
}

async function deleteManagedAdminAccessEntry(entryId, entryType) {
  if (!canManageAdminAccess()) {
    setScopedMessage("team", "Tu cuenta no tiene permiso para eliminar accesos.", "error");
    return;
  }

  const teamEntry = findManagedAdminEntry(entryId, entryType);

  if (!teamEntry) {
    return;
  }

  if (entryType === "admin" && !canManageTargetAdmin({ ...teamEntry, entryType })) {
    setScopedMessage("team", "La cuenta principal del tenant no se puede eliminar desde esta seccion.", "error");
    return;
  }

  const label = teamEntry.displayName || teamEntry.email || "este acceso";
  const confirmed = window.confirm(`Vas a eliminar ${label}. Esta accion no se puede deshacer. Deseas continuar?`);

  if (!confirmed) {
    return;
  }

  const actionKey = `${entryType}:${entryId}`;
  state.adminAccess.actionId = actionKey;
  setScopedMessage("team", `Eliminando ${label}...`, "warning");
  refreshCurrentViewData();

  try {
    const response = await callAdminCallable("deleteManagedAdminAccess", (
      entryType === "invite"
        ? { inviteEmail: teamEntry.email }
        : { adminId: entryId }
    ));

    if (state.editor.teamEntryId === entryId && state.editor.teamEntryType === entryType) {
      resetTeamEditor({ preserveMessage: true });
    }

    setScopedMessage("team", response.message || "Acceso eliminado.", "success");
    state.adminAccess.loaded = false;
    await loadManagedAdminAccess(true);
  } catch (error) {
    console.error("[admin:team] delete access failed", error);
    setScopedMessage("team", error?.message || "No se pudo eliminar el acceso.", "error");
  } finally {
    if (state.adminAccess.actionId === actionKey) {
      state.adminAccess.actionId = "";
    }

    refreshCurrentViewData();
  }
}

async function saveManagedAdminAccess(event) {
  event.preventDefault();

  if (!canManageAdminAccess()) {
    setScopedMessage("team", "Tu cuenta no tiene permiso para administrar accesos.", "error");
    return;
  }

  const displayNameInput = getViewElement("team-display-name");
  const emailInput = getViewElement("team-email");
  const roleInput = getViewElement("team-role");
  const businessNameInput = getViewElement("team-business-name");
  const publicBookingInput = getViewElement("team-public-booking-enabled");
  const displayName = displayNameInput?.value.trim() || "";
  const email = emailInput?.value.trim().toLowerCase() || "";
  const role = roleInput?.value || "";
  const businessName = businessNameInput?.value.trim() || "";
  const isEditing = isEditingManagedAdminEntry();
  const currentEntry = findManagedAdminEntry();

  if (!displayName || (!isEditing && !email) || !role) {
    setScopedMessage("team", "Completa nombre, email y rol antes de crear el acceso.", "error");
    return;
  }

  state.adminAccess.submitting = true;
  setScopedMessage("team", isEditing ? "Guardando cambios del usuario..." : "Creando acceso para el equipo...", "");
  refreshCurrentViewData();

  try {
    const response = isEditing
      ? await callAdminCallable("updateManagedAdminAccess", (
        state.editor.teamEntryType === "invite"
          ? {
            inviteEmail: currentEntry?.email || email,
            displayName,
            businessName,
            role
          }
          : {
            adminId: state.editor.teamEntryId,
            displayName,
            businessName,
            role,
            active: currentEntry?.active !== false,
            publicBookingEnabled: publicBookingInput?.checked !== false
          }
      ))
      : await callAdminCallable("createManagedAdminAccess", {
        displayName,
        email,
        role,
        businessName
      });

    setScopedMessage("team", response.message || (isEditing ? "Acceso actualizado." : "Acceso creado. La persona ya puede reclamarlo iniciando sesion con ese email."), "success");
    event.target.reset();
    resetTeamEditor({ preserveMessage: true });
    state.adminAccess.loaded = false;
    await loadManagedAdminAccess(true);
  } catch (error) {
    console.error("[admin:team] save access failed", error);
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
  const previousAppointments = [...state.appointments];
  state.appointments = state.appointments.map((appointment) => (
    appointment.id === appointmentId
      ? { ...appointment, status }
      : appointment
  ));
  state.appointmentUi.detailFeedback = `Actualizando turno a ${translateAppointmentStatus(status).toLowerCase()}...`;
  refreshCurrentViewData();

  try {
    await updateDoc(tenantDocRef("turnos", appointmentId), {
      status,
      updatedAt: serverTimestamp()
    });
    setScopedMessage("auth", `Turno actualizado a ${translateAppointmentStatus(status).toLowerCase()}.`, "success");
    state.appointmentUi.detailFeedback = `Turno marcado como ${translateAppointmentStatus(status).toLowerCase()}.`;
    refreshCurrentViewData();
  } catch (error) {
    state.appointments = previousAppointments;
    state.appointmentUi.detailFeedback = "No se pudo actualizar el turno. Reintenta en unos segundos.";
    refreshCurrentViewData();
    setScopedMessage("auth", "No se pudo actualizar el turno. Reintenta en unos segundos.", "error");
  }
}

function openAppointmentDetail(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);

  if (!appointment) {
    return;
  }

  state.appointmentUi.detailAppointmentId = appointmentId;
  state.appointmentUi.detailFeedback = "";
  refreshCurrentViewData();
}

function closeAppointmentDetail() {
  if (!state.appointmentUi.detailAppointmentId) {
    return;
  }

  state.appointmentUi.detailAppointmentId = "";
  state.appointmentUi.detailFeedback = "";
  refreshCurrentViewData();
}

function filterAppointmentsByProfessional(professionalId = "all") {
  state.appointmentUi.selectedProfessionalId = professionalId || "all";
  refreshCurrentViewData();
}

function requestAppointmentReschedule(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);

  if (!appointment) {
    return;
  }

  state.appointmentUi.detailAppointmentId = appointmentId;
  state.appointmentUi.detailFeedback = "La reprogramacion queda como siguiente paso funcional. Ya dejamos listo el detalle para conectarlo con un selector de fecha y hora.";
  refreshCurrentViewData();
  setScopedMessage("auth", "La accion de reprogramar quedo preparada en esta vista, pero todavia no guarda una nueva fecha.", "warning");
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
    const tenantId = getTenantId();
    debugLog("profile-upload-start", {
      tenantId,
      userUid: state.user?.uid || "",
      authUid: auth.currentUser?.uid || "",
      email: state.user?.email || "",
      profileActive: Boolean(state.profile?.active),
      membershipRole: state.profile?.membershipRole || "",
      role: state.profile?.role || "",
      fileName: file.name || "",
      fileType: file.type || "",
      fileSize: Number(file.size || 0)
    });

    const webpFile = await convertImageFileToWebp(file);
    const storagePath = `tenants/${tenantId}/admins/${state.user.uid}/profile/avatar.webp`;
    const imageRef = ref(storage, storagePath);

    debugLog("profile-upload-ready", {
      tenantId,
      userUid: state.user?.uid || "",
      authUid: auth.currentUser?.uid || "",
      storageBucket: storage?.app?.options?.storageBucket || "",
      storagePath,
      sourceFileSize: Number(file.size || 0),
      webpFileSize: Number(webpFile.size || 0),
      webpFileType: webpFile.type || ""
    });

    await uploadBytes(imageRef, webpFile, {
      contentType: "image/webp",
      cacheControl: "public,max-age=3600"
    });

    debugLog("profile-upload-storage-success", {
      tenantId,
      userUid: state.user?.uid || "",
      storagePath
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

    debugLog("profile-upload-finished", {
      tenantId,
      userUid: state.user?.uid || "",
      storagePath,
      downloadUrl
    });

    setScopedMessage("profile", "Foto actualizada.", "success");
  } catch (error) {
    debugLog("profile-upload-error", {
      tenantId: getTenantId(),
      userUid: state.user?.uid || "",
      authUid: auth.currentUser?.uid || "",
      email: state.user?.email || "",
      storageBucket: storage?.app?.options?.storageBucket || "",
      errorCode: error?.code || "",
      errorMessage: error?.message || "",
      errorName: error?.name || "",
      errorServerResponse: error?.serverResponse || "",
      errorCustomData: error?.customData || null,
      errorStack: error?.stack || ""
    });
    console.error("[admin-panel] profile-upload-error-raw", error);
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

  if (event.target.classList.contains("appointment-detail-overlay")) {
    closeAppointmentDetail();
    return;
  }

  const actionButton = event.target.closest("[data-action]");

  if (actionButton) {
    const { action, id, status } = actionButton.dataset;

    if (action === "appointment-open" && id) {
      openAppointmentDetail(id);
      return;
    }

    if (action === "appointment-close-detail") {
      closeAppointmentDetail();
      return;
    }

    if (action === "appointment-filter") {
      filterAppointmentsByProfessional(id || "all");
      return;
    }

    if (action === "appointment-status" && id && status) {
      updateAppointmentStatus(id, status);
      return;
    }

    if (action === "appointment-reschedule" && id) {
      requestAppointmentReschedule(id);
      return;
    }

    if (action === "edit-service" && id) {
      editService(id);
      return;
    }

    if (action === "add-service-special-window") {
      addServiceSpecialWindowRow();
      return;
    }

    if (action === "remove-service-special-window") {
      const row = actionButton.closest(".service-special-window");
      row?.remove();

      if (!document.querySelector(".service-special-window")) {
        renderServiceSpecialScheduleEditor([]);
      }

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

    if (action === "edit-team-entry" && id) {
      editManagedAdminEntry(id, actionButton.dataset.entryType || "admin");
      return;
    }

    if (action === "toggle-team-access" && id) {
      toggleManagedAdminAccess(id);
      return;
    }

    if (action === "delete-team-access" && id) {
      deleteManagedAdminAccessEntry(id, actionButton.dataset.entryType || "admin");
      return;
    }

    if (action === "edit-tenant-role" && id) {
      editTenantRole(id);
      return;
    }

    if (action === "delete-tenant-role" && id) {
      deleteTenantRole(id);
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
    return;
  }

  if (event.target.closest("#team-reset")) {
    resetTeamEditor();
    return;
  }

  if (event.target.closest("#tenant-role-reset")) {
    resetTenantRoleEditor();
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
    saveManagedAdminAccess(event);
    return;
  }

  if (event.target.id === "tenant-settings-form") {
    saveTenantSettings(event);
    return;
  }

  if (event.target.id === "tenant-role-form") {
    saveTenantRole(event);
  }
}

function handleViewInput(event) {
  if (event.target.id === "service-is-special") {
    syncServiceSpecialFieldsVisibility();
    return;
  }

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
    return;
  }

  if (event.key === "Escape" && state.appointmentUi.detailAppointmentId) {
    closeAppointmentDetail();
  }
}

function attachEvents() {
  if (!panelDomReady) {
    debugLog("panel-dom-missing", {
      pathname: window.location.pathname,
      missing: {
        sessionAuthButton: !sessionAuthButton,
        profileUploadTrigger: !profileUploadTrigger,
        profileUploadInput: !profileUploadInput,
        sectionNav: !sectionNav,
        viewRoot: !viewRoot
      }
    });
    return;
  }

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
  if (!panelDomReady) {
    return;
  }

  debugLog("bootstrap-auth-start", {
    firebaseReady,
    pathname: window.location.pathname,
    search: window.location.search
  });
  const tenantReady = await loadTenantContext();

  renderNavigation();
  renderBannerState();
  renderActiveView();

  if (!tenantReady) {
    return;
  }

  if (!firebaseReady || !auth || !db) {
    setScopedMessage("auth", "El panel todavia no esta listo para iniciar sesion. Avisale al equipo de Rockeala.", "warning");
    renderActiveView();
    return;
  }

  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, async (user) => {
    debugLog("auth-state-changed", {
      tenantId: state.tenantId,
      uid: user?.uid || "",
      email: user?.email || ""
    });
    clearSubscriptions();
    state.user = user;
    state.authResolved = true;

    if (!user) {
      state.profile = null;
      clearBusinessData();
      clearScopedMessage("auth");
      renderActiveView();
      return;
    }

    clearScopedMessage("auth");
    renderActiveView();
    await loadAdminProfile(user);
  });
}

attachEvents();
bootstrapAuth();
