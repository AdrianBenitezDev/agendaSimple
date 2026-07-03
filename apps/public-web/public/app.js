import { collection, doc, getDoc, getDocs, orderBy, query, where, httpsCallable } from "./firebase-sdk.js";
import { db, functionsClient, firebaseReady } from "./firebase-client.js";
import { readCatalogCache, writeCatalogCache } from "./catalog-cache.js";
import { publicSiteConfig } from "./site-config.js";
import { resolvePublicTenantId } from "./tenant.js";

const servicesGrid = document.getElementById("services-grid");
const priceList = document.getElementById("price-list");
const productsGrid = document.getElementById("products-grid");
const syncStatus = document.getElementById("sync-status");
const lastSync = document.getElementById("last-sync");
const catalogCount = document.getElementById("catalog-count");
const catalogSource = document.getElementById("catalog-source");
const professionalBanner = document.getElementById("professional-banner");
const professionalList = document.getElementById("professional-list");
const publicServiceCount = document.getElementById("public-service-count");
const publicAreaCount = document.getElementById("public-area-count");
const publicProductCount = document.getElementById("public-product-count");
const salonCarouselImage = document.getElementById("salon-carousel-image");
const salonCarouselTitle = document.getElementById("salon-carousel-title");
const salonCarouselCount = document.getElementById("salon-carousel-count");
const salonCarouselDots = document.getElementById("salon-carousel-dots");
const salonCarouselPrev = document.getElementById("salon-carousel-prev");
const salonCarouselNext = document.getElementById("salon-carousel-next");
const whatsAppFloat = document.getElementById("whatsapp-float");
const sectionBanner = document.querySelector(".section-banner");
const pageSections = [...document.querySelectorAll(".page-section")];
const sectionTriggers = [...document.querySelectorAll("[data-section-target]")];
const serviceCountCard = publicServiceCount?.closest("article");
const areaCountCard = publicAreaCount?.closest("article");
const catalogCountBadge = catalogCount?.closest(".price-board__badge");
const productCountBadge = publicProductCount?.closest(".price-board__badge");
const footerContactBlock = document.getElementById("footer-contact-block");
const footerWhatsappLink = document.getElementById("footer-whatsapp-link");

const bookingForm = document.getElementById("booking-form");
const areaSelect = document.getElementById("area-select");
const serviceSelect = document.getElementById("service-select");
const requestedStartInput = document.getElementById("requested-start");
const bookingMessage = document.getElementById("booking-message");
const submitBookingButton = document.getElementById("submit-booking");
const selectedServiceCard = document.getElementById("selected-service-card");
const dayPicker = document.getElementById("booking-day-picker");
const timePicker = document.getElementById("booking-time-picker");
const selectedDateSummary = document.getElementById("selected-date-summary");
const selectedTimeSummary = document.getElementById("selected-time-summary");
const availabilityNote = document.getElementById("availability-note");
const serviceOverlay = document.getElementById("service-overlay");
const serviceOverlayBody = document.getElementById("service-overlay-body");
const serviceOverlayPanel = document.getElementById("service-overlay-panel");

const BOOKING_RULES = {
  openDays: [2, 3, 4, 5, 6],
  openHour: 10,
  closeHour: 20,
  slotIntervalMinutes: 30,
  daysToShow: 12,
  minLeadMinutes: 60
};

const DEFAULT_CATALOG_SOURCE_COPY = "Conocé nuestros servicios y revisá los precios antes de reservar.";
const DEFAULT_CATALOG_LAST_SYNC_COPY = "Atendemos de martes a sábado de 10 a 20 hs.";

const state = {
  tenantId: "",
  tenantData: null,
  services: [],
  adminProfiles: [],
  products: [],
  salonMedia: [],
  selectedProfessionalKey: "",
  selectedArea: "",
  selectedServiceId: "",
  activePriceServiceId: "",
  activePriceServiceImageIndex: 0,
  activePriceServiceLoading: false,
  activePriceServiceRequestId: 0,
  bookingDays: [],
  selectedDateKey: "",
  selectedTimeMinutes: null,
  activeSalonSlideIndex: 0,
  activeSection: "precios",
  catalogStatus: "loading",
  productsStatus: "loading"
};

let lastOverlayTrigger = null;

function getTenantId() {
  return state.tenantId;
}

function tenantCollection(collectionName) {
  return collection(db, "tenants", getTenantId(), collectionName);
}

function getTenantBrandName() {
  return state.tenantData?.businessName
    || state.tenantData?.name
    || publicSiteConfig.defaultBrandName
    || "Salon";
}

function getTenantWhatsAppPhone() {
  return state.tenantData?.whatsAppPhone || publicSiteConfig.whatsAppPhone || "";
}

function getTenantWhatsAppMessage() {
  return state.tenantData?.whatsAppMessage || publicSiteConfig.whatsAppMessage || `Hola ${getTenantBrandName()}, quiero reservar un turno.`;
}

const publicRoleCatalog = {
  peluqueria: {
    roleLabel: "Estilista",
    publicArea: "Peluquería"
  },
  manicura: {
    roleLabel: "Manicura",
    publicArea: "Manicura"
  },
  depilacion: {
    roleLabel: "Depilación",
    publicArea: "Depilación"
  },
  barberia: {
    roleLabel: "Barbería",
    publicArea: "Barbería"
  }
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

function formatDuration(minutes) {
  if (!minutes) {
    return "Duración a confirmar";
  }

  return `${minutes} min`;
}

function toDateTimeLocalValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function getServiceProfessionalKey(service) {
  return service?.adminId || service?.adminName || service?.name || "";
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey ?? "").split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function createDateWithTime(dateKey, minutes) {
  const baseDate = parseDateKey(dateKey);

  if (!baseDate) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutePart,
    0,
    0
  );
}

function formatCalendarWeekday(date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short"
  }).format(date).replaceAll(".", "");
}

function formatCalendarMonth(date) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "short"
  }).format(date).replaceAll(".", "");
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function formatTimeLabel(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minutePart = String(minutes % 60).padStart(2, "0");
  return `${hours}:${minutePart}`;
}

function formatSelectedSlotText(dateKey, minutes) {
  const slotDate = createDateWithTime(dateKey, minutes);

  if (!slotDate) {
    return "Seleccioná día y horario para completar la reserva.";
  }

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(slotDate);
}

