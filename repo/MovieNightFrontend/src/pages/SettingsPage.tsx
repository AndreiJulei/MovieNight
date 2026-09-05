import { useState, type FormEvent } from "react";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import AppShell from "../components/AppShell";
import type { CompanionCharacter } from "../components/PixelCompanion";
import type { BackgroundType } from "../components/AmbientBackground";
import EvilEye from "../components/EvilEye";
import GradientBlinds from "../components/GradientBlinds";
import CursorGrid from "../components/CursorGrid";

// Thumbnails for settings preview
import wickPreview from "../assets/wick-left-idle.png";
import pulpPreview from "../assets/pulp-idle.png";
import couragePreview from "../assets/courage-idle-0.png";

interface CharacterOption {
  id: CompanionCharacter;
  name: string;
  subtitle: string;
  tag: string;
  previewSrc?: string;
}

const CHARACTERS: CharacterOption[] = [
  {
    id: "wick",
    name: "John Wick",
    subtitle: "Precision aim, 3 directional poses & muzzle flash on click",
    tag: "Action",
    previewSrc: wickPreview,
  },
  {
    id: "pulp",
    name: "Pulp Fiction",
    subtitle: "Vincent Vega & Jules Winnfield, duo idle & duel gunfire on click",
    tag: "Crime",
    previewSrc: pulpPreview,
  },
  {
    id: "courage",
    name: "Courage the Dog",
    subtitle: "3-state slow idle loop, hover reaction & screaming panic on click",
    tag: "Animation",
    previewSrc: couragePreview,
  },
  {
    id: "sauron",
    name: "Sauron",
    subtitle: "The Great Eye of Mordor, procedural fire shader & pupil tracking",
    tag: "Fantasy",
  },
  {
    id: "none",
    name: "Disabled",
    subtitle: "Hide the companion from the screen",
    tag: "Off",
  },
];

interface BackgroundOption {
  id: BackgroundType;
  name: string;
  subtitle: string;
  tag: string;
}

const BACKGROUNDS: BackgroundOption[] = [
  {
    id: "grid",
    name: "Neon Cursor Grid",
    subtitle: "Dense matrix grid with real-time cursor line illumination & phosphor trail",
    tag: "Cyber",
  },
  {
    id: "blinds",
    name: "Gradient Blinds",
    subtitle: "Chromatic violet/pink blinds with interactive spotlight tracking",
    tag: "Atmospheric",
  },
  {
    id: "blank",
    name: "Pure Solid Black",
    subtitle: "Minimalist, distraction-free solid obsidian background",
    tag: "Minimal",
  },
];

