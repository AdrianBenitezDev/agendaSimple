function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compareText(firstValue, secondValue) {
  return String(firstValue || "").localeCompare(String(secondValue || ""), "es", { sensitivity: "base" });
}

function buildAdminLookup(adminEntries = []) {
  const adminsById = new Map();

  adminEntries.forEach((entry) => {
    if (!entry?.id) {
      return;
    }

    const data = entry.data && typeof entry.data === "object" ? entry.data : {};
    adminsById.set(entry.id, {
      uid: cleanString(entry.id),
      displayName: cleanString(data.displayName),
      businessName: cleanString(data.businessName),
      email: cleanString(data.email),
      area: cleanString(data.area),
      publicArea: cleanString(data.publicArea)
    });
  });

  return adminsById;
}

function buildTenantServiceConfigData(serviceEntries = [], adminEntries = []) {
  const adminsById = buildAdminLookup(adminEntries);

  const servicios = serviceEntries
    .map((entry) => {
      const data = entry?.data && typeof entry.data === "object" ? entry.data : {};
      const specialistUid = cleanString(data.adminId);
      const specialist = adminsById.get(specialistUid) || {};

      return {
        serviceId: cleanString(entry?.id),
        serviceName: cleanString(data.name) || "Servicio sin nombre",
        area: cleanString(data.area)
          || specialist.publicArea
          || specialist.area
          || "Servicios",
        specialistName: specialist.displayName
          || cleanString(data.adminName)
          || specialist.businessName
          || "Especialista sin nombre",
        specialistEmail: specialist.email || "",
        specialistUid,
        publicVisible: data.publicVisible !== false
      };
    })
    .sort((firstEntry, secondEntry) => (
      compareText(firstEntry.area, secondEntry.area)
      || compareText(firstEntry.serviceName, secondEntry.serviceName)
      || compareText(firstEntry.specialistName, secondEntry.specialistName)
    ));

  return {
    servicios,
    servicesCount: servicios.length,
    specialistsCount: new Set(
      servicios
        .map((entry) => entry.specialistUid)
        .filter(Boolean)
    ).size
  };
}

module.exports = {
  buildTenantServiceConfigData
};