function createAvatarPlaceholder(name) {
  const initials = String(name || "RK")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "RK";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${escapeHtml(name || "Rockeala Salón")}">
      <defs>
        <linearGradient id="publicAvatarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#e8b8bf" />
          <stop offset="100%" stop-color="#b81622" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="120" fill="url(#publicAvatarGradient)" />
      <text
        x="50%"
        y="54%"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="#ffffff"
        font-family="Manrope, Arial, sans-serif"
        font-size="84"
        font-weight="700"
      >${escapeHtml(initials)}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeHintText(values) {
  return []
    .concat(values || [])
    .flat()
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferPublicRoleFromText(values) {
  const hintText = normalizeHintText(values);

  if (!hintText) {
    return "";
  }

  if (includesAnyKeyword(hintText, ["barber", "barba", "afeitad", "fade", "degrad"])) {
    return "barberia";
  }

  if (includesAnyKeyword(hintText, ["manic", "unas", "uñas", "semi", "kapping", "esmalt", "cuticul", "nail"])) {
    return "manicura";
  }

  if (includesAnyKeyword(hintText, ["depil", "ceja", "bozo", "axila", "pierna", "perfilad", "cera"])) {
    return "depilacion";
  }

  if (includesAnyKeyword(hintText, ["peluquer", "estil", "cabello", "corte", "peinad", "color", "tint", "mecha", "balayage", "alis", "reflej", "brushing", "keratina"])) {
    return "peluqueria";
  }

  return "";
}

function resolvePublicRoleKey(rawRole = "", rawArea = "", extraHints = []) {
  const normalizedRole = String(rawRole || "").trim().toLowerCase();

  if (publicRoleCatalog[normalizedRole]) {
    return normalizedRole;
  }

  return inferPublicRoleFromText([rawArea, extraHints]) || "peluqueria";
}

function buildPublicRoleSummary({ rawRole = "", rawArea = "", extraHints = [] } = {}) {
  const roleKey = resolvePublicRoleKey(rawRole, rawArea, extraHints);
  const roleMeta = publicRoleCatalog[roleKey] || publicRoleCatalog.peluqueria;
  const explicitArea = String(rawArea || "").trim();
  const normalizedArea = normalizeHintText(explicitArea);

  return {
    role: roleKey,
    roleLabel: roleMeta.roleLabel,
    publicArea: explicitArea && !normalizedArea.includes("servicios")
      ? explicitArea
      : roleMeta.publicArea
  };
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

function normalizeServiceImageGallery(rawService = {}) {
  const gallerySources = [
    ...(Array.isArray(rawService.imageGallery) ? rawService.imageGallery : []),
    ...(Array.isArray(rawService.imageUrls) ? rawService.imageUrls : []),
    ...(Array.isArray(rawService.images) ? rawService.images : []),
    ...(Array.isArray(rawService.gallery) ? rawService.gallery : [])
  ];

  const normalizedGallery = gallerySources
    .map((entry) => (
      typeof entry === "string"
        ? entry
        : (entry?.imageUrl || entry?.url || "")
    ))
    .map((imageUrl) => String(imageUrl || "").trim())
    .filter(Boolean);

  const primaryImageUrl = String(rawService.imageUrl || "").trim();

  if (primaryImageUrl) {
    normalizedGallery.unshift(primaryImageUrl);
  }

  return normalizedGallery.filter((imageUrl, index, imageUrls) => imageUrls.indexOf(imageUrl) === index);
}

function normalizeService(rawService) {
  const imageGallery = normalizeServiceImageGallery(rawService);

  return {
    id: rawService.id,
    adminId: rawService.adminId || "",
    adminName: rawService.adminName || rawService.businessName || "Equipo Rockeala",
    area: rawService.area || "Servicios",
    name: rawService.name || "Servicio sin nombre",
    price: Number(rawService.price || 0),
    durationMinutes: Number(rawService.durationMinutes || 0),
    description: rawService.description || "Servicio disponible en Rockeala Salón.",
    sortOrder: Number(rawService.sortOrder || 0),
    publicVisible: rawService.publicVisible !== false,
    isSpecial: rawService.isSpecial === true,
    specialSchedule: normalizeServiceSpecialSchedule(rawService.specialSchedule),
    imageUrl: imageGallery[0] || "",
    imageGallery
  };
}

function normalizePublicAdmin(rawAdmin) {
  const displayName = rawAdmin.displayName || rawAdmin.businessName || "Equipo Rockeala";
  const publicArea = rawAdmin.publicArea || rawAdmin.area || "Servicios";
  const roleSummary = buildPublicRoleSummary({
    rawRole: rawAdmin.role,
    rawArea: publicArea,
    extraHints: [displayName, rawAdmin.slug || ""]
  });

  return {
    id: rawAdmin.id || "",
    displayName,
    role: roleSummary.role,
    roleLabel: rawAdmin.roleLabel || roleSummary.roleLabel,
    publicArea: roleSummary.publicArea,
    photoUrl: rawAdmin.photoUrl || "",
    slug: rawAdmin.slug || ""
  };
}

function normalizeProduct(rawProduct) {
  return {
    id: rawProduct.id,
    adminId: rawProduct.adminId || "",
    adminName: rawProduct.adminName || rawProduct.businessName || "Equipo Rockeala",
    category: rawProduct.category || "Producto",
    brand: rawProduct.brand || "",
    name: rawProduct.name || "Producto sin nombre",
    description: rawProduct.description || "Producto disponible en Rockeala Salón.",
    price: Number(rawProduct.price || 0),
    quantity: Number(rawProduct.quantity || 0),
    imageUrl: rawProduct.imageUrl || ""
  };
}

function normalizeSalonMedia(rawMedia) {
  return {
    id: rawMedia.id || "",
    title: String(rawMedia.title || "").trim(),
    imageUrl: rawMedia.imageUrl || "",
    visible: rawMedia.visible !== false,
    sortOrder: Number(rawMedia.sortOrder || 0),
    createdAt: rawMedia.createdAt || null,
    updatedAt: rawMedia.updatedAt || null
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

function buildPublicAdminCards(services) {
  const publicProfilesById = new Map(
    state.adminProfiles
      .filter((profile) => profile.id)
      .map((profile) => [profile.id, profile])
  );

  const groupedProfiles = services.reduce((accumulator, service) => {
    const adminKey = service.adminId || service.adminName || service.name;

    if (!accumulator.has(adminKey)) {
      const roleSummary = buildPublicRoleSummary({
        rawArea: service.area,
        extraHints: [service.name, service.description, service.adminName]
      });

      accumulator.set(adminKey, {
        id: service.adminId || "",
        selectionKey: adminKey,
        displayName: service.adminName || "Equipo Rockeala",
        role: roleSummary.role,
        roleLabel: roleSummary.roleLabel,
        publicArea: roleSummary.publicArea,
        photoUrl: "",
        services: []
      });
    }

    accumulator.get(adminKey).services.push(service);
    return accumulator;
  }, new Map());

  return [...groupedProfiles.values()]
    .map((adminProfile) => {
      const publicProfile = adminProfile.id ? publicProfilesById.get(adminProfile.id) : null;
      const mergedServices = [...adminProfile.services].sort((firstService, secondService) => (
        firstService.sortOrder - secondService.sortOrder || firstService.name.localeCompare(secondService.name, "es")
      ));
      const minPrice = Math.min(...mergedServices.map((service) => service.price));
      const displayName = publicProfile?.displayName || adminProfile.displayName;
      const roleSummary = buildPublicRoleSummary({
        rawRole: publicProfile?.role || adminProfile.role,
        rawArea: publicProfile?.publicArea || adminProfile.publicArea,
        extraHints: [
          displayName,
          publicProfile?.slug || "",
          ...mergedServices.map((service) => [service.area, service.name, service.description].join(" "))
        ]
      });

      return {
        id: adminProfile.id,
        selectionKey: adminProfile.selectionKey,
        displayName,
        role: roleSummary.role,
        roleLabel: roleSummary.roleLabel,
        publicArea: roleSummary.publicArea,
        photoUrl: publicProfile?.photoUrl || createAvatarPlaceholder(displayName),
        minPrice,
        serviceCount: mergedServices.length,
        previewServices: mergedServices.slice(0, 3),
        primaryService: mergedServices[0] || null
      };
    })
    .sort((firstProfile, secondProfile) => firstProfile.displayName.localeCompare(secondProfile.displayName, "es"));
}

function getProfessionalCards(services = state.services) {
  return buildPublicAdminCards(services);
}

function syncSelectedProfessionalKey(professionalCards = getProfessionalCards()) {
  const availableKeys = professionalCards
    .map((professionalCard) => professionalCard.selectionKey)
    .filter(Boolean);

  if (!availableKeys.length) {
    state.selectedProfessionalKey = "";
    return;
  }

  if (!availableKeys.includes(state.selectedProfessionalKey)) {
    state.selectedProfessionalKey = availableKeys[0];
  }
}

function getSelectedProfessionalCard(professionalCards = getProfessionalCards()) {
  return professionalCards.find((professionalCard) => professionalCard.selectionKey === state.selectedProfessionalKey) || null;
}

function getVisiblePriceServices(services = state.services) {
  if (!state.selectedProfessionalKey) {
    return services;
  }

  return services.filter((service) => getServiceProfessionalKey(service) === state.selectedProfessionalKey);
}

function syncStickyBannerOffset() {
  const offset = Math.ceil((sectionBanner?.offsetHeight || 0) + 24);
  document.documentElement.style.setProperty("--sticky-banner-offset", `${Math.max(offset, 158)}px`);
}

function syncPriceBoardMeta(services, selectedProfessional) {
  if (state.catalogStatus !== "ready") {
    return;
  }

  if (!selectedProfessional) {
    catalogSource.textContent = DEFAULT_CATALOG_SOURCE_COPY;
    lastSync.textContent = DEFAULT_CATALOG_LAST_SYNC_COPY;
    catalogCount.textContent = `${services.length} ${services.length === 1 ? "servicio" : "servicios"}`;
    return;
  }

  catalogSource.textContent = `Precios de ${selectedProfessional.displayName}.`;
  lastSync.textContent = `${selectedProfessional.roleLabel} - ${selectedProfessional.publicArea}.`;
  catalogCount.textContent = `${services.length} ${services.length === 1 ? "servicio" : "servicios"}`;
}

function getSelectedService() {
  return state.services.find((service) => service.id === state.selectedServiceId) || null;
}

function getSelectedServiceDuration() {
  const selectedService = getSelectedService();
  return Math.max(30, Number(selectedService?.durationMinutes || 60));
}

function getSpecialScheduleEntriesForDate(service, dateKey) {
  return normalizeServiceSpecialSchedule(service?.specialSchedule).filter((entry) => entry.dateKey === dateKey);
}

function setMessage(message, tone = "") {
  bookingMessage.textContent = message;
  bookingMessage.className = "form-message";

  if (tone) {
    bookingMessage.classList.add(`is-${tone}`);
  }
}

function setVisibility(element, visible) {
  if (!element) {
    return;
  }

  element.hidden = !visible;
}

function getSectionElement(sectionId) {
  return pageSections.find((section) => section.dataset.sectionId === sectionId) || null;
}

function updateSectionNavigation() {
  sectionTriggers.forEach((trigger) => {
    const isActive = trigger.dataset.sectionTarget === state.activeSection;
    trigger.classList.toggle("is-active", isActive);

    if (trigger.tagName === "BUTTON") {
      trigger.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  });
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

function buildFallbackSalonSlides() {
  const fallbackSrc = String(publicSiteConfig.salonImage?.src || "").trim();

  if (!fallbackSrc) {
    return [];
  }

  return [{
    id: "fallback-salon-slide",
    title: "Rockeala Salón",
    imageUrl: fallbackSrc,
    alt: publicSiteConfig.salonImage?.alt || "Espacio Rockeala Salón listo para recibirte.",
    visible: true,
    sortOrder: 0
  }];
}

function getPublicSalonSlides() {
  const visibleSlides = getSortedSalonMedia(state.salonMedia)
    .filter((item) => item.visible !== false && item.imageUrl);

  return visibleSlides.length ? visibleSlides : buildFallbackSalonSlides();
}

function getActiveSalonSlide(slides = getPublicSalonSlides()) {
  if (!slides.length) {
    state.activeSalonSlideIndex = 0;
    return null;
  }

  if (state.activeSalonSlideIndex < 0 || state.activeSalonSlideIndex >= slides.length) {
    state.activeSalonSlideIndex = 0;
  }

  return slides[state.activeSalonSlideIndex] || slides[0];
}

function renderActiveSectionContent() {
  if (state.activeSection === "servicios") {
    renderServices(state.services);
    return;
  }

  if (state.activeSection === "precios") {
    renderPrices(state.services);
    return;
  }

  if (state.activeSection === "productos") {
    renderProducts(state.products);
    return;
  }

  if (state.activeSection === "salon") {
    renderSalonCarousel();
    return;
  }

  if (state.activeSection === "turnos") {
    renderAreaOptions();
    renderServiceOptions();
    refreshBookingUi();
  }
}

function setActiveSection(sectionId, options = {}) {
  const targetSection = getSectionElement(sectionId);

  if (!targetSection) {
    return;
  }

  if (sectionId !== "precios" && serviceOverlay && !serviceOverlay.hidden) {
    closePriceServiceOverlay({ restoreFocus: false });
  }

  state.activeSection = sectionId;

  pageSections.forEach((section) => {
    section.hidden = section !== targetSection;
  });

  updateSectionNavigation();
  renderActiveSectionContent();

  if (options.scroll !== false) {
    targetSection.scrollIntoView({
      behavior: options.behavior || "smooth",
      block: "start"
    });
  }
}

function setCatalogMeta({ status = "ready", serviceCount = 0, areaCount = 0 } = {}) {
  state.catalogStatus = status;

  if (status === "loading") {
    syncStatus.textContent = "Cargando servicios...";
    catalogSource.textContent = "Cargando servicios...";
    lastSync.textContent = "En unos segundos vas a poder ver nuestros precios y opciones.";
    publicServiceCount.textContent = "";
    publicAreaCount.textContent = "";
    catalogCount.textContent = "Cargando servicios...";
    setVisibility(serviceCountCard, false);
    setVisibility(areaCountCard, false);
    setVisibility(catalogCountBadge, true);
    return;
  }

  if (status === "empty") {
    syncStatus.textContent = "Pronto novedades";
    catalogSource.textContent = "Pronto vamos a publicar más servicios y precios.";
    lastSync.textContent = "Mientras tanto, podés reservar tu turno y te ayudamos a elegir la mejor opción.";
    publicServiceCount.textContent = "";
    publicAreaCount.textContent = "";
    catalogCount.textContent = "";
    setVisibility(serviceCountCard, false);
    setVisibility(areaCountCard, false);
    setVisibility(catalogCountBadge, false);
    return;
  }

  syncStatus.textContent = "Servicios disponibles";
  catalogSource.textContent = "Conocé nuestros servicios y revisá los precios antes de reservar.";
  lastSync.textContent = "Atendemos de martes a sábado de 10 a 20 hs.";
  publicServiceCount.textContent = String(serviceCount);
  publicAreaCount.textContent = String(areaCount);
  catalogCount.textContent = `${serviceCount} ${serviceCount === 1 ? "servicio" : "servicios"}`;
  setVisibility(serviceCountCard, serviceCount > 0);
  setVisibility(areaCountCard, areaCount > 0);
  setVisibility(catalogCountBadge, true);
}

function setProductsMeta({ status = "ready", productCount = 0 } = {}) {
  state.productsStatus = status;

  if (status === "loading") {
    publicProductCount.textContent = "Cargando productos...";
    setVisibility(productCountBadge, true);
    return;
  }

  if (productCount === 0) {
    setVisibility(productCountBadge, false);
    return;
  }

  publicProductCount.textContent = `${productCount} ${productCount === 1 ? "producto" : "productos"}`;
  setVisibility(productCountBadge, true);
}

function getProductStockCopy(product) {
  if (product.quantity === 0) {
    return {
      label: "Sin stock",
      detail: "Consultá por reposición en el salón.",
      toneClass: "is-out"
    };
  }

  if (product.quantity <= 3) {
    return {
      label: "Últimas unidades",
      detail: "Quedan pocas disponibles.",
      toneClass: "is-low"
    };
  }

  return {
    label: "Disponible",
    detail: "Disponible en el salón.",
    toneClass: ""
  };
}

function renderSalonCarousel() {
  if (!salonCarouselImage || !salonCarouselTitle || !salonCarouselCount || !salonCarouselDots) {
    return;
  }

  const slides = getPublicSalonSlides();
  const activeSlide = getActiveSalonSlide(slides);

  if (!activeSlide) {
    salonCarouselImage.removeAttribute("src");
    salonCarouselImage.alt = "";
    salonCarouselTitle.textContent = "Rockeala Salón";
    salonCarouselCount.textContent = "";
    salonCarouselDots.innerHTML = "";

    if (salonCarouselPrev) {
      salonCarouselPrev.disabled = true;
    }

    if (salonCarouselNext) {
      salonCarouselNext.disabled = true;
    }

    return;
  }

  const activeIndex = state.activeSalonSlideIndex;
  const slideTitle = activeSlide.title || `Imagen ${activeIndex + 1}`;
  const slideAlt = activeSlide.alt || slideTitle;

  salonCarouselImage.src = activeSlide.imageUrl;
  salonCarouselImage.alt = slideAlt;
  salonCarouselTitle.textContent = slideTitle;
  salonCarouselCount.textContent = `${activeIndex + 1} / ${slides.length}`;
  salonCarouselDots.innerHTML = slides
    .map((slide, index) => {
      const isActive = index === activeIndex;
      const label = slide.title || `Imagen ${index + 1}`;

      return `
        <button
          type="button"
          class="salon-carousel__dot ${isActive ? "is-active" : ""}"
          data-salon-slide-index="${escapeHtml(index)}"
          aria-label="Ver ${escapeHtml(label)}"
          aria-pressed="${isActive ? "true" : "false"}"
        ></button>
      `;
    })
    .join("");

  if (salonCarouselPrev) {
    salonCarouselPrev.disabled = slides.length <= 1;
  }

  if (salonCarouselNext) {
    salonCarouselNext.disabled = slides.length <= 1;
  }
}

function selectSalonSlide(index) {
  const slides = getPublicSalonSlides();
  const normalizedIndex = Number(index);

  if (!slides.length || Number.isNaN(normalizedIndex)) {
    return;
  }

  state.activeSalonSlideIndex = ((normalizedIndex % slides.length) + slides.length) % slides.length;
  renderSalonCarousel();
}

function shiftSalonSlide(direction) {
  const slides = getPublicSalonSlides();

  if (slides.length <= 1) {
    return;
  }

  state.activeSalonSlideIndex = (
    (state.activeSalonSlideIndex + Number(direction || 0)) % slides.length + slides.length
  ) % slides.length;

  renderSalonCarousel();
}

function renderTenantFailure(message, detail = "") {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:32px;background:#f6eee8;color:#241717;font-family:Manrope,Arial,sans-serif">
      <section style="max-width:640px;background:#fffaf6;border:1px solid #e6d4c8;border-radius:24px;padding:32px;box-shadow:0 24px 60px rgba(36,23,23,0.12)">
        <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8d5d47">Tenant</p>
        <h1 style="margin:0 0 12px;font-family:'Cormorant Garamond',serif;font-size:44px;line-height:1">Negocio no disponible</h1>
        <p style="margin:0 0 12px;font-size:18px;line-height:1.5">${escapeHtml(message)}</p>
        ${detail ? `<p style="margin:0;font-size:15px;line-height:1.5;color:#6d5750">${escapeHtml(detail)}</p>` : ""}
      </section>
    </main>
  `;
}

function applyTenantBranding() {
  const brandName = getTenantBrandName();
  document.title = state.tenantData?.businessName
    ? `${state.tenantData.businessName} | Servicios y turnos`
    : (publicSiteConfig.defaultPageTitle || `${brandName} | Servicios y turnos`);

  const brandTitle = document.querySelector(".section-banner__brand strong");
  const heroEyebrow = document.querySelector(".hero-copy .eyebrow");
  const footerEyebrow = document.querySelector(".site-footer__brand .eyebrow");
  const footerTitle = document.querySelector(".site-footer__brand h3");
  const footerCopy = document.querySelector(".site-footer__brand p:last-of-type");

  if (brandTitle) {
    brandTitle.textContent = brandName;
  }

  if (heroEyebrow) {
    heroEyebrow.textContent = brandName;
  }

  if (footerEyebrow) {
    footerEyebrow.textContent = brandName;
  }

  if (footerTitle) {
    footerTitle.textContent = brandName;
  }

  if (footerCopy && state.tenantData?.businessName) {
    footerCopy.textContent = state.tenantData.businessName;
  }
}

function buildWhatsAppUrl() {
  const phone = normalizePhone(getTenantWhatsAppPhone());
  const message = encodeURIComponent(getTenantWhatsAppMessage());

  if (phone) {
    return `https://wa.me/${phone}?text=${message}`;
  }

  return `https://api.whatsapp.com/send?text=${message}`;
}

function configureWhatsAppBubble() {
  if (!whatsAppFloat) {
    return;
  }

  whatsAppFloat.href = buildWhatsAppUrl();

  if (!normalizePhone(getTenantWhatsAppPhone())) {
    whatsAppFloat.dataset.mode = "fallback";
  } else {
    delete whatsAppFloat.dataset.mode;
  }
}

function configureFooterContact() {
  const phone = normalizePhone(getTenantWhatsAppPhone());

  if (!phone || !footerContactBlock || !footerWhatsappLink) {
    if (footerContactBlock) {
      footerContactBlock.hidden = true;
    }
    return;
  }

  footerWhatsappLink.href = buildWhatsAppUrl();
  footerContactBlock.hidden = false;
}

function renderServices(services) {
  if (services.length === 0) {
    servicesGrid.innerHTML = `
      <article class="empty-state">
        ${state.catalogStatus === "loading"
          ? "Cargando servicios..."
          : "Pronto vamos a publicar más servicios y precios."}
      </article>
    `;
    return;
  }

  const adminCards = buildPublicAdminCards(services);

  servicesGrid.innerHTML = adminCards
    .map((adminProfile, index) => `
      <article class="service-card service-card--admin" style="animation-delay: ${index * 120}ms">
        <div class="service-card__avatar-shell">
          <img
            class="service-card__avatar"
            src="${escapeHtml(adminProfile.photoUrl)}"
            alt="Foto de perfil de ${escapeHtml(adminProfile.displayName)}"
            loading="lazy"
          >
        </div>
        <div class="service-card__body">
          <div class="service-card__header">
            <p class="eyebrow">${escapeHtml(adminProfile.publicArea)}</p>
            <span class="service-card__count">${escapeHtml(adminProfile.serviceCount)} ${adminProfile.serviceCount === 1 ? "servicio" : "servicios"}</span>
          </div>
          <h3>${escapeHtml(adminProfile.displayName)}</h3>
          <p class="service-card__role">${escapeHtml(adminProfile.roleLabel)}</p>
          <p class="service-card__hint">Desde ${escapeHtml(formatMoney(adminProfile.minPrice))}</p>
          <div class="service-card__tags">
            ${adminProfile.previewServices.map((service) => `
              <span class="service-card__tag">${escapeHtml(service.name)}</span>
            `).join("")}
          </div>
          <div class="service-card__actions">
            <button
              type="button"
              class="button button-primary button-small"
              data-service-action="booking"
              data-admin-id="${escapeHtml(adminProfile.id)}"
            >Obtener turno</button>
            <button
              type="button"
              class="button button-secondary button-small"
              data-service-action="prices"
              data-professional-key="${escapeHtml(adminProfile.selectionKey)}"
              data-admin-id="${escapeHtml(adminProfile.id)}"
            >Ver precios</button>
          </div>
        </div>
      </article>
    `)
    .join("");
}

function renderProfessionalBanner(services) {
  if (!professionalBanner || !professionalList) {
    return;
  }

  if (services.length === 0) {
    professionalList.innerHTML = "";
    professionalBanner.hidden = true;
    syncStickyBannerOffset();
    return;
  }

  const professionalCards = getProfessionalCards(services);
  syncSelectedProfessionalKey(professionalCards);

  professionalList.innerHTML = professionalCards
    .map((professionalCard) => {
      const isActive = professionalCard.selectionKey === state.selectedProfessionalKey;

//  <span class="professional-chip__identity">
//               <strong>${escapeHtml(professionalCard.displayName)}</strong>
//             </span>

      return `
        <button
          type="button"
          class="professional-chip ${isActive ? "is-active" : ""}"
          data-professional-key="${escapeHtml(professionalCard.selectionKey)}"
          aria-pressed="${isActive ? "true" : "false"}"
        >
          <div class="professional-chip__main">
            <img
              class="professional-chip__avatar"
              src="${escapeHtml(professionalCard.photoUrl)}"
              alt="Foto de perfil de ${escapeHtml(professionalCard.displayName)}"
              loading="lazy"
            >
            <span class="professional-chip__role">${escapeHtml(professionalCard.roleLabel)}</span>
           
          </div>
          
        </button>
      `;
    })
    .join("");

  professionalBanner.hidden = false;
  syncStickyBannerOffset();
}

function renderPrices(services) {
  const professionalCards = getProfessionalCards(state.services);
  syncSelectedProfessionalKey(professionalCards);
  const selectedProfessional = getSelectedProfessionalCard(professionalCards);
  const visibleServices = getVisiblePriceServices(services);

  syncPriceBoardMeta(visibleServices, selectedProfessional);

  if (state.activePriceServiceId && !visibleServices.some((service) => service.id === state.activePriceServiceId)) {
    closePriceServiceOverlay({ restoreFocus: false });
  }

  if (visibleServices.length === 0) {
    priceList.innerHTML = `
      <article class="empty-state">
        ${state.catalogStatus === "loading"
          ? "Cargando precios..."
          : "Pronto vamos a publicar más servicios y precios."}
      </article>
    `;
    return;
  }

  priceList.innerHTML = `
    <div class="price-service-grid">
      ${visibleServices.map((service) => `
        <button
          type="button"
          class="price-service-card"
          data-price-service-id="${escapeHtml(service.id)}"
          aria-label="${escapeHtml(`Ver detalle de ${service.name}`)}"
        >
          <span class="price-service-card__eyebrow">${escapeHtml(service.adminName)}</span>
          <span class="price-service-card__top">
            <strong>${escapeHtml(service.name)}</strong>
            <span class="price-service-card__price">${escapeHtml(formatMoney(service.price))}</span>
          </span>
          <span class="price-service-card__meta">
            <span>${escapeHtml(service.area)}</span>
            <span>${escapeHtml(formatDuration(service.durationMinutes))}</span>
          </span>
          <span class="price-service-card__hint">Toca para ver detalles y sacar turno.</span>
        </button>
      `).join("")}
    </div>
  `;

  if (!serviceOverlay?.hidden) {
    renderPriceServiceOverlay();
  }
}

function renderProducts(products) {
  setProductsMeta({
    status: state.productsStatus,
    productCount: products.length
  });

  if (products.length === 0) {
    productsGrid.innerHTML = `
      <article class="empty-state">
        ${state.productsStatus === "loading"
          ? "Cargando productos..."
          : "Pronto vamos a sumar más productos destacados."}
      </article>
    `;
    return;
  }

  productsGrid.innerHTML = products
    .map((product) => {
      const stockCopy = getProductStockCopy(product);

      return `
        <article class="product-card">
          ${product.imageUrl ? `
            <img
              class="product-card__image"
              src="${escapeHtml(product.imageUrl)}"
              alt="${escapeHtml(product.name)}"
              loading="lazy"
            >
          ` : `
            <div class="product-card__image product-card__image--placeholder" aria-hidden="true">
              <span>${escapeHtml((product.name || "PR").slice(0, 2).toUpperCase())}</span>
            </div>
          `}
          <div class="product-card__body">
            <div class="product-card__meta">
              <span class="panel-chip">${escapeHtml(product.category)}</span>
              <span class="product-card__stock ${stockCopy.toneClass}">${escapeHtml(stockCopy.label)}</span>
            </div>
            <h3>${escapeHtml(product.name)}</h3>
            <p class="product-card__brand">${escapeHtml(product.brand || product.adminName)}</p>
            <p class="product-card__description">${escapeHtml(product.description)}</p>
            <div class="product-card__footer">
              <strong>${escapeHtml(formatMoney(product.price))}</strong>
              <span>${escapeHtml(stockCopy.detail)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAreaOptions() {
  const areas = [...new Set(state.services.map((service) => service.area))];

  if (areas.length === 0) {
    areaSelect.innerHTML = `<option value="">Sin áreas disponibles</option>`;
    areaSelect.disabled = true;
    state.selectedArea = "";
    return;
  }

  areaSelect.disabled = false;
  areaSelect.innerHTML = areas
    .map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`)
    .join("");

  state.selectedArea = state.selectedArea && areas.includes(state.selectedArea)
    ? state.selectedArea
    : areas[0];

  areaSelect.value = state.selectedArea;
}

function renderServiceOptions() {
  const filteredServices = state.services.filter((service) => service.area === state.selectedArea);

  if (filteredServices.length === 0) {
    serviceSelect.innerHTML = `<option value="">No hay servicios para esta área</option>`;
    serviceSelect.disabled = true;
    state.selectedServiceId = "";
    return;
  }

  serviceSelect.disabled = false;
  serviceSelect.innerHTML = filteredServices
    .map((service) => `
      <option value="${escapeHtml(service.id)}">
        ${escapeHtml(service.name)} - ${escapeHtml(formatMoney(service.price))}
      </option>
    `)
    .join("");

  state.selectedServiceId = filteredServices.some((service) => service.id === state.selectedServiceId)
    ? state.selectedServiceId
    : filteredServices[0].id;

  serviceSelect.value = state.selectedServiceId;
}

function buildTimeSlotsForDate(dateKey, durationMinutes = getSelectedServiceDuration()) {
  const selectedDate = parseDateKey(dateKey);
  const selectedService = getSelectedService();

  if (!selectedDate || !selectedService) {
    return [];
  }

  const slots = [];
  const minimumStartTime = Date.now() + BOOKING_RULES.minLeadMinutes * 60000;
  const pushWindowSlots = (startMinutes, endMinutes, isOpenDay = true) => {
    for (let minutes = startMinutes; minutes < endMinutes; minutes += BOOKING_RULES.slotIntervalMinutes) {
      const slotDate = createDateWithTime(dateKey, minutes);
      const slotEndsAt = minutes + durationMinutes;
      const isTooLate = slotEndsAt > endMinutes;
      const isTooSoon = !slotDate || slotDate.getTime() < minimumStartTime;
      const isAvailable = isOpenDay && !isTooLate && !isTooSoon;

      let disabledReason = "";

      if (!isOpenDay) {
        disabledReason = "Cerrado";
      } else if (isTooSoon) {
        disabledReason = "No disponible";
      } else if (isTooLate) {
        disabledReason = "No alcanza el bloque";
      }

      slots.push({
        minutes,
        label: formatTimeLabel(minutes),
        endLabel: formatTimeLabel(Math.min(slotEndsAt, endMinutes)),
        isAvailable,
        disabledReason
      });
    }
  };

  if (selectedService.isSpecial) {
    getSpecialScheduleEntriesForDate(selectedService, dateKey).forEach((entry) => {
      pushWindowSlots(entry.startMinutes, entry.endMinutes);
    });

    return slots;
  }

  const isOpenDay = BOOKING_RULES.openDays.includes(selectedDate.getDay());
  const openingMinutes = BOOKING_RULES.openHour * 60;
  const closingMinutes = BOOKING_RULES.closeHour * 60;
  pushWindowSlots(openingMinutes, closingMinutes, isOpenDay);

  return slots;
}

function buildBookingDays() {
  const selectedService = getSelectedService();

  if (selectedService?.isSpecial) {
    const normalizedSchedule = normalizeServiceSpecialSchedule(selectedService.specialSchedule);
    const uniqueDateKeys = [...new Set(normalizedSchedule.map((entry) => entry.dateKey))];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return uniqueDateKeys.map((dateKey) => {
      const date = parseDateKey(dateKey);
      const slots = buildTimeSlotsForDate(dateKey);
      const availableSlotsCount = slots.filter((slot) => slot.isAvailable).length;

      return {
        key: dateKey,
        date,
        isOpen: true,
        isSelectable: availableSlotsCount > 0,
        availableSlotsCount
      };
    }).filter((day) => day.date && day.date >= today);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: BOOKING_RULES.daysToShow }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    const key = getDateKey(date);
    const slots = buildTimeSlotsForDate(key);
    const availableSlotsCount = slots.filter((slot) => slot.isAvailable).length;
    const isOpen = BOOKING_RULES.openDays.includes(date.getDay());

    return {
      key,
      date,
      isOpen,
      isSelectable: availableSlotsCount > 0,
      availableSlotsCount
    };
  });
}

function syncRequestedStartInput() {
  if (!state.selectedDateKey || state.selectedTimeMinutes === null) {
    requestedStartInput.value = "";
    return;
  }

  const selectedDate = createDateWithTime(state.selectedDateKey, state.selectedTimeMinutes);
  requestedStartInput.value = selectedDate ? toDateTimeLocalValue(selectedDate) : "";
}

function ensureBookingSelection() {
  state.bookingDays = buildBookingDays();

  const selectableDays = state.bookingDays.filter((day) => day.isSelectable);

  if (!selectableDays.some((day) => day.key === state.selectedDateKey)) {
    state.selectedDateKey = selectableDays[0]?.key || state.bookingDays[0]?.key || "";
  }

  const slots = buildTimeSlotsForDate(state.selectedDateKey);

  if (!slots.some((slot) => slot.minutes === state.selectedTimeMinutes && slot.isAvailable)) {
    state.selectedTimeMinutes = slots.find((slot) => slot.isAvailable)?.minutes ?? null;
  }

  syncRequestedStartInput();
  return slots;
}

function renderBookingDays() {
  if (!state.bookingDays.length) {
    dayPicker.innerHTML = `
      <article class="empty-state">
        No encontramos días visibles en este momento.
      </article>
    `;
    selectedDateSummary.textContent = "Seleccioná una fecha disponible para continuar.";
    return;
  }

  const selectedDay = state.bookingDays.find((day) => day.key === state.selectedDateKey);
  selectedDateSummary.textContent = selectedDay
    ? `Elegiste ${formatLongDate(selectedDay.date)}.`
    : "Seleccioná una fecha disponible para continuar.";

  dayPicker.innerHTML = state.bookingDays
    .map((day) => `
      <button
        type="button"
        class="schedule-chip ${day.key === state.selectedDateKey ? "is-selected" : ""} ${!day.isSelectable ? "is-disabled" : ""}"
        data-day-key="${escapeHtml(day.key)}"
        ${!day.isSelectable ? "disabled" : ""}
      >
        <span class="schedule-chip__day">${escapeHtml(formatCalendarWeekday(day.date))}</span>
        <strong class="schedule-chip__date">${escapeHtml(String(day.date.getDate()).padStart(2, "0"))}</strong>
        <span class="schedule-chip__month">${escapeHtml(formatCalendarMonth(day.date))}</span>
        <span class="schedule-chip__meta">${day.isOpen ? `${escapeHtml(day.availableSlotsCount)} horarios` : "Cerrado"}</span>
      </button>
    `)
    .join("");
}

function renderTimeSlots(slots) {
  const activeSlots = Array.isArray(slots) ? slots : buildTimeSlotsForDate(state.selectedDateKey);

  if (activeSlots.length === 0) {
    timePicker.innerHTML = `
      <article class="empty-state">
        Elegí un día para ver horarios disponibles.
      </article>
    `;
    selectedTimeSummary.textContent = "Los horarios no disponibles aparecen en gris.";
    availabilityNote.textContent = "Seleccioná primero un día disponible.";
    return;
  }

  const selectedSlot = activeSlots.find((slot) => slot.minutes === state.selectedTimeMinutes && slot.isAvailable);
  selectedTimeSummary.textContent = selectedSlot
    ? `Horario elegido: ${selectedSlot.label}.`
    : "Seleccioná un horario disponible para completar la reserva.";

  availabilityNote.textContent = activeSlots.some((slot) => slot.isAvailable)
    ? "Estos horarios te ayudan a encontrar una opción cómoda antes de enviar tu solicitud."
    : "No encontramos horarios para ese día con la duración del servicio elegido.";

  timePicker.innerHTML = activeSlots
    .map((slot) => `
      <button
        type="button"
        class="time-chip ${slot.minutes === state.selectedTimeMinutes ? "is-selected" : ""} ${!slot.isAvailable ? "is-disabled" : ""}"
        data-slot-minutes="${escapeHtml(slot.minutes)}"
        ${!slot.isAvailable ? "disabled" : ""}
      >
        <strong>${escapeHtml(slot.label)}</strong>
        <span>${slot.isAvailable ? `Hasta ${escapeHtml(slot.endLabel)}` : escapeHtml(slot.disabledReason)}</span>
      </button>
    `)
    .join("");
}

function renderSelectedService() {
  const selectedService = getSelectedService();

  if (!selectedService) {
    selectedServiceCard.innerHTML = `
      <p class="eyebrow">Servicio elegido</p>
      <h3>Elegí un servicio para ver precio, duración y horario sugerido.</h3>
      <p>La duración es estimada y puede ajustarse según el trabajo a realizar.</p>
    `;
    return;
  }

  const scheduleCopy = state.selectedDateKey && state.selectedTimeMinutes !== null
    ? `Horario sugerido: ${formatSelectedSlotText(state.selectedDateKey, state.selectedTimeMinutes)}.`
    : "Seleccioná día y horario para completar la reserva.";

  selectedServiceCard.innerHTML = `
    <p class="eyebrow">Servicio elegido</p>
    <h3>${escapeHtml(selectedService.name)}</h3>
    <p>${escapeHtml(selectedService.area)} - ${escapeHtml(selectedService.adminName)}</p>
    <p>${escapeHtml(formatMoney(selectedService.price))} - ${escapeHtml(formatDuration(selectedService.durationMinutes))}</p>
    <p>${escapeHtml(selectedService.description)}</p>
    <p>${escapeHtml(selectedService.isSpecial
      ? "Servicio especial disponible solo en fechas puntuales definidas por la profesional."
      : "Servicio con agenda regular del profesional.")}</p>
    <p class="summary-emphasis">${escapeHtml(scheduleCopy)}</p>
  `;
}

function getServiceImageGallery(service) {
  const normalizedGallery = Array.isArray(service?.imageGallery)
    ? service.imageGallery
    : [];
  const primaryImageUrl = String(service?.imageUrl || "").trim();
  const gallery = normalizedGallery.length ? normalizedGallery : (primaryImageUrl ? [primaryImageUrl] : []);
  return gallery.filter(Boolean);
}

function getPriceServiceById(serviceId) {
  return state.services.find((service) => service.id === serviceId) || null;
}

function getActivePriceService() {
  return getPriceServiceById(state.activePriceServiceId);
}

function getOverlayFocusableElements() {
  if (!serviceOverlayPanel) {
    return [];
  }

  return [...serviceOverlayPanel.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.offsetParent !== null);
}

function focusOverlayTarget(selector) {
  if (!serviceOverlayPanel) {
    return;
  }

  const target = selector
    ? serviceOverlayPanel.querySelector(selector)
    : null;

  if (target instanceof HTMLElement) {
    target.focus();
    return;
  }

  const [firstFocusable] = getOverlayFocusableElements();
  (firstFocusable || serviceOverlayPanel)?.focus();
}

async function hydratePriceServiceDetail(serviceId) {
  if (!db || !serviceId || !getTenantId()) {
    return;
  }

  const requestId = state.activePriceServiceRequestId + 1;
  state.activePriceServiceRequestId = requestId;
  state.activePriceServiceLoading = true;

  if (state.activePriceServiceId === serviceId && serviceOverlay && !serviceOverlay.hidden) {
    renderPriceServiceOverlay();
  }

  try {
    const serviceSnapshot = await getDoc(doc(db, "tenants", getTenantId(), "servicios", serviceId));

    if (state.activePriceServiceRequestId !== requestId || state.activePriceServiceId !== serviceId) {
      return;
    }

    if (!serviceSnapshot.exists()) {
      return;
    }

    const currentService = getPriceServiceById(serviceId) || {};
    const refreshedService = normalizeService({
      id: serviceSnapshot.id,
      ...serviceSnapshot.data()
    });

    const mergedService = {
      ...currentService,
      ...refreshedService,
      adminId: refreshedService.adminId || currentService.adminId || "",
      adminName: refreshedService.adminName || currentService.adminName || "",
      area: refreshedService.area || currentService.area || ""
    };

    state.services = state.services.map((service) => (
      service.id === serviceId
        ? mergedService
        : service
    ));
  } catch (error) {
    console.warn("[public-web] service-overlay-hydrate-error", {
      tenantId: getTenantId(),
      serviceId,
      error
    });
  } finally {
    if (state.activePriceServiceRequestId !== requestId) {
      return;
    }

    state.activePriceServiceLoading = false;

    if (state.activePriceServiceId === serviceId && serviceOverlay && !serviceOverlay.hidden) {
      renderPriceServiceOverlay();
    }
  }
}

function renderPriceServiceOverlay() {
  if (!serviceOverlayBody) {
    return;
  }

  const activeService = getActivePriceService();

  if (!activeService) {
    serviceOverlayBody.innerHTML = "";
    return;
  }

  const imageGallery = getServiceImageGallery(activeService);
  const activeImageIndex = imageGallery.length
    ? Math.min(state.activePriceServiceImageIndex, imageGallery.length - 1)
    : 0;
  const activeImageUrl = imageGallery[activeImageIndex] || "";

  state.activePriceServiceImageIndex = activeImageIndex;
  serviceOverlayPanel?.setAttribute("aria-busy", state.activePriceServiceLoading ? "true" : "false");

  serviceOverlayBody.innerHTML = `
    <div class="service-overlay__layout">
      <div class="service-overlay__media">
        ${activeImageUrl ? `
          <div class="service-overlay__carousel">
            ${imageGallery.length > 1 ? `
              <button type="button" class="service-overlay__nav" data-overlay-action="prev-image" aria-label="Imagen anterior">&lsaquo;</button>
            ` : ""}
            <img
              class="service-overlay__image"
              src="${escapeHtml(activeImageUrl)}"
              alt="${escapeHtml(activeService.name)}"
              loading="lazy"
            >
            ${imageGallery.length > 1 ? `
              <button type="button" class="service-overlay__nav" data-overlay-action="next-image" aria-label="Imagen siguiente">&rsaquo;</button>
            ` : ""}
          </div>
          ${imageGallery.length > 1 ? `
            <div class="service-overlay__dots" aria-label="Seleccionar imagen del servicio">
              ${imageGallery.map((_, index) => `
                <button
                  type="button"
                  class="service-overlay__dot ${index === activeImageIndex ? "is-active" : ""}"
                  data-overlay-action="select-image"
                  data-overlay-image-index="${index}"
                  aria-label="${escapeHtml(`Ver imagen ${index + 1}`)}"
                ></button>
              `).join("")}
            </div>
          ` : ""}
        ` : `
          <div class="service-overlay__placeholder">
            <span>${escapeHtml((activeService.name || "SV").slice(0, 2).toUpperCase())}</span>
            <p>Este servicio todav&iacute;a no tiene im&aacute;genes publicadas.</p>
          </div>
        `}
      </div>
      <div class="service-overlay__content">
        <p class="service-overlay__eyebrow">${escapeHtml(activeService.adminName)}</p>
        <h3 id="service-overlay-title">${escapeHtml(activeService.name)}</h3>
        <div class="service-overlay__price-line">
          <strong>${escapeHtml(formatMoney(activeService.price))}</strong>
          <span>${escapeHtml(formatDuration(activeService.durationMinutes))}</span>
        </div>
        <p class="service-overlay__area">${escapeHtml(activeService.area)}</p>
        <p class="service-overlay__description">${escapeHtml(activeService.description)}</p>
        <p class="service-overlay__note">${escapeHtml(activeService.isSpecial
          ? "Servicio especial con fechas puntuales definidas por la profesional."
          : "Servicio disponible dentro de la agenda regular del profesional.")}</p>
        ${state.activePriceServiceLoading ? `
          <p class="service-overlay__status" role="status">Actualizando detalles del servicio...</p>
        ` : ""}
        <div class="service-overlay__actions">
          <button
            type="button"
            class="button button-primary"
            data-overlay-action="book-service"
            data-service-id="${escapeHtml(activeService.id)}"
          >
            Sacar turno
          </button>
          <button
            type="button"
            class="button button-secondary"
            data-overlay-action="close"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `;
}

function openPriceServiceOverlay(serviceId, triggerElement = null) {
  const activeService = getPriceServiceById(serviceId);

  if (!activeService || !serviceOverlay) {
    return;
  }

  lastOverlayTrigger = triggerElement instanceof HTMLElement
    ? triggerElement
    : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  state.activePriceServiceId = activeService.id;
  state.activePriceServiceImageIndex = 0;
  renderPriceServiceOverlay();
  serviceOverlay.hidden = false;
  serviceOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-overlay-open");
  requestAnimationFrame(() => {
    focusOverlayTarget("[data-overlay-action='close']");
  });
  void hydratePriceServiceDetail(activeService.id);
}

function closePriceServiceOverlay({ restoreFocus = true } = {}) {
  if (!serviceOverlay) {
    return;
  }

  serviceOverlay.hidden = true;
  serviceOverlay.setAttribute("aria-hidden", "true");
  state.activePriceServiceId = "";
  state.activePriceServiceImageIndex = 0;
  state.activePriceServiceLoading = false;
  state.activePriceServiceRequestId += 1;
  document.body.classList.remove("is-overlay-open");

  if (restoreFocus && lastOverlayTrigger?.isConnected) {
    lastOverlayTrigger.focus();
  }

  lastOverlayTrigger = null;
}

function shiftPriceServiceImage(step) {
  const activeService = getActivePriceService();
  const imageGallery = getServiceImageGallery(activeService);

  if (imageGallery.length <= 1) {
    return;
  }

  state.activePriceServiceImageIndex = (state.activePriceServiceImageIndex + step + imageGallery.length) % imageGallery.length;
  renderPriceServiceOverlay();
  focusOverlayTarget(`[data-overlay-action="${step < 0 ? "prev-image" : "next-image"}"]`);
}

function selectPriceServiceImage(index) {
  const activeService = getActivePriceService();
  const imageGallery = getServiceImageGallery(activeService);

  if (!imageGallery.length) {
    return;
  }

  state.activePriceServiceImageIndex = Math.max(0, Math.min(index, imageGallery.length - 1));
  renderPriceServiceOverlay();
  focusOverlayTarget(`[data-overlay-action="select-image"][data-overlay-image-index="${state.activePriceServiceImageIndex}"]`);
}

function refreshBookingUi() {
  const slots = ensureBookingSelection();
  renderBookingDays();
  renderTimeSlots(slots);
  renderSelectedService();
}

function renderCatalog(services) {
  const sortedServices = [...services].sort((firstService, secondService) => {
    const areaMatch = firstService.area.localeCompare(secondService.area, "es");

    if (areaMatch !== 0) {
      return areaMatch;
    }

    return firstService.sortOrder - secondService.sortOrder || firstService.name.localeCompare(secondService.name, "es");
  });

  state.services = sortedServices;

  const areaCount = new Set(sortedServices.map((service) => service.area)).size;
  setCatalogMeta({
    status: sortedServices.length ? "ready" : "empty",
    serviceCount: sortedServices.length,
    areaCount
  });

  renderProfessionalBanner(sortedServices);
  renderActiveSectionContent();
}

function validateBookingWindow(rawDateTime) {
  const parsedDate = new Date(rawDateTime);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Elegí una fecha y hora válidas.";
  }

  const day = parsedDate.getDay();
  const hour = parsedDate.getHours();

  if (![2, 3, 4, 5, 6].includes(day)) {
    return "Los turnos se solicitan de martes a sábado.";
  }

  if (hour < 10 || hour >= 20) {
    return "La franja disponible para solicitar es de 10:00 a 20:00.";
  }

  return "";
}

function validateSelectedBookingWindow(rawDateTime) {
  const selectedService = getSelectedService();
  const parsedDate = new Date(rawDateTime);

  if (!selectedService || Number.isNaN(parsedDate.getTime())) {
    return "ElegÃ­ una fecha y hora vÃ¡lidas.";
  }

  const minimumStartTime = Date.now() + BOOKING_RULES.minLeadMinutes * 60000;

  if (parsedDate.getTime() < minimumStartTime) {
    return "Ese horario ya no estÃ¡ disponible. Elige otro mÃ¡s adelante.";
  }

  if (selectedService.isSpecial) {
    const selectedDateKey = getDateKey(parsedDate);
    const requestedStartMinutes = (parsedDate.getHours() * 60) + parsedDate.getMinutes();
    const requestedEndMinutes = requestedStartMinutes + getSelectedServiceDuration();
    const matchesSpecialWindow = getSpecialScheduleEntriesForDate(selectedService, selectedDateKey)
      .some((entry) => requestedStartMinutes >= entry.startMinutes && requestedEndMinutes <= entry.endMinutes);

    if (!matchesSpecialWindow) {
      return "Este servicio especial solo puede reservarse dentro de las fechas y horarios definidos por la profesional.";
    }

    return "";
  }

  return validateBookingWindow(rawDateTime);
}

async function loadTenantContext() {
  const tenantId = resolvePublicTenantId();

  if (!tenantId) {
    renderTenantFailure("Negocio no encontrado o URL incompleta.", "Abre una ruta como /rockeala o /pruebacliente para cargar un tenant valido.");
    return false;
  }

  if (!firebaseReady || !db) {
    renderTenantFailure("No se pudo conectar con Firebase.", "Revisa la configuracion del proyecto antes de continuar.");
    return false;
  }

  try {
    const tenantSnapshot = await getDoc(doc(db, "tenants", tenantId));

    if (!tenantSnapshot.exists()) {
      renderTenantFailure("No encontramos ese negocio.", "Verifica el tenant en la URL e intenta nuevamente.");
      return false;
    }

    const tenantData = tenantSnapshot.data() || {};

    if (tenantData.active !== true) {
      renderTenantFailure("Este negocio esta inactivo.", "El tenant existe, pero no esta habilitado para recibir visitas en la web.");
      return false;
    }

    if (tenantData.publicEnabled === false) {
      renderTenantFailure("La web publica de este negocio no esta habilitada.", "Prueba mas tarde o consulta con quien administra el negocio.");
      return false;
    }

    state.tenantId = tenantId;
    state.tenantData = {
      id: tenantSnapshot.id,
      ...tenantData
    };
    applyTenantBranding();
    configureWhatsAppBubble();
    configureFooterContact();
    return true;
  } catch (error) {
    renderTenantFailure("No pudimos cargar la configuracion del negocio.", "Reintenta en unos segundos.");
    return false;
  }
}

async function loadCatalogFromFirestore() {
  const catalogQuery = query(
    tenantCollection("servicios"),
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

async function loadProductsFromFirestore() {
  const productsQuery = query(
    tenantCollection("productos"),
    orderBy("updatedAt", "desc")
  );

  const snapshot = await getDocs(productsQuery);

  return snapshot.docs.map((documentSnapshot) => normalizeProduct({
    id: documentSnapshot.id,
    ...documentSnapshot.data()
  }));
}

async function loadSalonMediaFromFirestore() {
  const salonMediaQuery = query(
    tenantCollection("salonMedia"),
    where("visible", "==", true)
  );

  const snapshot = await getDocs(salonMediaQuery);

  return snapshot.docs.map((documentSnapshot) => normalizeSalonMedia({
    id: documentSnapshot.id,
    ...documentSnapshot.data()
  }));
}

async function loadPublicAdminProfiles() {
  if (!functionsClient) {
    return [];
  }

  const listPublicAdminProfiles = httpsCallable(functionsClient, "listPublicAdminProfiles");
  const response = await listPublicAdminProfiles({ tenantId: getTenantId() });
  const admins = Array.isArray(response.data?.admins) ? response.data.admins : [];

  return admins.map(normalizePublicAdmin);
}

async function bootstrapCatalog() {
  setCatalogMeta({ status: "loading" });
  setProductsMeta({ status: "loading" });
  renderSalonCarousel();
  renderActiveSectionContent();

  const cachedCatalog = await readCatalogCache(getTenantId());

  if (cachedCatalog?.services?.length) {
    renderCatalog(cachedCatalog.services);
  }

  const publicAdminsPromise = loadPublicAdminProfiles();
  const productsPromise = loadProductsFromFirestore();
  const salonMediaPromise = loadSalonMediaFromFirestore();

  try {
    const remoteCatalog = await loadCatalogFromFirestore();

    if (remoteCatalog.length === 0 && cachedCatalog?.services?.length) {
      // Keep the cached catalog already rendered above.
    } else {
      const syncedAt = new Date().toISOString();
      renderCatalog(remoteCatalog);
      await writeCatalogCache(getTenantId(), remoteCatalog, syncedAt);
    }
  } catch (error) {
    if (!cachedCatalog?.services?.length) {
      renderCatalog([]);
    }
  }

  try {
    state.adminProfiles = await publicAdminsPromise;
  } catch (error) {
    state.adminProfiles = [];
  }

  renderProfessionalBanner(state.services);

  if (state.activeSection === "servicios") {
    renderServices(state.services);
  } else if (state.activeSection === "precios") {
    renderPrices(state.services);
  }

  try {
    state.salonMedia = await salonMediaPromise;
  } catch (error) {
    state.salonMedia = [];
  }

  renderSalonCarousel();

  try {
    const remoteProducts = await productsPromise;
    state.productsStatus = remoteProducts.length ? "ready" : "empty";
    state.products = remoteProducts;
    if (state.activeSection === "productos") {
      renderProducts(remoteProducts);
    }
  } catch (error) {
    state.productsStatus = "empty";
    state.products = [];
    if (state.activeSection === "productos") {
      renderProducts([]);
    }
  }
}

function focusBookingForAdmin(adminId) {
  if (!adminId) {
    return false;
  }

  const matchingService = state.services.find((service) => service.adminId === adminId);

  if (!matchingService) {
    return false;
  }

  return focusBookingForService(matchingService.id);
}

function focusBookingForService(serviceId) {
  const matchingService = state.services.find((service) => service.id === serviceId);

  if (!matchingService) {
    return false;
  }

  state.selectedArea = matchingService.area;
  state.selectedServiceId = matchingService.id;
  return true;
}

function selectProfessionalByKey(professionalKey) {
  if (!professionalKey) {
    return false;
  }

  const matchesProfessional = state.services.some((service) => getServiceProfessionalKey(service) === professionalKey);

  if (!matchesProfessional) {
    return false;
  }

  state.selectedProfessionalKey = professionalKey;
  renderProfessionalBanner(state.services);
  return true;
}

async function handleBookingSubmit(event) {
  event.preventDefault();

  const selectedService = state.services.find((service) => service.id === serviceSelect.value);

  if (!selectedService) {
    setMessage("Primero elegí un servicio válido.", "error");
    return;
  }

  if (!requestedStartInput.value) {
    setMessage("Seleccioná un día y un horario antes de enviar la solicitud.", "error");
    return;
  }

  const bookingWindowError = validateSelectedBookingWindow(requestedStartInput.value);

  if (bookingWindowError) {
    setMessage(bookingWindowError, "error");
    return;
  }

  if (!firebaseReady || !functionsClient) {
    setMessage("El sistema de turnos no esta disponible en este momento. Intenta nuevamente en unos minutos.", "error");
    return;
  }

  submitBookingButton.disabled = true;
  setMessage("Enviando solicitud...", "");

  try {
    const submitAppointmentRequest = httpsCallable(functionsClient, "submitAppointmentRequest");
    const response = await submitAppointmentRequest({
      tenantId: getTenantId(),
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
    setMessage(`Solicitud enviada. Te contactaremos para confirmar tu turno. Codigo de seguimiento: ${appointmentId}.`, "success");
    bookingForm.reset();
    state.selectedDateKey = "";
    state.selectedTimeMinutes = null;
    renderAreaOptions();
    renderServiceOptions();
    refreshBookingUi();
  } catch (error) {
    setMessage(error.message || "No se pudo enviar la solicitud.", "error");
  } finally {
    submitBookingButton.disabled = false;
  }
}

function handleDaySelection(event) {
  const button = event.target.closest("[data-day-key]");

  if (!button || button.disabled) {
    return;
  }

  state.selectedDateKey = button.dataset.dayKey;
  state.selectedTimeMinutes = buildTimeSlotsForDate(state.selectedDateKey).find((slot) => slot.isAvailable)?.minutes ?? null;
  syncRequestedStartInput();
  renderBookingDays();
  renderTimeSlots(buildTimeSlotsForDate(state.selectedDateKey));
  renderSelectedService();
}

function handleTimeSelection(event) {
  const button = event.target.closest("[data-slot-minutes]");

  if (!button || button.disabled) {
    return;
  }

  state.selectedTimeMinutes = Number(button.dataset.slotMinutes);
  syncRequestedStartInput();
  renderTimeSlots(buildTimeSlotsForDate(state.selectedDateKey));
  renderSelectedService();
}

function handleServicesAction(event) {
  const actionButton = event.target.closest("[data-service-action]");

  if (!actionButton) {
    return;
  }

  const adminId = actionButton.dataset.adminId || "";
  const professionalKey = actionButton.dataset.professionalKey || adminId;
  const action = actionButton.dataset.serviceAction;

  if (action === "booking") {
    focusBookingForAdmin(adminId);
    setActiveSection("turnos");
    return;
  }

  if (action === "prices") {
    selectProfessionalByKey(professionalKey);
    setActiveSection("precios");
  }
}

function handleProfessionalBannerClick(event) {
  const professionalButton = event.target.closest("[data-professional-key]");

  if (!professionalButton) {
    return;
  }

  const professionalKey = professionalButton.dataset.professionalKey || "";

  if (!selectProfessionalByKey(professionalKey)) {
    return;
  }

  if (state.activeSection !== "precios") {
    setActiveSection("precios");
    return;
  }

  renderPrices(state.services);
}

function handlePriceListClick(event) {
  const serviceCard = event.target.closest("[data-price-service-id]");

  if (!serviceCard) {
    return;
  }

  openPriceServiceOverlay(serviceCard.dataset.priceServiceId || "", serviceCard);
}

function handleServiceOverlayClick(event) {
  if (!serviceOverlay || serviceOverlay.hidden) {
    return;
  }

  const actionButton = event.target.closest("[data-overlay-action]");

  if (!actionButton) {
    return;
  }

  const overlayAction = actionButton.dataset.overlayAction;

  if (overlayAction === "close") {
    closePriceServiceOverlay();
    return;
  }

  if (overlayAction === "prev-image") {
    shiftPriceServiceImage(-1);
    return;
  }

  if (overlayAction === "next-image") {
    shiftPriceServiceImage(1);
    return;
  }

  if (overlayAction === "select-image") {
    selectPriceServiceImage(Number(actionButton.dataset.overlayImageIndex));
    return;
  }

  if (overlayAction === "book-service") {
    const serviceId = actionButton.dataset.serviceId || state.activePriceServiceId;

    if (!focusBookingForService(serviceId)) {
      return;
    }

    closePriceServiceOverlay();
    setActiveSection("turnos");
  }
}

function handleGlobalKeydown(event) {
  if (!serviceOverlay || serviceOverlay.hidden) {
    return;
  }

  if (event.key === "Escape") {
    closePriceServiceOverlay();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = getOverlayFocusableElements();

  if (!focusableElements.length) {
    event.preventDefault();
    serviceOverlayPanel?.focus();
    return;
  }

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (!serviceOverlayPanel?.contains(activeElement)) {
    event.preventDefault();
    firstFocusable.focus();
    return;
  }

  if (event.shiftKey && activeElement === firstFocusable) {
    event.preventDefault();
    lastFocusable.focus();
    return;
  }

  if (!event.shiftKey && activeElement === lastFocusable) {
    event.preventDefault();
    firstFocusable.focus();
  }
}

function attachEvents() {
  sectionTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const sectionId = trigger.dataset.sectionTarget;

      if (!sectionId) {
        return;
      }

      setActiveSection(sectionId);
    });
  });

  areaSelect.addEventListener("change", () => {
    state.selectedArea = areaSelect.value;
    renderServiceOptions();
    refreshBookingUi();
  });

  serviceSelect.addEventListener("change", () => {
    state.selectedServiceId = serviceSelect.value;
    refreshBookingUi();
  });

  dayPicker.addEventListener("click", handleDaySelection);
  timePicker.addEventListener("click", handleTimeSelection);
  servicesGrid.addEventListener("click", handleServicesAction);
  priceList?.addEventListener("click", handlePriceListClick);
  professionalList?.addEventListener("click", handleProfessionalBannerClick);
  serviceOverlay?.addEventListener("click", handleServiceOverlayClick);
  bookingForm.addEventListener("submit", handleBookingSubmit);
  window.addEventListener("resize", syncStickyBannerOffset);
  window.addEventListener("keydown", handleGlobalKeydown);

  salonCarouselPrev?.addEventListener("click", () => {
    shiftSalonSlide(-1);
  });

  salonCarouselNext?.addEventListener("click", () => {
    shiftSalonSlide(1);
  });

  salonCarouselDots?.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-salon-slide-index]");

    if (!dot) {
      return;
    }

    selectSalonSlide(Number(dot.dataset.salonSlideIndex));
  });
}

async function bootstrapPublicExperience() {
  const tenantReady = await loadTenantContext();

  if (!tenantReady) {
    return;
  }

  renderSalonCarousel();
  syncStickyBannerOffset();

  if (sectionBanner && typeof ResizeObserver === "function") {
    const bannerObserver = new ResizeObserver(() => {
      syncStickyBannerOffset();
    });

    bannerObserver.observe(sectionBanner);
  }

  attachEvents();
  setActiveSection(state.activeSection, {
    scroll: false,
    behavior: "auto"
  });
  await bootstrapCatalog();
}

bootstrapPublicExperience();
