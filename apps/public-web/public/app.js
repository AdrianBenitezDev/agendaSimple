import { collection, getDocs, orderBy, query, where, httpsCallable } from "./firebase-sdk.js";
import { db, functionsClient, firebaseReady } from "./firebase-client.js";
import { readCatalogCache, writeCatalogCache } from "./catalog-cache.js";
import { fallbackCatalog } from "./fallback-data.js";

const servicesGrid = document.getElementById("services-grid");
const priceList = document.getElementById("price-list");
const syncStatus = document.getElementById("sync-status");
const lastSync = document.getElementById("last-sync");
const catalogCount = document.getElementById("catalog-count");
const catalogSource = document.getElementById("catalog-source");
const publicServiceCount = document.getElementById("public-service-count");
const publicAreaCount = document.getElementById("public-area-count");

const bookingForm = document.getElementById("booking-form");
const areaSelect = document.getElementById("area-select");
const serviceSelect = document.getElementById("service-select");
const requestedStartInput = document.getElementById("requested-start");
const bookingMessage = document.getElementById("booking-message");
const submitBookingButton = document.getElementById("submit-booking");
const selectedServiceCard = document.getElementById("selected-service-card");

const state = {
  services: [],
  selectedArea: "",
  selectedServiceId: ""
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toDateTimeLocalValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function normalizeService(rawService) {
  return {
    id: rawService.id,
    adminId: rawService.adminId || "",
    adminName: rawService.adminName || rawService.businessName || "Equipo Rockeala",
    area: rawService.area || "Servicios",
    name: rawService.name || "Servicio sin nombre",
    price: Number(rawService.price || 0),
    durationMinutes: Number(rawService.durationMinutes || 0),
    description: rawService.description || "Servicio disponible en Rockeala.",
    sortOrder: Number(rawService.sortOrder || 0),
    publicVisible: rawService.publicVisible !== false
  };
}

function groupByArea(services) {
  return services.reduce((accumulator, service) => {
    if (!accumulator[service.area]) {
      accumulator[service.area] = [];
    }

    accumulator[service.area].push(service);
    return accumulator;
  }, {});
}

function setMessage(message, tone = "") {
  bookingMessage.textContent = message;
  bookingMessage.className = "form-message";

  if (tone) {
    bookingMessage.classList.add(`is-${tone}`);
  }
}

function setCatalogMeta(sourceLabel, syncDate) {
  syncStatus.textContent = sourceLabel;
  catalogSource.textContent = sourceLabel;

  if (!syncDate) {
    lastSync.textContent = "Sin sincronizacion todavia";
    return;
  }

  lastSync.textContent = `Ultima actualizacion: ${formatDateTime(syncDate)}`;
}

function renderServices(services) {
  if (services.length === 0) {
    servicesGrid.innerHTML = `
      <article class="empty-state">
        El catalogo publico todavia no tiene servicios visibles.
      </article>
    `;
    return;
  }

  const grouped = groupByArea(services);

  servicesGrid.innerHTML = Object.entries(grouped)
    .map(([area, items], index) => `
      <article class="service-card" style="animation-delay: ${index * 120}ms">
        <p class="eyebrow">${escapeHtml(area)}</p>
        <h3>${escapeHtml(area)} con agenda propia</h3>
        <p>${escapeHtml(items[0].description)}</p>
        <ul>
          ${items.map((item) => `
            <li>
              <strong>${escapeHtml(item.name)}</strong><br>
              <span>${escapeHtml(formatMoney(item.price))} - ${escapeHtml(item.durationMinutes)} min estimados</span>
              <div class="service-provider">${escapeHtml(item.adminName)}</div>
            </li>
          `).join("")}
        </ul>
      </article>
    `)
    .join("");
}

function renderPrices(services) {
  if (services.length === 0) {
    priceList.innerHTML = `
      <article class="empty-state">
        Sin precios visibles todavia.
      </article>
    `;
    return;
  }

  priceList.innerHTML = services
    .map((service) => `
      <article class="price-row">
        <div>
          <strong>${escapeHtml(service.name)}</strong>
          <p>${escapeHtml(service.area)} - ${escapeHtml(service.adminName)}</p>
        </div>
        <p>${escapeHtml(service.durationMinutes)} min estimados</p>
        <strong>${escapeHtml(formatMoney(service.price))}</strong>
      </article>
    `)
    .join("");
}

function renderAreaOptions() {
  const areas = [...new Set(state.services.map((service) => service.area))];

  areaSelect.innerHTML = areas
    .map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`)
    .join("");

  state.selectedArea = state.selectedArea && areas.includes(state.selectedArea)
    ? state.selectedArea
    : areas[0] || "";

  areaSelect.value = state.selectedArea;
}

function renderServiceOptions() {
  const filteredServices = state.services.filter((service) => service.area === state.selectedArea);

  if (filteredServices.length === 0) {
    serviceSelect.innerHTML = `<option value="">No hay servicios para esta area</option>`;
    serviceSelect.disabled = true;
    state.selectedServiceId = "";
    renderSelectedService();
    return;
  }

  serviceSelect.disabled = false;
  serviceSelect.innerHTML = filteredServices
    .map((service) => `
      <option value="${escapeHtml(service.id)}">
        ${escapeHtml(service.name)} - ${escapeHtml(service.adminName)} - ${escapeHtml(formatMoney(service.price))}
      </option>
    `)
    .join("");

  state.selectedServiceId = filteredServices.some((service) => service.id === state.selectedServiceId)
    ? state.selectedServiceId
    : filteredServices[0].id;

  serviceSelect.value = state.selectedServiceId;
  renderSelectedService();
}

function renderSelectedService() {
  const selectedService = state.services.find((service) => service.id === state.selectedServiceId);

  if (!selectedService) {
    selectedServiceCard.innerHTML = `
      <p class="eyebrow">Servicio elegido</p>
      <h3>Elegi un servicio para ver precio y duracion.</h3>
      <p>La duracion del turno es estimada y puede variar segun diagnostico y trabajo final.</p>
    `;
    return;
  }

  selectedServiceCard.innerHTML = `
    <p class="eyebrow">Servicio elegido</p>
    <h3>${escapeHtml(selectedService.name)}</h3>
    <p>${escapeHtml(selectedService.area)} - ${escapeHtml(selectedService.adminName)}</p>
    <p>${escapeHtml(formatMoney(selectedService.price))} - ${escapeHtml(selectedService.durationMinutes)} min estimados</p>
    <p>${escapeHtml(selectedService.description)}</p>
  `;
}

function renderCatalog(services, sourceLabel, syncDate = new Date().toISOString()) {
  const sortedServices = [...services].sort((firstService, secondService) => {
    const areaMatch = firstService.area.localeCompare(secondService.area, "es");

    if (areaMatch !== 0) {
      return areaMatch;
    }

    return firstService.sortOrder - secondService.sortOrder || firstService.name.localeCompare(secondService.name, "es");
  });

  state.services = sortedServices;

  renderServices(sortedServices);
  renderPrices(sortedServices);
  renderAreaOptions();
  renderServiceOptions();

  const areaCount = new Set(sortedServices.map((service) => service.area)).size;
  publicServiceCount.textContent = String(sortedServices.length);
  publicAreaCount.textContent = String(areaCount);
  catalogCount.textContent = `${sortedServices.length} servicios`;
  setCatalogMeta(sourceLabel, syncDate);
}

function validateBookingWindow(rawDateTime) {
  const parsedDate = new Date(rawDateTime);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Elegi una fecha y hora validas.";
  }

  const day = parsedDate.getDay();
  const hour = parsedDate.getHours();

  if (![2, 3, 4, 5, 6].includes(day)) {
    return "Los turnos se solicitan de martes a sabado.";
  }

  if (hour < 10 || hour >= 20) {
    return "La franja disponible para solicitar es de 10:00 a 20:00.";
  }

  return "";
}

async function loadCatalogFromFirestore() {
  const catalogQuery = query(
    collection(db, "servicios"),
    where("publicVisible", "==", true),
    orderBy("area", "asc"),
    orderBy("sortOrder", "asc")
  );

  const snapshot = await getDocs(catalogQuery);

  return snapshot.docs.map((documentSnapshot) => normalizeService({
    id: documentSnapshot.id,
    ...documentSnapshot.data()
  }));
}

async function bootstrapCatalog() {
  const cachedCatalog = await readCatalogCache();

  if (cachedCatalog?.services?.length) {
    renderCatalog(cachedCatalog.services, "Catalogo servido desde IndexedDB", cachedCatalog.syncedAt);
  }

  if (!firebaseReady) {
    renderCatalog(fallbackCatalog.map(normalizeService), "Modo demo local sin Firebase");
    return;
  }

  try {
    const remoteCatalog = await loadCatalogFromFirestore();

    if (remoteCatalog.length === 0 && cachedCatalog?.services?.length) {
      setCatalogMeta("Sin cambios remotos; se mantiene cache local", cachedCatalog.syncedAt);
      return;
    }

    const syncDate = new Date().toISOString();
    renderCatalog(remoteCatalog, "Catalogo sincronizado desde Firestore", syncDate);
    await writeCatalogCache(remoteCatalog, syncDate);
  } catch (error) {
    if (cachedCatalog?.services?.length) {
      setCatalogMeta("Error remoto; se mantiene cache local", cachedCatalog.syncedAt);
      return;
    }

    renderCatalog(fallbackCatalog.map(normalizeService), "Error de Firebase; se usa catalogo demo");
  }
}

async function handleBookingSubmit(event) {
  event.preventDefault();

  const selectedService = state.services.find((service) => service.id === serviceSelect.value);

  if (!selectedService) {
    setMessage("Primero elegi un servicio valido.", "error");
    return;
  }

  const bookingWindowError = validateBookingWindow(requestedStartInput.value);

  if (bookingWindowError) {
    setMessage(bookingWindowError, "error");
    return;
  }

  if (!firebaseReady || !functionsClient) {
    setMessage("Falta completar la configuracion de Firebase para enviar solicitudes reales.", "error");
    return;
  }

  submitBookingButton.disabled = true;
  setMessage("Enviando solicitud...", "");

  try {
    const submitAppointmentRequest = httpsCallable(functionsClient, "submitAppointmentRequest");
    const response = await submitAppointmentRequest({
      adminId: selectedService.adminId,
      serviceId: selectedService.id,
      requestedStartAt: new Date(requestedStartInput.value).toISOString(),
      client: {
        fullName: document.getElementById("client-name").value.trim(),
        phone: document.getElementById("client-phone").value.trim(),
        email: document.getElementById("client-email").value.trim()
      },
      notes: document.getElementById("client-notes").value.trim()
    });

    const appointmentId = response.data?.appointmentId || "sin-id";
    setMessage(`Solicitud enviada. Codigo de seguimiento: ${appointmentId}.`, "success");
    bookingForm.reset();
    requestedStartInput.value = toDateTimeLocalValue(new Date(Date.now() + 86400000));
    renderAreaOptions();
    renderServiceOptions();
  } catch (error) {
    setMessage(error.message || "No se pudo enviar la solicitud.", "error");
  } finally {
    submitBookingButton.disabled = false;
  }
}

function attachEvents() {
  areaSelect.addEventListener("change", () => {
    state.selectedArea = areaSelect.value;
    renderServiceOptions();
  });

  serviceSelect.addEventListener("change", () => {
    state.selectedServiceId = serviceSelect.value;
    renderSelectedService();
  });

  bookingForm.addEventListener("submit", handleBookingSubmit);
}

function setInitialDateTime() {
  const tomorrow = new Date(Date.now() + 86400000);
  requestedStartInput.value = toDateTimeLocalValue(tomorrow);
}

setInitialDateTime();
attachEvents();
bootstrapCatalog();
