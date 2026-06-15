const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const allowProd = process.env.ROCKEALA_PLANS_ALLOW_PROD === "true";
const projectId = process.env.GOOGLE_CLOUD_PROJECT || "rockeala";

if (!isEmulator && !allowProd) {
  console.error("Bloqueado: para escribir planes fuera del emulador define ROCKEALA_PLANS_ALLOW_PROD=true.");
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();

const includedFeatures = [
  "Control de turnos",
  "Balance",
  "Ficha de clientes",
  "Control de stock",
  "Productos para la venta",
  "Pagina web para los clientes"
];

const plans = [
  {
    id: "prueba",
    data: {
      name: "Prueba",
      enabled: true,
      sortOrder: 1,
      priceMonthly: 0,
      currency: "ARS",
      billingLabel: "Gratis",
      trialDays: 14,
      maxProducts: 100,
      maxEmployeesPerCategory: 1,
      productLabel: "100 productos",
      employeesLabel: "1 empleado/categoria",
      description: "Plan de prueba para empezar rapido.",
      includedFeatures
    }
  },
  {
    id: "standar",
    data: {
      name: "Standar",
      enabled: true,
      sortOrder: 2,
      priceMonthly: 10000,
      currency: "ARS",
      billingLabel: "10.000 $ mensuales",
      trialDays: 0,
      maxProducts: 200,
      maxEmployeesPerCategory: 1,
      productLabel: "200 productos sincronizados",
      employeesLabel: "Maximo de 1 empleado/categoria",
      description: "Ideal para negocios chicos con una sola categoria operativa.",
      includedFeatures
    }
  },
  {
    id: "plus",
    data: {
      name: "Plus",
      enabled: true,
      sortOrder: 3,
      priceMonthly: 20000,
      currency: "ARS",
      billingLabel: "20.000 $ mensuales",
      trialDays: 0,
      maxProducts: 300,
      maxEmployeesPerCategory: 3,
      productLabel: "300 productos sincronizados",
      employeesLabel: "Maximo de 3 empleados/categoria",
      description: "Pensado para equipos que ya trabajan varias categorias a la vez.",
      includedFeatures
    }
  },
  {
    id: "pro",
    data: {
      name: "Pro",
      enabled: true,
      sortOrder: 4,
      priceMonthly: 30000,
      currency: "ARS",
      billingLabel: "30.000 $ mensuales",
      trialDays: 0,
      maxProducts: 500,
      maxEmployeesPerCategory: 5,
      productLabel: "500 productos sincronizados",
      employeesLabel: "Maximo de 5 empleados/categoria",
      description: "La opcion mas amplia para negocios con estructura completa.",
      includedFeatures
    }
  }
];

async function main() {
  const writer = db.bulkWriter();

  plans.forEach((plan) => {
    writer.set(db.collection("planes").doc(plan.id), {
      ...plan.data,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  await writer.close();

  console.log("Planes sincronizados:");
  plans.forEach((plan) => console.log(`- ${plan.id}`));
  console.log(`- projectId: ${projectId}`);
  console.log(`Destino: ${isEmulator ? "emulador" : "proyecto real"}`);
}

main().catch((error) => {
  console.error("No se pudieron sincronizar los planes.");
  console.error(error);
  process.exit(1);
});
