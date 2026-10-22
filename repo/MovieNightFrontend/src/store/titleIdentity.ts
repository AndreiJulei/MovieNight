import type { MediaType } from "./data";

export function resourceType(category: string): "MOVIE" | "TV" {
  if (category === "MOVIE") return "MOVIE";
  if (category === "TV" || category === "ANIME") return "TV";
  throw new Error("Unknown title resource type. Reload the title and try again.");
}

export function titleId(providerId: number | undefined, category: string, catalogId?: number): string {
  if (providerId != null && (!Number.isSafeInteger(providerId) || providerId <= 0)) throw new Error("Invalid provider title ID.");
  if (catalogId != null && (!Number.isSafeInteger(catalogId) || catalogId <= 0)) throw new Error("Invalid catalog title ID.");
  if (providerId != null) return `${resourceType(category).toLowerCase()}:${providerId}`;
  if (catalogId != null) return `catalog:${catalogId}`;
  throw new Error("This title has no usable identity. Reload and try again.");
}

export function parseTitleId(id: string): { providerId?: number; catalogId?: number; category?: MediaType } {
  const match = /^(movie|tv|catalog):(\d+)$/.exec(id);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0) throw new Error("Open this title from discovery or your library to resolve its identity.");
  return match[1] === "catalog" ? { catalogId: Number(match[2]) }
    : { providerId: Number(match[2]), category: match[1] === "movie" ? "MOVIE" : "TV" };
}
