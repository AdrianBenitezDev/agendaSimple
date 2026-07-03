function sanitizeTenantId(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function resolveAdminTenantId() {
  const queryTenant = sanitizeTenantId(new URLSearchParams(window.location.search).get("tenant"));

  if (queryTenant) {
    return queryTenant;
  }

  const pathnameSegments = window.location.pathname
    .split("/")
    .map((segment) => sanitizeTenantId(segment))
    .filter(Boolean)
    .filter((segment) => !["panel", "register", "registro"].includes(segment));

  if (pathnameSegments[0]) {
    return pathnameSegments[0];
  }

  return "";
}
