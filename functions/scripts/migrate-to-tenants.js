const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const allowProd = process.env.ROCKEALA_MIGRATE_ALLOW_PROD === "true";
const projectId = process.env.GOOGLE_CLOUD_PROJECT || "rockeala";

if (!isEmulator && !allowProd) {
  console.error("Bloqueado: para migrar fuera del emulador define ROCKEALA_MIGRATE_ALLOW_PROD=true.");
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();

const rootCollections = [
  "admins",
  "adminInvites",
  "servicios",
  "turnos",
  "stock",
  "productos",
  "pagos",
  "salonMedia"
];

function withTenantId(data, tenantId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  return {
    tenantId,
    ...data
  };
}

function normalizeMigratedData(collectionName, data, tenantId) {
  const baseData = withTenantId(data, tenantId);

  if (collectionName === "admins") {
    return {
      specialtyKey: baseData.specialtyKey || baseData.role || "",
      membershipRole: baseData.membershipRole || (baseData.canManageAdminAccess ? "owner" : "professional"),
      ...baseData
    };
  }

  if (collectionName === "adminInvites") {
    return {
      specialtyKey: baseData.specialtyKey || baseData.role || "",
      membershipRole: baseData.membershipRole || "professional",
      ...baseData
    };
  }

  return baseData;
}

async function ensureTenants(writer) {
  const [rockealaSnapshot, pruebaSnapshot] = await Promise.all([
    db.collection("tenants").doc("rockeala").get(),
    db.collection("tenants").doc("pruebacliente").get()
  ]);
  const now = FieldValue.serverTimestamp();

  writer.set(db.collection("tenants").doc("rockeala"), {
    name: "Rockeala",
    slug: "rockeala",
    businessName: "Rockeala Salon",
    active: true,
    publicEnabled: true,
    adminEnabled: true,
    customDomain: "rockeala.com.ar",
    timezone: "America/Argentina/Buenos_Aires",
    whatsAppPhone: "54 9 11 2491-3261",
    whatsAppMessage: "Hola Rockeala, quiero reservar un turno.",
    updatedAt: now,
    createdAt: rockealaSnapshot.exists ? rockealaSnapshot.data()?.createdAt || now : now
  }, { merge: true });

  writer.set(db.collection("tenants").doc("pruebacliente"), {
    name: "Prueba Cliente",
    slug: "pruebacliente",
    businessName: "Prueba Cliente Studio",
    active: true,
    publicEnabled: true,
    adminEnabled: true,
    customDomain: "",
    timezone: "America/Argentina/Buenos_Aires",
    whatsAppPhone: "",
    whatsAppMessage: "Hola, quiero reservar un turno.",
    updatedAt: now,
    createdAt: pruebaSnapshot.exists ? pruebaSnapshot.data()?.createdAt || now : now
  }, { merge: true });
}

async function copyRootCollectionToTenant(writer, collectionName, tenantId) {
  const snapshot = await db.collection(collectionName).get();

  snapshot.forEach((documentSnapshot) => {
    const targetRef = db.collection("tenants").doc(tenantId).collection(collectionName).doc(documentSnapshot.id);
    writer.set(targetRef, normalizeMigratedData(collectionName, documentSnapshot.data(), tenantId), { merge: true });
  });

  return snapshot.size;
}

async function copyRootClientsToTenant(writer, tenantId) {
  const tenantRef = db.collection("tenants").doc(tenantId);
  const clientsSnapshot = await db.collection("clientes").get();
  let profileCount = 0;
  let treatmentCount = 0;

  for (const clientDocument of clientsSnapshot.docs) {
    const targetClientRef = tenantRef.collection("clientes").doc(clientDocument.id);
    writer.set(targetClientRef, withTenantId(clientDocument.data(), tenantId), { merge: true });

    const profilesSnapshot = await clientDocument.ref.collection("perfilesAdmin").get();

    for (const profileDocument of profilesSnapshot.docs) {
      profileCount += 1;
      const targetProfileRef = targetClientRef.collection("perfilesAdmin").doc(profileDocument.id);
      writer.set(targetProfileRef, withTenantId(profileDocument.data(), tenantId), { merge: true });

      const treatmentsSnapshot = await profileDocument.ref.collection("tratamientos").get();

      for (const treatmentDocument of treatmentsSnapshot.docs) {
        treatmentCount += 1;
        writer.set(
          targetProfileRef.collection("tratamientos").doc(treatmentDocument.id),
          withTenantId(treatmentDocument.data(), tenantId),
          { merge: true }
        );
      }
    }
  }

  return {
    clients: clientsSnapshot.size,
    profiles: profileCount,
    treatments: treatmentCount
  };
}

async function main() {
  const tenantId = "rockeala";
  const writer = db.bulkWriter();
  const summary = {};

  await ensureTenants(writer);

  for (const collectionName of rootCollections) {
    summary[collectionName] = await copyRootCollectionToTenant(writer, collectionName, tenantId);
  }

  const clientSummary = await copyRootClientsToTenant(writer, tenantId);
  await writer.close();

  console.log("Migracion multi-tenant completada:");
  console.log(`- tenant destino: ${tenantId}`);
  rootCollections.forEach((collectionName) => {
    console.log(`- ${collectionName}: ${summary[collectionName]}`);
  });
  console.log(`- clientes: ${clientSummary.clients}`);
  console.log(`- perfilesAdmin: ${clientSummary.profiles}`);
  console.log(`- tratamientos: ${clientSummary.treatments}`);
  console.log(`- tenants asegurados: rockeala, pruebacliente`);
  console.log(`- projectId: ${projectId}`);
  console.log(`Destino: ${isEmulator ? "emulador" : "proyecto real"}`);
  console.log("No se borraron colecciones raiz. Quedan como backup.");
}

main().catch((error) => {
  console.error("No se pudo completar la migracion.");
  console.error(error);
  process.exit(1);
});