export default function SettingsPage() {
  const store = useStore();
  const { navigate } = useRouter();
  const user = store.currentUser;

  const [selectedChar, setSelectedChar] = useState<CompanionCharacter>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("pixel_companion_char") as CompanionCharacter) ||
        "wick"
      );
    }
    return "wick";
  });

  const [selectedBg, setSelectedBg] = useState<BackgroundType>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("app_background_type") as BackgroundType) ||
        "grid"
      );
    }
    return "grid";
  });

  // Profile Form State
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Security Form State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityMsg, setSecurityMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSelectChar = (id: CompanionCharacter) => {
    setSelectedChar(id);
    localStorage.setItem("pixel_companion_char", id);
    window.dispatchEvent(new Event("companion_changed"));
  };

  const handleSelectBg = (id: BackgroundType) => {
    setSelectedBg(id);
    localStorage.setItem("app_background_type", id);
    window.dispatchEvent(new Event("background_changed"));
  };

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    const res = await store.changeDisplayName(displayName);
    if (res.ok) {
      setProfileMsg({ type: "success", text: "Display name updated successfully!" });
    } else {
      setProfileMsg({ type: "error", text: res.error || "Failed to update name." });
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSecurityMsg(null);
    if (newPassword !== confirmPassword) {
      setSecurityMsg({ type: "error", text: "New passwords do not match." });
      return;
    }
    const res = await store.changePassword(oldPassword, newPassword);
    if (res.ok) {
      setSecurityMsg({ type: "success", text: "Password changed successfully!" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setSecurityMsg({ type: "error", text: res.error || "Failed to update password." });
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[680px]">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Settings
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Configure your movie night preferences, profile, interactive companion, and background theme.
          </p>
        </div>

        {/* 1. Profile Information Section */}
        <section className="mb-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
          <h2 className="text-base font-semibold text-text-primary">Profile</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Update your public screen name and profile details.
          </p>

          <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Username
              </label>
              <input
                type="text"
                disabled
                value={user?.username || ""}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2 text-sm text-zinc-500 cursor-not-allowed"
              />
              <span className="mt-1 block text-[11px] text-zinc-600">Username cannot be changed.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your Display Name"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3.5 py-2 text-sm text-white placeholder-zinc-600 transition-colors focus:border-accent focus:outline-none"
              />
            </div>

            {profileMsg && (
              <p
                className={`text-xs font-medium ${
                  profileMsg.type === "success" ? "text-green-400" : "text-danger"
                }`}
              >
                {profileMsg.text}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-accent/90 active:scale-95"
              >
                Save Profile
              </button>
            </div>
          </form>
        </section>

        {/* 2. Security & Password Section */}
        <section className="mb-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
          <h2 className="text-base font-semibold text-text-primary">Security</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Change your account password.
          </p>

          <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Current Password
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Current Password"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3.5 py-2 text-sm text-white placeholder-zinc-600 transition-colors focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New Password"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3.5 py-2 text-sm text-white placeholder-zinc-600 transition-colors focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3.5 py-2 text-sm text-white placeholder-zinc-600 transition-colors focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {securityMsg && (
              <p
                className={`text-xs font-medium ${
                  securityMsg.type === "success" ? "text-green-400" : "text-danger"
                }`}
              >
                {securityMsg.text}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-accent/90 active:scale-95"
              >
                Change Password
              </button>
            </div>
          </form>
        </section>

        {/* 3. Ambient Background Theme Section */}
        <section className="mb-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Background Theme
              </h2>
              <p className="text-xs text-text-muted">
                Select your preferred ambient background visual effect.
              </p>
            </div>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
              Visuals
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {BACKGROUNDS.map((bg) => {
              const isSelected = selectedBg === bg.id;
              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => handleSelectBg(bg.id)}
                  className={`group relative flex flex-col justify-between rounded-lg border p-4 text-left transition-all ${
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Visual Preview Box */}
                  <div className="relative mb-3.5 h-20 w-full overflow-hidden rounded-md border border-white/5 bg-[#05070D]">
                    {bg.id === "grid" && (
                      <CursorGrid
                        cellSize={18}
                        color="#D946EF"
                        radius={45}
                        gridOpacity={0.12}
                        className="h-full w-full"
                      />
                    )}
                    {bg.id === "blinds" && (
                      <div className="h-full w-full opacity-70">
                        <GradientBlinds
                          gradientColors={["#FF9FFC", "#5227FF"]}
                          angle={20}
                          blindCount={8}
                          spotlightRadius={0.35}
                          className="h-full w-full"
                        />
                      </div>
                    )}
                    {bg.id === "blank" && (
                      <div className="flex h-full w-full items-center justify-center bg-[#05070D] text-[10px] text-zinc-600">
                        Obsidian
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-text-primary">
                        {bg.name}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted line-clamp-2 leading-relaxed">
                      {bg.subtitle}
                    </p>
                  </div>

                  {/* Active Radio Dot */}
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[10px] font-medium text-text-muted uppercase">
                      {bg.tag}
                    </span>
                    <div
                      className={`h-3 w-3 rounded-full border ${
                        isSelected
                          ? "border-accent bg-accent"
                          : "border-white/20 bg-transparent"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Pixel Companion Character Picker Section */}
        <section className="mb-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Pixel Companion
              </h2>
              <p className="text-xs text-text-muted">
                Select who guards your movie vault in the corner of your screen.
              </p>
            </div>
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400">
              Interactive
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CHARACTERS.map((char) => {
              const isSelected = selectedChar === char.id;
              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => handleSelectChar(char.id)}
                  className={`group relative flex items-center gap-4 rounded-lg border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-red-500 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                      : "border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Thumbnail / Icon */}
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/5 bg-black/50 p-1">
                    {char.id === "sauron" ? (
                      <div className="h-full w-full">
                        <EvilEye scale={0.75} intensity={1.8} />
                      </div>
                    ) : char.previewSrc ? (
                      <img
                        src={char.previewSrc}
                        alt={char.name}
                        className="pixelated h-full w-auto object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="text-xs text-text-muted">None</span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-text-primary">
                        {char.name}
                      </span>
                      <span className="text-[10px] font-medium text-text-muted uppercase">
                        {char.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted line-clamp-2 leading-relaxed">
                      {char.subtitle}
                    </p>
                  </div>

                  {/* Active Radio Dot */}
                  <div
                    className={`h-3 w-3 rounded-full border ${
                      isSelected
                        ? "border-red-400 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                        : "border-white/20 bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. Account / Session Section */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-base font-semibold text-text-primary">Account</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Manage your session and login state.
          </p>

          <div className="mt-5 flex items-center justify-between pt-4 border-t border-border">
            <div>
              <span className="text-sm font-medium text-text-primary">
                Log Out
              </span>
              <p className="text-xs text-text-muted">
                Return to the cinematic login screen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                store.logout();
                navigate("/login", { replace: true });
              }}
              className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10 hover:border-danger/30"
            >
              Log out
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
