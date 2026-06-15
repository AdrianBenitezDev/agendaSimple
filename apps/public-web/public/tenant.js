import { publicSiteConfig } from "./site-config.js";

function sanitizeTenantId(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function resolvePublicTenantId() {
  const fixedTenantId = sanitizeTenantId(publicSiteConfig.fixedTenantId);

  if (fixedTenantId) {
    return fixedTenantId;
  }

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
