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

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `El campo ${fieldName} es obligatorio.`);
  }

  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
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

async function getAdminProfile(adminId) {
  const adminSnapshot = await db.collection("admins").doc(adminId).get();

  if (!adminSnapshot.exists) {
    throw new HttpsError("not-found", "No existe el administrador seleccionado.");
  }

  const adminData = adminSnapshot.data();

  if (adminData.active !== true) {
    throw new HttpsError("permission-denied", "El administrador no esta habilitado para operar.");
  }

  if (adminData.publicBookingEnabled === false) {
    throw new HttpsError("failed-precondition", "Este profesional no recibe turnos desde la web publica.");
  }

  return {
    id: adminSnapshot.id,
    ...adminData
  };
}

async function getService(serviceId, adminId) {
  const serviceSnapshot = await db.collection("servicios").doc(serviceId).get();

  if (!serviceSnapshot.exists) {
    throw new HttpsError("not-found", "El servicio solicitado no existe.");
  }

  const serviceData = serviceSnapshot.data();

  if (serviceData.adminId !== adminId) {
    throw new HttpsError("failed-precondition", "El servicio no pertenece al administrador indicado.");
  }

  if (serviceData.publicVisible !== true) {
    throw new HttpsError("failed-precondition", "El servicio no esta disponible para la web publica.");
  }

  return {
    id: serviceSnapshot.id,
    ...serviceData
  };
}

async function findExistingClient(phoneSearch, emailSearch) {
  if (phoneSearch) {
    const phoneSnapshot = await db.collection("clientes")
      .where("phoneSearch", "==", phoneSearch)
      .limit(1)
      .get();

    if (!phoneSnapshot.empty) {
      return phoneSnapshot.docs[0];
    }
  }

  if (emailSearch) {
    const emailSnapshot = await db.collection("clientes")
      .where("emailSearch", "==", emailSearch)
      .limit(1)
      .get();

    if (!emailSnapshot.empty) {
      return emailSnapshot.docs[0];
    }
  }

  return null;
}

async function upsertClient(adminId, service, rawClient) {
  const fullName = requiredString(rawClient.fullName, "client.fullName");
  const phone = requiredString(rawClient.phone, "client.phone");
  const email = optionalString(rawClient.email);
  const phoneSearch = normalizePhone(phone);
  const emailSearch = normalizeEmail(email);

  const existingClientSnapshot = await findExistingClient(phoneSearch, emailSearch);
  const clientRef = existingClientSnapshot
    ? existingClientSnapshot.ref
    : db.collection("clientes").doc(`client-${slugify(fullName).slice(0, 24) || "nuevo"}-${Date.now()}`);

  await clientRef.set({
    adminIds: FieldValue.arrayUnion(adminId),
    fullName,
    phone,
    phoneSearch,
    email,
    emailSearch,
    source: "public-web",
    preferredArea: service.area || "",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existingClientSnapshot ? existingClientSnapshot.data().createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp()
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
    stage: "implementation-v1",
    generatedAt: new Date().toISOString()
  });
});

exports.submitAppointmentRequest = onCall(async (request) => {
  const payload = request.data || {};
  const client = payload.client || {};
  const adminId = requiredString(payload.adminId, "adminId");
  const serviceId = requiredString(payload.serviceId, "serviceId");
  const adminProfile = await getAdminProfile(adminId);
  const requestedDate = validateRequestedWindow(
    payload.requestedStartAt,
    adminProfile.timezone || defaultSalonTimeZone
  );
  const service = await getService(serviceId, adminId);
  const clientData = await upsertClient(adminId, service, client);
  const notes = optionalString(payload.notes);
  const appointmentRef = db.collection("turnos").doc();

  await appointmentRef.set({
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
    appointmentId: appointmentRef.id,
    message: "Solicitud registrada. El panel administrador podra confirmarla."
  };
});
