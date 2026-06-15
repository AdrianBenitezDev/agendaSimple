const { initializeApp } = require("firebase-admin/app");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");

initializeApp();
setGlobalOptions({
  region: "southamerica-east1",
  maxInstances: 10
});

const db = getFirestore();
const allowedDays = ["Tue", "Wed", "Thu", "Fri", "Sat"];
const defaultSalonTimeZone = "America/Argentina/Buenos_Aires";
const bookingWindow = {
  startHour: 10,
  endHour: 20
};
const managedAdminRoles = {
  peluqueria: {
    label: "Peluqueria",
    area: "Peluqueria",
    publicArea: "Peluqueria",
    businessName: "Rockeala Peluqueria"
  },
  manicura: {
    label: "Manicura",
    area: "Manicura",
    publicArea: "Manicura",
    businessName: "Rockeala Manicura"
  },
  depilacion: {
    label: "Depilacion",
    area: "Depilacion",
    publicArea: "Depilacion",
    businessName: "Rockeala Depilacion"
  },
  barberia: {
    label: "Barberia",
    area: "Barberia",
    publicArea: "Barberia",
    businessName: "Rockeala Barberia"
  }
};
const publicRoleCatalog = {
  peluqueria: {
    roleLabel: "Estilista",
    publicArea: "Peluqueria"
  },
  manicura: {
    roleLabel: "Manicura",
    publicArea: "Manicura"
  },
  depilacion: {
    roleLabel: "Depilacion",
    publicArea: "Depilacion"
  },
  barberia: {
    roleLabel: "Barberia",
    publicArea: "Barberia"
  }
};
const callableRuntimeOptions = {
  invoker: "public",
  cors: true
};
const adminAccessManagerEmails = new Set([
  "37adrian38@gmail.com",
  "nataliasoledadromero27@gmail.com"
]);
const sharedPlanFeatures = [
  "Control de turnos",
  "Balance",
  "Ficha de clientes",
  "Control de stock",
  "Productos para la venta",
  "Pagina web para los clientes"
];

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `El campo ${fieldName} es obligatorio.`);
  }

  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHintText(values) {
  return []
    .concat(values || [])
    .flat()
    .map((value) => optionalString(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function requiredTenantId(value) {
  const tenantId = optionalString(value).toLowerCase();

  if (!tenantId) {
    throw new HttpsError("invalid-argument", "El tenantId es obligatorio.");
  }

  if (!/^[a-z0-9][a-z0-9-_]{1,62}$/.test(tenantId)) {
    throw new HttpsError("invalid-argument", "El tenantId indicado no es valido.");
  }

  return tenantId;
}

function toIsoString(value) {
  if (!value) {
    return "";
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
}

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
}

function tenantRef(tenantId) {
  return db.collection("tenants").doc(tenantId);
}

function tenantCollection(tenantId, collectionName) {
  return tenantRef(tenantId).collection(collectionName);
}

function plansCollection() {
  return db.collection("planes");
}

async function getTenant(tenantId, {
  requirePublicEnabled = false,
  requireAdminEnabled = false
} = {}) {
  const tenantSnapshot = await tenantRef(tenantId).get();

  if (!tenantSnapshot.exists) {
    throw new HttpsError("not-found", "No existe el negocio indicado.");
  }

  const tenantData = tenantSnapshot.data() || {};

  if (tenantData.active !== true) {
    throw new HttpsError("permission-denied", "El negocio indicado no esta activo.");
  }

  if (requirePublicEnabled && tenantData.publicEnabled === false) {
    throw new HttpsError("failed-precondition", "Este negocio no tiene la web publica habilitada.");
  }

  if (requireAdminEnabled && tenantData.adminEnabled === false) {
    throw new HttpsError("failed-precondition", "Este negocio no tiene el panel admin habilitado.");
  }

  return {
    id: tenantSnapshot.id,
    ...tenantData
  };
}

async function getEnabledPlan(planId) {
  const normalizedPlanId = requiredString(planId, "planId").toLowerCase();
  const planSnapshot = await plansCollection().doc(normalizedPlanId).get();

  if (!planSnapshot.exists) {
    throw new HttpsError("not-found", "El plan seleccionado no existe.");
  }

  const planData = planSnapshot.data() || {};

  if (planData.enabled !== true) {
    throw new HttpsError("failed-precondition", "El plan seleccionado no esta disponible.");
  }

  return {
    id: planSnapshot.id,
    ...planData
  };
}

function getManagedAdminRoleConfig(role) {
  const normalizedRole = optionalString(role).toLowerCase();
  const roleConfig = managedAdminRoles[normalizedRole];

  if (!roleConfig || normalizedRole === "peluqueria") {
    throw new HttpsError("invalid-argument", "El rol indicado no es valido para crear usuarios.");
  }

  return {
    role: normalizedRole,
    ...roleConfig
  };
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

function inferPublicRoleKey({
  specialtyKey = "",
  role = "",
  publicArea = "",
  area = "",
  displayName = "",
  businessName = "",
  serviceHints = []
} = {}) {
  const normalizedSpecialty = optionalString(specialtyKey || role).toLowerCase();

  if (publicRoleCatalog[normalizedSpecialty]) {
    return normalizedSpecialty;
  }

  return inferPublicRoleFromText([
    publicArea,
    area,
    displayName,
    businessName,
    serviceHints
  ]) || "peluqueria";
}

function buildPublicRoleSummary({
  specialtyKey = "",
  role = "",
  publicArea = "",
  area = "",
  displayName = "",
  businessName = "",
  serviceHints = []
} = {}) {
  const roleKey = inferPublicRoleKey({
    specialtyKey,
    role,
    publicArea,
    area,
    displayName,
    businessName,
    serviceHints
  });
  const roleMeta = publicRoleCatalog[roleKey] || publicRoleCatalog.peluqueria;
  const explicitArea = optionalString(publicArea) || optionalString(area);
  const normalizedArea = normalizeHintText(explicitArea);

  return {
    role: roleKey,
    roleLabel: roleMeta.roleLabel,
    publicArea: explicitArea && !normalizedArea.includes("servicios")
      ? explicitArea
      : roleMeta.publicArea
  };
}

function buildPublicAdminProfile(documentSnapshot, serviceHints = []) {
  const adminData = documentSnapshot.data() || {};
  const displayName = optionalString(adminData.displayName) || optionalString(adminData.businessName) || "Equipo";
  const roleSummary = buildPublicRoleSummary({
    specialtyKey: adminData.specialtyKey,
    role: adminData.role,
    publicArea: adminData.publicArea,
    area: adminData.area,
    displayName,
    businessName: adminData.businessName,
    serviceHints
  });

  return {
    id: documentSnapshot.id,
    displayName,
    role: roleSummary.role,
    roleLabel: roleSummary.roleLabel,
    publicArea: roleSummary.publicArea,
    photoUrl: optionalString(adminData.photoUrl),
    slug: optionalString(adminData.slug)
  };
}

function buildAdminFingerprint(adminData) {
  return [
    adminData?.slug,
    adminData?.displayName,
    adminData?.businessName,
    adminData?.area,
    adminData?.publicArea,
    adminData?.role,
    adminData?.specialtyKey,
    adminData?.email
  ].join(" ").toLowerCase();
}

function canManageAdminAccess(adminData, authEmail = "") {
  if (!adminData) {
    return false;
  }

  if (adminData.canManageAdminAccess === true) {
    return true;
  }

  if (["owner", "admin"].includes(optionalString(adminData.membershipRole).toLowerCase())) {
    return true;
  }

  const candidateEmails = [
    adminData.emailNormalized,
    adminData.email,
    authEmail
  ].map((value) => normalizeEmail(value)).filter(Boolean);

  if (candidateEmails.some((email) => adminAccessManagerEmails.has(email))) {
    return true;
  }

  const fingerprint = buildAdminFingerprint(adminData);
  return fingerprint.includes("natalia");
}

async function getOwnAdminProfile(tenantId, uid) {
  await getTenant(tenantId, { requireAdminEnabled: true });
  const adminSnapshot = await tenantCollection(tenantId, "admins").doc(uid).get();

  if (!adminSnapshot.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta todavia no tiene acceso al panel de este negocio.");
  }

  const adminData = adminSnapshot.data() || {};

  if (adminData.active !== true) {
    throw new HttpsError("permission-denied", "Tu cuenta no esta habilitada para operar en este negocio.");
  }

  return {
    id: adminSnapshot.id,
    tenantId,
    ...adminData
  };
}

async function requirePrimaryAdminManager(request) {
  const tenantId = requiredTenantId(request.data?.tenantId);

  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesion para administrar accesos.");
  }

  const adminProfile = await getOwnAdminProfile(tenantId, request.auth.uid);

  if (!canManageAdminAccess(adminProfile, request.auth.token?.email)) {
    throw new HttpsError("permission-denied", "Tu cuenta no puede crear accesos para otros administradores.");
  }

  return {
    tenantId,
    adminProfile
  };
}

async function findExistingAdminByEmail(tenantId, normalizedEmail) {
  const normalizedSnapshot = await tenantCollection(tenantId, "admins")
    .where("emailNormalized", "==", normalizedEmail)
    .limit(1)
    .get();

  if (!normalizedSnapshot.empty) {
    return normalizedSnapshot.docs[0];
  }

  const emailSnapshot = await tenantCollection(tenantId, "admins")
    .where("email", "==", normalizedEmail)
    .limit(1)
    .get();

  if (!emailSnapshot.empty) {
    return emailSnapshot.docs[0];
  }

  return null;
}

function buildManagedAdminDocument(inviteData, userAuth, tenantId) {
  const roleConfig = managedAdminRoles[inviteData.role] || managedAdminRoles.manicura;
  const displayName = optionalString(inviteData.displayName) || optionalString(userAuth?.token?.name) || roleConfig.label;
  const businessName = optionalString(inviteData.businessName) || roleConfig.businessName;
  const specialtyKey = optionalString(inviteData.specialtyKey || inviteData.role).toLowerCase() || "manicura";

  return {
    tenantId,
    displayName,
    businessName,
    area: optionalString(inviteData.area) || roleConfig.area,
    publicArea: optionalString(inviteData.publicArea) || roleConfig.publicArea,
    role: specialtyKey,
    specialtyKey,
    membershipRole: optionalString(inviteData.membershipRole) || "professional",
    email: inviteData.email,
    emailNormalized: inviteData.normalizedEmail,
    active: true,
    publicBookingEnabled: true,
    timezone: optionalString(inviteData.timezone) || defaultSalonTimeZone,
    slug: optionalString(inviteData.slug) || slugify(`${specialtyKey}-${displayName}`),
    managedByAdminId: inviteData.ownerAdminId,
    canManageAdminAccess: false,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  };
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + Number(days || 0));
  return nextDate;
}

function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const mappedParts = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      mappedParts[part.type] = part.value;
    }
  });

  return mappedParts;
}

