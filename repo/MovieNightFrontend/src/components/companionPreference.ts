export type CompanionCharacter = "wick" | "pulp" | "courage" | "sauron" | "none";

const COMPANION_STORAGE_KEY = "pixel_companion_char";
export const COMPANION_CHANGED_EVENT = "companion_changed";

const CHOICES: readonly CompanionCharacter[] = ["wick", "pulp", "courage", "sauron", "none"];

/** The stored companion choice; without an explicit valid choice there is no companion. */
export function readCompanionChoice(
  storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage,
): CompanionCharacter {
  try {
    const saved = storage?.getItem(COMPANION_STORAGE_KEY);
    return CHOICES.includes(saved as CompanionCharacter) ? (saved as CompanionCharacter) : "none";
  } catch {
    return "none";
  }
}

/** Persist an explicit companion choice and notify mounted listeners. */
export function saveCompanionChoice(choice: CompanionCharacter) {
  try {
    window.localStorage.setItem(COMPANION_STORAGE_KEY, choice);
  } catch {
    // The choice still applies for this page view when storage is unavailable.
  }
  window.dispatchEvent(new Event(COMPANION_CHANGED_EVENT));
}

/** The companion appears only on desktop layouts, outside sign-in, once chosen. */
export function isCompanionShown({ choice, compact, path }: { choice: CompanionCharacter; compact: boolean; path: string }) {
  return choice !== "none" && !compact && path !== "/login";
}
