import type { CastMember } from "../store/data"

/**
 * Format runtime minutes into "Xh Ym" or "Ym".
 */
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m < 10 ? "0" + m : m}m`
}

/**
 * Extract 1-2 letter initials from actor's or user's name for fallback avatars.
 */
export function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * Parse comma-delimited cast strings (e.g. "Ewan McGregor as Mark Renton, Ewen Bremner as Spud")
 * while preserving already structured CastMember objects (with profileUrl and character).
 */
export function parseCastMembers(
  castMembersStr: string | null | undefined,
  existingCast?: CastMember[],
): CastMember[] {
  if (existingCast && existingCast.length > 0) {
    return existingCast.map((c) => {
      let name = c.name;
      let role = c.role || "Cast";
      if (role === "Cast" && name.includes(" as ")) {
        const [n, r] = name.split(" as ");
        name = n.trim();
        role = r.trim() || "Cast";
      }
      return {
        name,
        role,
        profileUrl: c.profileUrl ?? null,
      };
    });
  }

  if (!castMembersStr || !castMembersStr.trim()) return []

  return castMembersStr
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((item) => {
      // Check for "Name as Role" or "Name (Role)"
      if (item.includes(" as ")) {
        const [name, role] = item.split(" as ")
        return {
          name: name.trim(),
          role: role.trim() || "Cast",
          profileUrl: null,
        }
      }
      const match = item.match(/^(.*?)\s*\((.*?)\)$/)
      if (match) {
        return {
          name: match[1].trim(),
          role: match[2].trim() || "Cast",
          profileUrl: null,
        }
      }
      return {
        name: item,
        role: "Cast",
        profileUrl: null,
      }
    })
}

export interface MovieDetailPageState {
  isTrailerModalOpen: boolean;
  isSliderExpanded: boolean;
  rating: number | null;
  notes: string;
}

export function initialDetailPageState(
  initialRating?: number | null,
  initialNotes?: string,
): MovieDetailPageState {
  return {
    isTrailerModalOpen: false,
    isSliderExpanded: false,
    rating: initialRating ?? null,
    notes: initialNotes ?? "",
  };
}

export type DetailPageAction =
  | { type: "OPEN_TRAILER" }
  | { type: "CLOSE_TRAILER" }
  | { type: "TOGGLE_SLIDER"; rating?: number | null; notes?: string }
  | { type: "CLOSE_SLIDER" }
  | { type: "SET_RATING"; rating: number | null }
  | { type: "SET_NOTES"; notes: string };

export function detailPageReducer(
  state: MovieDetailPageState,
  action: DetailPageAction,
): MovieDetailPageState {
  switch (action.type) {
    case "OPEN_TRAILER":
      return { ...state, isTrailerModalOpen: true };
    case "CLOSE_TRAILER":
      return { ...state, isTrailerModalOpen: false };
    case "TOGGLE_SLIDER": {
      const willExpand = !state.isSliderExpanded;
      return {
        ...state,
        isSliderExpanded: willExpand,
        rating: willExpand && action.rating !== undefined ? action.rating : state.rating,
        notes: willExpand && action.notes !== undefined ? action.notes : state.notes,
      };
    }
    case "CLOSE_SLIDER":
      return { ...state, isSliderExpanded: false };
    case "SET_RATING":
      return { ...state, rating: action.rating };
    case "SET_NOTES":
      return { ...state, notes: action.notes };
    default:
      return state;
  }
}