function validateRequestedWindow(isoDate, timeZone) {
  const parsedDate = new Date(isoDate);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpsError("invalid-argument", "requestedStartAt debe ser una fecha ISO valida.");
  }

  const localParts = getLocalParts(parsedDate, timeZone);
  const localHour = Number(localParts.hour);

  if (!allowedDays.includes(localParts.weekday)) {
    throw new HttpsError("failed-precondition", "Los turnos solo pueden solicitarse de martes a sabado.");
  }

  if (localHour < bookingWindow.startHour || localHour >= bookingWindow.endHour) {
    throw new HttpsError(
      "failed-precondition",
      "Los turnos solo pueden solicitarse entre las 10:00 y las 20:00."
    );
  }

  return parsedDate;
}

async function getAdminProfile(tenantId, adminId) {
  await getTenant(tenantId, { requirePublicEnabled: true });
  const adminSnapshot = await tenantCollection(tenantId, "admins").doc(adminId).get();

  if (!adminSnapshot.exists) {
    throw new HttpsError("not-found", "No existe el administrador seleccionado.");
  }

  const adminData = adminSnapshot.data() || {};

  if (adminData.active !== true) {
    throw new HttpsError("permission-denied", "El administrador no esta habilitado para operar.");
  }

  if (adminData.publicBookingEnabled === false) {
    throw new HttpsError("failed-precondition", "Este profesional no recibe turnos desde la web publica.");
  }

  return {
    id: adminSnapshot.id,
    tenantId,
    ...adminData
  };
}

