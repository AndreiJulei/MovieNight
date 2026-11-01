/**
 * Pure URL and routing utility functions for MovieNight.
 * Extracted for unit testing and safe route validation.
 */

export function safeInternalUrl(
  value: string | null | undefined,
  baseOrigin?: string,
): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x1f]/.test(value)
  ) {
    return null;
  }
  try {
    const origin =
      baseOrigin ??
      (typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost");
    const url = new URL(value, origin);
    return url.origin === origin
      ? url.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}

export function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    if (patternSegments[i].startsWith(":")) {
      try {
        params[patternSegments[i].slice(1)] = decodeURIComponent(pathSegments[i]);
      } catch {
        return null;
      }
    } else if (patternSegments[i] !== pathSegments[i]) {
      return null;
    }
  }
  return params;
}

