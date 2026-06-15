const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const dataFile = process.env.ROCKEALA_SEED_FILE
  ? path.resolve(process.env.ROCKEALA_SEED_FILE)
  : path.resolve(__dirname, "../seed/demo-data.json");

const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const allowProd = process.env.ROCKEALA_SEED_ALLOW_PROD === "true";

if (!isEmulator && !allowProd) {
  console.error("Bloqueado: para escribir fuera del emulador define ROCKEALA_SEED_ALLOW_PROD=true.");
  process.exit(1);
}

initializeApp();
const db = getFirestore();

function readSeedFile() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function toTimestamp(value) {
  if (typeof value !== "string") {
    return value;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? value : Timestamp.fromDate(parsedDate);
}

function normalizeDateFields(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeDateFields);
  }

  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const normalized = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      normalized[key] = normalizeDateFields(value);
      return;
    }

    if (Array.isArray(value)) {
      normalized[key] = value.map(normalizeDateFields);
      return;
    }

    normalized[key] = key.endsWith("At") || key === "date"
      ? toTimestamp(value)
      : value;
  });

  return normalized;
}

function withTenantId(data, tenantId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  return {
    tenantId,
    ...data
  };
}

async function seedTenantCollection(writer, tenantRef, tenantId, collectionName, docs = []) {
  docs.forEach((entry) => {
    const ref = tenantRef.collection(collectionName).doc(entry.id);
    writer.set(ref, normalizeDateFields(withTenantId(entry.data, tenantId)), { merge: true });
  });
}

async function seedTenantClients(writer, tenantRef, tenantId, clients = []) {
  clients.forEach((entry) => {
    const clientRef = tenantRef.collection("clientes").doc(entry.id);
    writer.set(clientRef, normalizeDateFields(withTenantId(entry.data, tenantId)), { merge: true });

    Object.entries(entry.adminProfiles || {}).forEach(([adminId, profileData]) => {
      const profileRef = clientRef.collection("perfilesAdmin").doc(adminId);
      writer.set(profileRef, normalizeDateFields(withTenantId(profileData.data, tenantId)), { merge: true });

      (profileData.treatments || []).forEach((treatment) => {
        writer.set(
          profileRef.collection("tratamientos").doc(treatment.id),
          normalizeDateFields(withTenantId(treatment.data, tenantId)),
          { merge: true }
        );
      });
    });
  });
}

async function seedTenants(seedData) {
  const writer = db.bulkWriter();
  const tenants = Array.isArray(seedData.tenants) ? seedData.tenants : [];

  tenants.forEach((tenantEntry) => {
    const tenantId = tenantEntry.id;
    const tenantRef = db.collection("tenants").doc(tenantId);

    writer.set(tenantRef, normalizeDateFields({
      slug: tenantId,
      active: true,
      publicEnabled: true,
      adminEnabled: true,
      timezone: "America/Argentina/Buenos_Aires",
      ...tenantEntry.data
    }), { merge: true });

    seedTenantCollection(writer, tenantRef, tenantId, "admins", tenantEntry.admins);
    seedTenantCollection(writer, tenantRef, tenantId, "adminInvites", tenantEntry.adminInvites);
    seedTenantCollection(writer, tenantRef, tenantId, "servicios", tenantEntry.servicios);
    seedTenantCollection(writer, tenantRef, tenantId, "stock", tenantEntry.stock);
    seedTenantCollection(writer, tenantRef, tenantId, "productos", tenantEntry.productos);
    seedTenantCollection(writer, tenantRef, tenantId, "turnos", tenantEntry.turnos);
    seedTenantCollection(writer, tenantRef, tenantId, "pagos", tenantEntry.pagos);
    seedTenantCollection(writer, tenantRef, tenantId, "salonMedia", tenantEntry.salonMedia);
    seedTenantClients(writer, tenantRef, tenantId, tenantEntry.clientes);
  });

  await writer.close();
}

async function seedLegacyCollections(seedData) {
  const writer = db.bulkWriter();

  (seedData.admins || []).forEach((entry) => {
    writer.set(db.collection("admins").doc(entry.id), normalizeDateFields(entry.data), { merge: true });
  });
  (seedData.servicios || []).forEach((entry) => {
    writer.set(db.collection("servicios").doc(entry.id), normalizeDateFields(entry.data), { merge: true });
  });
  (seedData.stock || []).forEach((entry) => {
    writer.set(db.collection("stock").doc(entry.id), normalizeDateFields(entry.data), { merge: true });
  });
  (seedData.productos || []).forEach((entry) => {
    writer.set(db.collection("productos").doc(entry.id), normalizeDateFields(entry.data), { merge: true });
  });
  (seedData.turnos || []).forEach((entry) => {
    writer.set(db.collection("turnos").doc(entry.id), normalizeDateFields(entry.data), { merge: true });
  });
  (seedData.clientes || []).forEach((entry) => {
    const clientRef = db.collection("clientes").doc(entry.id);
    writer.set(clientRef, normalizeDateFields(entry.data), { merge: true });

    Object.entries(entry.adminProfiles || {}).forEach(([adminId, profileData]) => {
      const profileRef = clientRef.collection("perfilesAdmin").doc(adminId);
      writer.set(profileRef, normalizeDateFields(profileData.data), { merge: true });

      (profileData.treatments || []).forEach((treatment) => {
        writer.set(
          profileRef.collection("tratamientos").doc(treatment.id),
          normalizeDateFields(treatment.data),
          { merge: true }
        );
      });
    });
  });

  await writer.close();
}

async function main() {
  const seedData = readSeedFile();

  if (Array.isArray(seedData.tenants) && seedData.tenants.length > 0) {
    await seedTenants(seedData);

    const tenantSummary = seedData.tenants.map((tenantEntry) => {
      const countServices = (tenantEntry.servicios || []).length;
      const countProducts = (tenantEntry.productos || []).length;
      const countClients = (tenantEntry.clientes || []).length;
      return `- ${tenantEntry.id}: ${countServices} servicios, ${countProducts} productos, ${countClients} clientes`;
    });

    console.log("Seed multi-tenant completado:");
    tenantSummary.forEach((line) => console.log(line));
    console.log(`Destino: ${isEmulator ? "emulador" : "proyecto real"}`);
    return;
  }

  await seedLegacyCollections(seedData);
  console.log("Seed legacy completado.");
  console.log(`Destino: ${isEmulator ? "emulador" : "proyecto real"}`);
}

main().catch((error) => {
  console.error("No se pudo completar el seed.");
  console.error(error);
  process.exit(1);
});
