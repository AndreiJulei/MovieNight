import { accountRequest } from "./auth";

/** One emblem per rank; must match Progression.Rank on the backend (#32). */
export type RankEmblem = "popcorn" | "ticket" | "owl" | "film-reel" | "medal" | "notepad" | "directors-chair" | "star";

export interface ApiRank {
  key: string;
  label: string;
  emblem: RankEmblem;
  threshold: number;
}

export interface ApiAvatar {
  id: string;
  file: string;
  unlockLevel: number;
}

/** The owner's own progression; friends never receive this shape (#32). */
export interface ApiProgress {
  watchedCount: number;
  level: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  rank: ApiRank;
  nextRank: ApiRank | null;
  toNextRank: number;
  avatar: ApiAvatar | null;
  avatars: (ApiAvatar & { unlocked: boolean })[];
}

/** Avatar image files are static assets in public/avatars/. */
export const avatarSrc = (avatar: ApiAvatar) => `/avatars/${encodeURIComponent(avatar.file)}`;

async function profileRequest(path: string, method = "GET", body?: object): Promise<ApiProgress> {
  const res = await accountRequest<ApiProgress>(`/api/users${path}`, method, body, "Could not load your profile. Retry.");
  if (!res.ok) throw new Error(res.error);
  if (typeof res.value.level !== "number" || !res.value.rank) throw new Error("Could not confirm your progress. Retry.");
  return res.value;
}

export const profileApi = {
  getProgress: () => profileRequest("/me/progress"),
  /** Choose an avatar unlocked at the current level; null restores the default initial. */
  chooseAvatar: (avatar: string | null) =>
    profileRequest("/me/avatar", "PUT", { avatar }),
};