async function getService(tenantId, serviceId, adminId) {
  const serviceSnapshot = await tenantCollection(tenantId, "servicios").doc(serviceId).get();

  if (!serviceSnapshot.exists) {
    throw new HttpsError("not-found", "El servicio solicitado no existe.");
  }

  const serviceData = serviceSnapshot.data() || {};

  if (serviceData.adminId !== adminId) {
    throw new HttpsError("failed-precondition", "El servicio no pertenece al administrador indicado.");
  }

  if (serviceData.publicVisible !== true) {
    throw new HttpsError("failed-precondition", "El servicio no esta disponible para la web publica.");
  }

  return {
    id: serviceSnapshot.id,
    tenantId,
    ...serviceData
  };
}

async function findExistingClient(tenantId, phoneSearch, emailSearch) {
  if (phoneSearch) {
    const phoneSnapshot = await tenantCollection(tenantId, "clientes")
      .where("phoneSearch", "==", phoneSearch)
      .limit(1)
      .get();

    if (!phoneSnapshot.empty) {
      return phoneSnapshot.docs[0];
    }
  }

  if (emailSearch) {
    const emailSnapshot = await tenantCollection(tenantId, "clientes")
      .where("emailSearch", "==", emailSearch)
      .limit(1)
      .get();

    if (!emailSnapshot.empty) {
      return emailSnapshot.docs[0];
    }
  }

  return null;
}

