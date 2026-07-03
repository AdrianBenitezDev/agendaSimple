const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { buildTenantServiceConfigData } = require("./lib/tenant-service-config");

const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const allowProd = process.env.ROCKEALA_SEED_ALLOW_PROD === "true";
const dryRun = process.env.ROCKEALA_SYNC_DRY_RUN === "true";
const source = String(process.env.ROCKEALA_SYNC_SOURCE || "firestore").trim().toLowerCase();
const seedFile = process.env.ROCKEALA_SYNC_SEED_FILE
  ? path.resolve(process.env.ROCKEALA_SYNC_SEED_FILE)
  : path.resolve(__dirname, "../seed/demo-data.json");
const tenantIds = String(process.env.ROCKEALA_SYNC_TENANT_IDS || "rockeala,pruebacliente")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!isEmulator && !allowProd) {
  console.error("Bloqueado: para escribir fuera del emulador define ROCKEALA_SEED_ALLOW_PROD=true.");
  process.exit(1);
}

if (tenantIds.length === 0) {
  console.error("No hay tenants para sincronizar.");
  process.exit(1);
}

initializeApp();
const db = getFirestore();

function mapSnapshotEntries(snapshot) {
  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    data: documentSnapshot.data()
  }));
}

function readSeedTenants() {
  const seedData = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  const tenants = Array.isArray(seedData.tenants) ? seedData.tenants : [];
  return new Map(tenants.map((tenantEntry) => [tenantEntry.id, tenantEntry]));
}

async function buildConfigFromFirestore(tenantId) {
  const tenantRef = db.collection("tenants").doc(tenantId);
  const [tenantSnapshot, adminsSnapshot, servicesSnapshot] = await Promise.all([
    tenantRef.get(),
    tenantRef.collection("admins").get(),
    tenantRef.collection("servicios").get()
  ]);

  if (!tenantSnapshot.exists) {
    throw new Error(`El tenant ${tenantId} no existe.`);
  }

  return buildTenantServiceConfigData(
    mapSnapshotEntries(servicesSnapshot),
    mapSnapshotEntries(adminsSnapshot)
  );
}

function buildConfigFromSeed(seedTenants, tenantId) {
  const tenantEntry = seedTenants.get(tenantId);

  if (!tenantEntry) {
    throw new Error(`El tenant ${tenantId} no existe en el seed ${seedFile}.`);
  }

  return buildTenantServiceConfigData(tenantEntry.servicios, tenantEntry.admins);
}

async function syncTenantServiceConfig(tenantId) {
  const tenantRef = db.collection("tenants").doc(tenantId);
  const tenantSnapshot = await tenantRef.get();

  if (!tenantSnapshot.exists) {
    throw new Error(`El tenant ${tenantId} no existe.`);
  }

  const seedTenants = source === "seed" ? readSeedTenants() : null;
  const configData = source === "seed"
    ? buildConfigFromSeed(seedTenants, tenantId)
    : await buildConfigFromFirestore(tenantId);

  const payload = {
    tenantId,
    ...configData,
    generatedFrom: source === "seed" ? "sync-tenant-service-config:seed" : "sync-tenant-service-config:firestore",
    updatedAt: FieldValue.serverTimestamp()
  };

  if (!dryRun) {
    await tenantRef.collection("config").doc("servicios").set(payload, { merge: true });
  }

  return payload;
}

async function main() {
  for (const tenantId of tenantIds) {
    const payload = await syncTenantServiceConfig(tenantId);
    console.log(`Tenant ${tenantId}: ${payload.servicesCount} servicios, ${payload.specialistsCount} especialistas.`);

    if (dryRun) {
      console.log(JSON.stringify({
        tenantId,
        servicios: payload.servicios
      }, null, 2));
    }
  }

  console.log(`Sincronizacion completada en ${dryRun ? "modo dry-run" : (isEmulator ? "emulador" : "proyecto real")}. Fuente: ${source}.`);
}

main().catch((error) => {
  console.error("No se pudo sincronizar config/servicios.");
  console.error(error);
  process.exit(1);
});
