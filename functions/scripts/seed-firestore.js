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

async function seedCollection(batch, collectionName, docs = []) {
  docs.forEach((entry) => {
    const ref = db.collection(collectionName).doc(entry.id);
    batch.set(ref, normalizeDateFields(entry.data), { merge: true });
  });
}

async function seedClients(batch, clients = []) {
  clients.forEach((entry) => {
    const clientRef = db.collection("clientes").doc(entry.id);
    batch.set(clientRef, normalizeDateFields(entry.data), { merge: true });

    Object.entries(entry.adminProfiles || {}).forEach(([adminId, profileData]) => {
      const profileRef = clientRef.collection("perfilesAdmin").doc(adminId);
      batch.set(profileRef, normalizeDateFields(profileData.data), { merge: true });

      (profileData.treatments || []).forEach((treatment) => {
        batch.set(
          profileRef.collection("tratamientos").doc(treatment.id),
          normalizeDateFields(treatment.data),
          { merge: true }
        );
      });
    });
  });
}

async function main() {
  const seedData = readSeedFile();
  const batch = db.batch();

  await seedCollection(batch, "admins", seedData.admins);
  await seedCollection(batch, "servicios", seedData.servicios);
  await seedCollection(batch, "stock", seedData.stock);
  await seedCollection(batch, "productos", seedData.productos);
  await seedCollection(batch, "turnos", seedData.turnos);
  await seedClients(batch, seedData.clientes);
  await batch.commit();

  console.log("Seed completado:");
  console.log(`- admins: ${(seedData.admins || []).length}`);
  console.log(`- servicios: ${(seedData.servicios || []).length}`);
  console.log(`- clientes: ${(seedData.clientes || []).length}`);
  console.log(`- stock: ${(seedData.stock || []).length}`);
  console.log(`- productos: ${(seedData.productos || []).length}`);
  console.log(`- turnos: ${(seedData.turnos || []).length}`);
  console.log(`Destino: ${isEmulator ? "emulador" : "proyecto real"}`);
}

main().catch((error) => {
  console.error("No se pudo completar el seed.");
  console.error(error);
  process.exit(1);
});
