function sanitizeTenantId(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function resolveAdminTenantId() {
  const pathnameSegments = window.location.pathname
    .split("/")
    .map((segment) => sanitizeTenantId(segment))
    .filter(Boolean);

  if (pathnameSegments[0]) {
    return pathnameSegments[0];
  }

  const queryTenant = sanitizeTenantId(new URLSearchParams(window.location.search).get("tenant"));
  return queryTenant || "";
}
