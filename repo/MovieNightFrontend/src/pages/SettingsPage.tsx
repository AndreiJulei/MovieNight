import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { useToast } from "../components/Toast";
import AppShell from "../components/AppShell";
import type { CompanionCharacter } from "../components/PixelCompanion";
import type { BackgroundType } from "../components/AmbientBackground";
import EvilEye from "../components/EvilEye";
import GradientBlinds from "../components/GradientBlinds";
import CursorGrid from "../components/CursorGrid";
import {
  webhooksApi,
  type ApiWebhookSubscriptionResponse,
  type ApiWebhookDeliveryLogResponse,
  type ApiTestWebhookResponse,
} from "../api/webhooks";

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
  const { toast } = useToast();
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
    const charName = CHARACTERS.find((c) => c.id === id)?.name ?? id;
    toast({ message: `Companion changed to ${charName}`, type: "info" });
  };

  const handleSelectBg = (id: BackgroundType) => {
    setSelectedBg(id);
    localStorage.setItem("app_background_type", id);
    window.dispatchEvent(new Event("background_changed"));
    toast({ message: "Background theme updated", type: "info" });
  };

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    const res = await store.changeDisplayName(displayName);
    if (res.ok) {
      setProfileMsg({ type: "success", text: "Display name updated successfully!" });
      toast({ message: "Profile display name updated", type: "success" });
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
      toast({ message: "Password changed successfully", type: "success" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setSecurityMsg({ type: "error", text: res.error || "Failed to update password." });
    }
  };

  // Webhooks State
  const [subscriptions, setSubscriptions] = useState<ApiWebhookSubscriptionResponse[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);

  // New Subscription Form
  const [newTargetUrl, setNewTargetUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newEvents, setNewEvents] = useState("*");
  const [isSubmittingWebhook, setIsSubmittingWebhook] = useState(false);

  // Testing Webhook State
  const [testingSubId, setTestingSubId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    subId: number;
    success: boolean;
    message: string;
    responseStatus?: number;
    durationMs?: number;
  } | null>(null);

  // Delivery Logs State
  const [selectedSubForLogs, setSelectedSubForLogs] = useState<ApiWebhookSubscriptionResponse | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<ApiWebhookDeliveryLogResponse[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Incoming ML Sync Webhook State
  const [mlSyncSecret, setMlSyncSecret] = useState("movienight_internal_ml_secret");
  const [isTriggeringMlSync, setIsTriggeringMlSync] = useState(false);
  const [mlSyncResult, setMlSyncResult] = useState<{ success: boolean; message: string; pairsCount?: number } | null>(null);

  const fetchSubscriptions = async () => {
    setIsLoadingWebhooks(true);
    try {
      const data = await webhooksApi.getSubscriptions();
      setSubscriptions(data);
    } catch {
      // ignore
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSubscriptions();
    }
  }, [user]);

  const handleCreateWebhook = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTargetUrl.trim()) return;
    setIsSubmittingWebhook(true);
    try {
      const created = await webhooksApi.createSubscription({
        targetUrl: newTargetUrl.trim(),
        secret: newSecret.trim() || undefined,
        description: newDescription.trim() || undefined,
        events: newEvents.trim() || "*",
      });
      if (created) {
        toast({ message: "Webhook subscription registered!", type: "success" });
        setSubscriptions((prev) => [created, ...prev]);
        setNewTargetUrl("");
        setNewSecret("");
        setNewDescription("");
        setNewEvents("*");
        setShowAddWebhook(false);
      } else {
        toast({ message: "Failed to register webhook subscription", type: "error" });
      }
    } finally {
      setIsSubmittingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: number) => {
    const success = await webhooksApi.deleteSubscription(id);
    if (success) {
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSubForLogs?.id === id) {
        setSelectedSubForLogs(null);
        setDeliveryLogs([]);
      }
      toast({ message: "Webhook subscription deleted", type: "info" });
    } else {
      toast({ message: "Failed to delete webhook", type: "error" });
    }
  };

  const handleToggleActive = async (sub: ApiWebhookSubscriptionResponse) => {
    const updated = await webhooksApi.updateSubscription(sub.id, {
      isActive: !sub.isActive,
    });
    if (updated) {
      setSubscriptions((prev) => prev.map((s) => (s.id === sub.id ? updated : s)));
      toast({
        message: updated.isActive ? "Webhook activated" : "Webhook deactivated",
        type: "info",
      });
    }
  };

  const handleTestWebhook = async (id: number) => {
    setTestingSubId(id);
    setTestResult(null);
    try {
      const res = await webhooksApi.testSubscription(id);
      if (res) {
        setTestResult({
          subId: id,
          success: res.success,
          message: res.message,
          responseStatus: res.responseStatus,
          durationMs: res.durationMs,
        });
        toast({
          message: res.success
            ? `Test ping delivered (${res.durationMs ?? 0}ms)`
            : `Test ping failed: ${res.message}`,
          type: res.success ? "success" : "error",
        });
        fetchSubscriptions();
      } else {
        toast({ message: "Test ping request failed", type: "error" });
      }
    } finally {
      setTestingSubId(null);
    }
  };

  const handleOpenLogs = async (sub: ApiWebhookSubscriptionResponse) => {
    setSelectedSubForLogs(sub);
    setIsLoadingLogs(true);
    try {
      const logs = await webhooksApi.getDeliveryLogs(sub.id);
      setDeliveryLogs(logs);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleTriggerMlSync = async () => {
    setIsTriggeringMlSync(true);
    setMlSyncResult(null);
    try {
      const res = await webhooksApi.triggerMlSync(mlSyncSecret);
      setMlSyncResult(res);
      toast({
        message: res.success
          ? `ML sync succeeded: ${res.message}`
          : `ML sync failed: ${res.message}`,
        type: res.success ? "success" : "error",
      });
    } finally {
      setIsTriggeringMlSync(false);
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
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
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
                      ? "border-accent bg-accent/10 shadow-[0_0_20px_rgba(79,70,229,0.25)]"
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
                        ? "border-accent bg-accent shadow-[0_0_8px_rgba(79,70,229,0.8)]"
                        : "border-white/20 bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. Webhooks & Integrations Section */}
        <section className="mb-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Webhooks & Real-time Integrations
              </h2>
              <p className="text-xs text-text-muted">
                Dispatch signed domain events to external URLs or trigger incoming ML model similarity reloads.
              </p>
            </div>
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-400">
              Developer API
            </span>
          </div>

          {/* Outgoing Webhooks Sub-section */}
          <div className="mb-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Outgoing Webhooks
                </h3>
                <p className="text-[11px] text-text-muted">
                  Payloads are signed with HMAC-SHA256 (<code className="rounded bg-black/50 px-1 py-0.5 text-accent">X-MovieNight-Signature</code>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddWebhook((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-accent/25 active:scale-95"
              >
                {showAddWebhook ? "Cancel" : "+ Register Webhook"}
              </button>
            </div>

            {/* Register Webhook Form */}
            {showAddWebhook && (
              <form
                onSubmit={handleCreateWebhook}
                className="mt-4 rounded-xl border border-accent/20 bg-black/40 p-4 space-y-3.5 transition-all"
              >
                <div className="text-xs font-semibold text-white">Register New Webhook Endpoint</div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Target URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={newTargetUrl}
                    onChange={(e) => setNewTargetUrl(e.target.value)}
                    placeholder="https://webhook.site/uuid or https://api.myserver.com/events"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      HMAC Secret (Optional)
                    </label>
                    <input
                      type="text"
                      value={newSecret}
                      onChange={(e) => setNewSecret(e.target.value)}
                      placeholder="Autogenerated 64-char key if blank"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="e.g. Discord alerts, home automation"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      Subscribed Events Filter
                    </label>
                    <div className="flex gap-1.5">
                      {[
                        { label: "All (*)", val: "*" },
                        { label: "Movies", val: "movie.*" },
                        { label: "Lists", val: "list.*" },
                        { label: "Friends", val: "friend.*" },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setNewEvents(preset.val)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            newEvents === preset.val
                              ? "bg-accent text-white"
                              : "bg-white/10 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={newEvents}
                    onChange={(e) => setNewEvents(e.target.value)}
                    placeholder="e.g. * or movie.added, movie.deleted, list.*"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-accent focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] text-zinc-500">
                    Supports exact names (<code className="text-zinc-400">movie.added</code>), wildcards (<code className="text-zinc-400">movie.*</code>), or all events (<code className="text-zinc-400">*</code>).
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddWebhook(false)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingWebhook}
                    className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-50"
                  >
                    {isSubmittingWebhook ? "Saving..." : "Save Endpoint"}
                  </button>
                </div>
              </form>
            )}

            {/* Subscriptions List */}
            <div className="mt-4 space-y-3">
              {isLoadingWebhooks ? (
                <div className="rounded-lg border border-white/5 bg-black/20 p-4 text-center text-xs text-zinc-500">
                  Loading webhook subscriptions...
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-5 text-center">
                  <p className="text-xs text-text-muted">
                    No webhooks registered. Click <strong>+ Register Webhook</strong> above to send domain events to your backend or automation services.
                  </p>
                </div>
              ) : (
                subscriptions.map((sub) => {
                  const isTesting = testingSubId === sub.id;
                  const hasTestResult = testResult && testResult.subId === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className="group rounded-lg border border-white/10 bg-black/30 p-4 transition-all hover:border-white/20 hover:bg-white/[0.03]"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                sub.isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-zinc-600"
                              }`}
                            />
                            <span className="truncate font-mono text-xs font-medium text-white">
                              {sub.targetUrl}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                sub.isActive
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                              }`}
                            >
                              {sub.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>

                          {sub.description && (
                            <p className="mt-1 text-xs text-text-muted">
                              {sub.description}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <span className="rounded bg-white/5 px-2 py-0.5 text-zinc-400">
                              Events: <strong className="text-white">{sub.events}</strong>
                            </span>

                            {sub.lastDeliveryStatus !== null && sub.lastDeliveryStatus !== undefined && (
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                                  sub.lastDeliveryStatus >= 200 && sub.lastDeliveryStatus < 300
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                Last Status: {sub.lastDeliveryStatus}
                              </span>
                            )}

                            {sub.consecutiveFailures > 0 && (
                              <span className="rounded bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
                                {sub.consecutiveFailures} consecutive failure{sub.consecutiveFailures > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Subscription Action Buttons */}
                        <div className="flex shrink-0 items-center gap-1.5 pt-2 sm:pt-0">
                          <button
                            type="button"
                            disabled={isTesting}
                            onClick={() => handleTestWebhook(sub.id)}
                            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-95 disabled:opacity-50"
                            title="Send immediate ping payload to endpoint"
                          >
                            {isTesting ? "Pinging..." : "Test Ping"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenLogs(sub)}
                            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-95"
                            title="View delivery audit logs"
                          >
                            Logs
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(sub)}
                            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-400 transition-all hover:bg-white/10 hover:text-white active:scale-95"
                          >
                            {sub.isActive ? "Pause" : "Enable"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteWebhook(sub.id)}
                            className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-400 transition-all hover:bg-rose-500/20 active:scale-95"
                            title="Delete webhook subscription"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Inline Ping Result Feedback */}
                      {hasTestResult && (
                        <div
                          className={`mt-3 rounded-lg border p-2.5 text-xs ${
                            testResult.success
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              {testResult.success ? "Ping Delivered Successfully" : "Ping Delivery Failed"}
                            </span>
                            {testResult.durationMs !== undefined && (
                              <span className="font-mono text-[11px] opacity-80">
                                {testResult.durationMs}ms
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] opacity-90">{testResult.message}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Incoming ML Sync Webhook Sub-section */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Incoming ML Similarity Webhook
                </h3>
                <p className="text-[11px] text-text-muted">
                  External Python training jobs trigger this endpoint to reload <code className="text-zinc-400">movie_similarities.csv</code> and recompute user recommendations live without restarting the server.
                </p>
              </div>
              <span className="rounded bg-accent/10 border border-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                POST
              </span>
            </div>

            <div className="mt-3 rounded-lg bg-black/60 p-3 font-mono text-[11px] text-zinc-300 border border-white/5 space-y-1">
              <div>
                <span className="text-purple-400">URL:</span> /api/webhooks/incoming/ml-sync
              </div>
              <div>
                <span className="text-purple-400">Header:</span> X-MovieNight-Secret: &lt;secret&gt;
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <input
                  type="text"
                  value={mlSyncSecret}
                  onChange={(e) => setMlSyncSecret(e.target.value)}
                  placeholder="Enter X-MovieNight-Secret"
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-accent focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isTriggeringMlSync}
                onClick={handleTriggerMlSync}
                className="shrink-0 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-accent/90 active:scale-95 disabled:opacity-50"
              >
                {isTriggeringMlSync ? "Syncing ML Matrix..." : "Trigger ML Sync Now"}
              </button>
            </div>

            {mlSyncResult && (
              <div
                className={`mt-3 rounded-lg border p-2.5 text-xs ${
                  mlSyncResult.success
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}
              >
                <div className="font-semibold">{mlSyncResult.message}</div>
                {mlSyncResult.pairsCount !== undefined && (
                  <div className="mt-0.5 text-[11px] opacity-80">
                    Similarity pairs loaded: {mlSyncResult.pairsCount}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Webhook Delivery Logs Modal */}
        {selectedSubForLogs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-white/15 bg-[#0b0e17] shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Webhook Delivery Audit Logs
                  </h3>
                  <p className="font-mono text-xs text-zinc-400 truncate max-w-md">
                    {selectedSubForLogs.targetUrl}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSubForLogs(null)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingLogs ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    Loading delivery audit logs...
                  </div>
                ) : deliveryLogs.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    No delivery events logged yet for this webhook endpoint.
                  </div>
                ) : (
                  deliveryLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                              log.success
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            HTTP {log.responseStatus || "ERR"}
                          </span>
                          <span className="font-mono text-zinc-300 font-semibold">
                            {log.eventType}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <span>{log.durationMs}ms</span>
                          <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {log.payload && (
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-zinc-500">
                            Payload
                          </div>
                          <pre className="mt-1 overflow-x-auto rounded bg-black/60 p-2 font-mono text-[11px] text-zinc-300 max-h-28">
                            {log.payload}
                          </pre>
                        </div>
                      )}

                      {log.responseBody && (
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-zinc-500">
                            Response
                          </div>
                          <pre className="mt-1 overflow-x-auto rounded bg-black/60 p-2 font-mono text-[11px] text-zinc-400 max-h-20">
                            {log.responseBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-between border-t border-white/10 p-3">
                <button
                  type="button"
                  onClick={() => handleOpenLogs(selectedSubForLogs)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  Refresh Logs
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSubForLogs(null)}
                  className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. Account / Session Section */}
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