async function upsertClient(tenantId, adminId, service, rawClient) {
  const fullName = requiredString(rawClient.fullName, "client.fullName");
  const phone = requiredString(rawClient.phone, "client.phone");
  const email = optionalString(rawClient.email);
  const phoneSearch = normalizePhone(phone);
  const emailSearch = normalizeEmail(email);

  const existingClientSnapshot = await findExistingClient(tenantId, phoneSearch, emailSearch);
  const clientRef = existingClientSnapshot
    ? existingClientSnapshot.ref
    : tenantCollection(tenantId, "clientes").doc(`client-${slugify(fullName).slice(0, 24) || "nuevo"}-${Date.now()}`);

  await clientRef.set({
    tenantId,
    adminId,
    adminIds: FieldValue.arrayUnion(adminId),
    fullName,
    phone,
    phoneSearch,
    email,
    emailSearch,
    source: "public-web",
    preferredArea: service.area || "",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existingClientSnapshot ? existingClientSnapshot.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    clientId: clientRef.id,
    clientSnapshot: {
      fullName,
      phone,
      email
    }
  };
}

exports.healthcheck = onRequest((request, response) => {
  response.json({
    ok: true,
    service: "rockeala-functions",
    stage: "multi-tenant-migration",
    generatedAt: new Date().toISOString()
  });
});

exports.listPublicAdminProfiles = onCall(callableRuntimeOptions, async (request) => {
  const tenantId = requiredTenantId(request.data?.tenantId);
  await getTenant(tenantId, { requirePublicEnabled: true });

  const [adminsSnapshot, servicesSnapshot] = await Promise.all([
    tenantCollection(tenantId, "admins")
      .where("active", "==", true)
      .get(),
    tenantCollection(tenantId, "servicios")
      .where("publicVisible", "==", true)
      .get()
  ]);

  const serviceHintsByAdmin = servicesSnapshot.docs.reduce((accumulator, documentSnapshot) => {
    const serviceData = documentSnapshot.data() || {};
    const adminId = optionalString(serviceData.adminId);

    if (!adminId) {
      return accumulator;
    }

    if (!accumulator.has(adminId)) {
      accumulator.set(adminId, []);
    }

    accumulator.get(adminId).push([
      serviceData.area,
      serviceData.name,
      serviceData.description
    ].filter(Boolean).join(" "));

    return accumulator;
  }, new Map());

  const admins = adminsSnapshot.docs
    .filter((documentSnapshot) => documentSnapshot.data()?.publicBookingEnabled !== false)
    .map((documentSnapshot) => buildPublicAdminProfile(
      documentSnapshot,
      serviceHintsByAdmin.get(documentSnapshot.id) || []
    ))
    .sort((leftItem, rightItem) => (
      leftItem.displayName.localeCompare(rightItem.displayName, "es")
    ));

  return {
    ok: true,
    tenantId,
    admins
  };
});

exports.createManagedAdminAccess = onCall(callableRuntimeOptions, async (request) => {
  const { tenantId, adminProfile: ownerProfile } = await requirePrimaryAdminManager(request);
  const displayName = requiredString(request.data?.displayName, "displayName");
  const email = normalizeEmail(requiredString(request.data?.email, "email"));
  const roleConfig = getManagedAdminRoleConfig(request.data?.role);
  const businessName = optionalString(request.data?.businessName) || roleConfig.businessName;

  if (!email.includes("@")) {
    throw new HttpsError("invalid-argument", "El email indicado no es valido.");
  }

  const existingAdminSnapshot = await findExistingAdminByEmail(tenantId, email);

  if (existingAdminSnapshot) {
    throw new HttpsError("failed-precondition", "Ya existe un administrador activo con ese email.");
  }

  const inviteRef = tenantCollection(tenantId, "adminInvites").doc(email);
  const inviteSnapshot = await inviteRef.get();

  if (inviteSnapshot.exists && inviteSnapshot.data()?.status === "pending") {
    throw new HttpsError("failed-precondition", "Ya hay una invitacion pendiente para ese email.");
  }

  await inviteRef.set({
    tenantId,
    email,
    normalizedEmail: email,
    displayName,
    businessName,
    role: roleConfig.role,
    specialtyKey: roleConfig.role,
    membershipRole: "professional",
    area: roleConfig.area,
    publicArea: roleConfig.publicArea,
    timezone: ownerProfile.timezone || defaultSalonTimeZone,
    ownerAdminId: ownerProfile.id,
    ownerBusinessName: ownerProfile.businessName || ownerProfile.displayName || "Rockeala Peluqueria",
    status: "pending",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: inviteSnapshot.exists ? inviteSnapshot.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    ok: true,
    tenantId,
    message: "Invitacion creada. La persona debe entrar con Google usando ese email."
  };
});

exports.listManagedAdminAccess = onCall(callableRuntimeOptions, async (request) => {
  const { tenantId } = await requirePrimaryAdminManager(request);

  const [adminsSnapshot, invitesSnapshot] = await Promise.all([
    tenantCollection(tenantId, "admins")
      .where("managedByAdminId", "==", request.auth.uid)
      .get(),
    tenantCollection(tenantId, "adminInvites")
      .where("ownerAdminId", "==", request.auth.uid)
      .get()
  ]);

  const admins = adminsSnapshot.docs
    .map((documentSnapshot) => {
      const adminData = documentSnapshot.data() || {};

      return {
        id: documentSnapshot.id,
        displayName: adminData.displayName || "",
        businessName: adminData.businessName || "",
        email: adminData.email || "",
        role: adminData.specialtyKey || adminData.role || "",
        membershipRole: adminData.membershipRole || "",
        active: adminData.active === true,
        publicBookingEnabled: adminData.publicBookingEnabled !== false,
        createdAt: toIsoString(adminData.createdAt),
        updatedAt: toIsoString(adminData.updatedAt)
      };
    })
    .sort((leftItem, rightItem) => (
      toMillis(rightItem.updatedAt || rightItem.createdAt) - toMillis(leftItem.updatedAt || leftItem.createdAt)
    ));

  const invites = invitesSnapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }))
    .filter((invite) => invite.status === "pending")
    .map((invite) => ({
      id: invite.id,
      displayName: invite.displayName || "",
      businessName: invite.businessName || "",
      email: invite.email || "",
      role: invite.specialtyKey || invite.role || "",
      membershipRole: invite.membershipRole || "",
      status: invite.status || "pending",
      createdAt: toIsoString(invite.createdAt),
      updatedAt: toIsoString(invite.updatedAt)
    }))
    .sort((leftItem, rightItem) => (
      toMillis(rightItem.updatedAt || rightItem.createdAt) - toMillis(leftItem.updatedAt || leftItem.createdAt)
    ));

  return {
    ok: true,
    tenantId,
    admins,
    invites
  };
});

exports.claimManagedAdminAccess = onCall(callableRuntimeOptions, async (request) => {
  const tenantId = requiredTenantId(request.data?.tenantId);
  await getTenant(tenantId, { requireAdminEnabled: true });

  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesion para reclamar el acceso.");
  }

  const normalizedEmail = normalizeEmail(request.auth.token?.email);

  if (!normalizedEmail) {
    throw new HttpsError("failed-precondition", "Tu cuenta de Google no tiene un email valido para reclamar acceso.");
  }

  const adminRef = tenantCollection(tenantId, "admins").doc(request.auth.uid);
  const inviteRef = tenantCollection(tenantId, "adminInvites").doc(normalizedEmail);
  let claimResult = { claimed: false, alreadyActive: false };

  await db.runTransaction(async (transaction) => {
    const [adminSnapshot, inviteSnapshot] = await Promise.all([
      transaction.get(adminRef),
      transaction.get(inviteRef)
    ]);

    if (adminSnapshot.exists) {
      claimResult = {
        claimed: false,
        alreadyActive: adminSnapshot.data()?.active === true
      };
      return;
    }

    if (!inviteSnapshot.exists) {
      throw new HttpsError("permission-denied", "Tu cuenta no tiene una invitacion activa para entrar.");
    }

    const inviteData = inviteSnapshot.data() || {};

    if (inviteData.status !== "pending") {
      throw new HttpsError("failed-precondition", "La invitacion asociada a tu cuenta ya no esta disponible.");
    }

    const roleConfig = getManagedAdminRoleConfig(inviteData.specialtyKey || inviteData.role);
    const adminPayload = buildManagedAdminDocument({
      ...inviteData,
      role: roleConfig.role,
      specialtyKey: roleConfig.role
    }, request.auth, tenantId);

    transaction.set(adminRef, adminPayload, { merge: true });
    transaction.set(inviteRef, {
      status: "claimed",
      claimedByUid: request.auth.uid,
      claimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    claimResult = {
      claimed: true,
      alreadyActive: false
    };
  });

  return {
    ok: true,
    tenantId,
    ...claimResult
  };
});

exports.submitAppointmentRequest = onCall(callableRuntimeOptions, async (request) => {
  const payload = request.data || {};
  const tenantId = requiredTenantId(payload.tenantId);
  const client = payload.client || {};
  const adminId = requiredString(payload.adminId, "adminId");
  const serviceId = requiredString(payload.serviceId, "serviceId");
  const adminProfile = await getAdminProfile(tenantId, adminId);
  const requestedDate = validateRequestedWindow(
    payload.requestedStartAt,
    adminProfile.timezone || defaultSalonTimeZone
  );
  const service = await getService(tenantId, serviceId, adminId);
  const clientData = await upsertClient(tenantId, adminId, service, client);
  const notes = optionalString(payload.notes);
  const appointmentRef = tenantCollection(tenantId, "turnos").doc();

  await appointmentRef.set({
    tenantId,
    adminId,
    clientId: clientData.clientId,
    clientSnapshot: clientData.clientSnapshot,
    serviceId: service.id,
    serviceNameSnapshot: service.name,
    serviceAreaSnapshot: service.area || "",
    requestedStartAt: Timestamp.fromDate(requestedDate),
    estimatedDurationMinutes: Number(service.durationMinutes || 0),
    status: "pending",
    source: "public-web",
    notes,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    tenantId,
    appointmentId: appointmentRef.id,
    message: "Solicitud registrada. El panel administrador podra confirmarla."
  };
});

exports.registerTenant = onCall(callableRuntimeOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesion con Google para crear tu negocio.");
  }

  const payload = request.data || {};
  const tenantId = requiredTenantId(payload.tenantId);
  const businessName = requiredString(payload.businessName, "businessName");
  const displayName = requiredString(payload.displayName, "displayName");
  const selectedPlan = await getEnabledPlan(payload.planId);
  const ownerEmail = normalizeEmail(request.auth.token?.email);

  if (!ownerEmail) {
    throw new HttpsError("failed-precondition", "Tu cuenta de Google no tiene un email valido.");
  }

  const tenantDocumentRef = tenantRef(tenantId);
  const ownerAdminRef = tenantCollection(tenantId, "admins").doc(request.auth.uid);
  const registrationDate = new Date();
  const trialDays = Number(selectedPlan.trialDays || 0);
  const trialEndsAt = trialDays > 0 ? Timestamp.fromDate(addDays(registrationDate, trialDays)) : null;

  await db.runTransaction(async (transaction) => {
    const [tenantSnapshot, ownerSnapshot] = await Promise.all([
      transaction.get(tenantDocumentRef),
      transaction.get(ownerAdminRef)
    ]);

    if (tenantSnapshot.exists) {
      throw new HttpsError("already-exists", "Ya existe un negocio con ese tenantId.");
    }

    if (ownerSnapshot.exists) {
      throw new HttpsError("failed-precondition", "Tu cuenta ya tiene un perfil owner creado para este tenant.");
    }

    transaction.set(tenantDocumentRef, {
      name: businessName,
      slug: tenantId,
      businessName,
      active: true,
      publicEnabled: true,
      adminEnabled: true,
      customDomain: "",
      timezone: defaultSalonTimeZone,
      ownerAdminId: request.auth.uid,
      ownerEmail,
      planId: selectedPlan.id,
      planName: selectedPlan.name || selectedPlan.id,
      planEnabled: selectedPlan.enabled === true,
      planPriceMonthly: Number(selectedPlan.priceMonthly || 0),
      planCurrency: selectedPlan.currency || "ARS",
      planTrialDays: trialDays,
      planStatus: selectedPlan.id === "prueba" ? "trial" : "active",
      trialEndsAt,
      limits: {
        maxProducts: Number(selectedPlan.maxProducts || 0),
        maxEmployeesPerCategory: Number(selectedPlan.maxEmployeesPerCategory || 0)
      },
      features: Array.isArray(selectedPlan.includedFeatures) && selectedPlan.includedFeatures.length
        ? selectedPlan.includedFeatures
        : sharedPlanFeatures,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    transaction.set(ownerAdminRef, {
      tenantId,
      displayName,
      businessName,
      area: "Peluqueria",
      publicArea: "Peluqueria",
      role: "peluqueria",
      specialtyKey: "peluqueria",
      membershipRole: "owner",
      email: ownerEmail,
      emailNormalized: ownerEmail,
      active: true,
      publicBookingEnabled: true,
      timezone: defaultSalonTimeZone,
      slug: slugify(displayName || businessName),
      canManageAdminAccess: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return {
    ok: true,
    tenantId,
    publicUrlPath: `/${tenantId}`,
    message: "Negocio creado correctamente."
  };
});
