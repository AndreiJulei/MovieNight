import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { authApi } from "../api/auth"
import { avatarSrc, profileApi, type ApiProgress } from "../api/profile"
import { setMyAvatar } from "../hooks/useMyAvatar"
import { useStore } from "../store/MovieStore"
import { useToast } from "./Toast"
import UserAvatar from "./UserAvatar"

type Feedback = { type: "success" | "error"; text: string } | null

const INPUT =
  "mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3.5 py-2 text-sm text-white placeholder-zinc-600 transition-colors focus:border-accent focus:outline-none"
const LABEL = "block text-xs font-semibold uppercase tracking-wider text-text-muted"
const SAVE =
  "rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-accent/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"

/** #31 Account: avatar, display name, username, email and password, each saved independently. */
export default function AccountSettings() {
  return (
    <section aria-labelledby="account-heading" className="mb-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
      <h2 id="account-heading" className="text-base font-semibold text-text-primary">Account</h2>
      <p className="mt-0.5 text-xs text-text-muted">Each change saves on its own and is confirmed by the server.</p>
      <div className="mt-6 divide-y divide-white/[0.06]">
        <AvatarPicker />
        <DisplayNameForm />
        <UsernameForm />
        <EmailForm />
        <PasswordForm />
      </div>
    </section>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </div>
  )
}

function Message({ feedback, id }: { feedback: Feedback; id?: string }) {
  if (!feedback) return null
  return (
    <p id={id} role={feedback.type === "error" ? "alert" : "status"} className={`text-xs font-medium ${feedback.type === "success" ? "text-green-400" : "text-danger"}`}>
      {feedback.text}
    </p>
  )
}

function AvatarPicker() {
  const { currentUser } = useStore()
  const { toast } = useToast()
  const [progress, setProgress] = useState<ApiProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    profileApi.getProgress()
      .then((next) => { if (active) setProgress(next) })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load avatars.") })
    return () => { active = false }
  }, [])

  const choose = async (id: string | null) => {
    if (!currentUser) return
    setSaving(true)
    try {
      const next = await profileApi.chooseAvatar(id)
      setProgress(next)
      setMyAvatar(currentUser.id, next.avatar)
      toast({ message: id ? "Avatar updated" : "Avatar reset to your initial", type: "success" })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Could not change your avatar. Retry.", type: "error" })
    } finally {
      setSaving(false)
    }
  }

  const selectedId = progress?.avatar?.id ?? null
  return (
    <Block title="Avatar">
      <p className="mt-0.5 text-xs text-text-muted">
        {progress ? `Level ${progress.level}. Watch more titles to unlock more avatars.` : "Unlock avatars as you level up."}
      </p>
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      {progress && (
        <div role="radiogroup" aria-label="Avatar" className="mt-4 flex flex-wrap gap-3">
          <AvatarOption
            label="Your initial (default)"
            checked={selectedId === null}
            disabled={saving}
            onChoose={() => void choose(null)}
          >
            <UserAvatar displayName={currentUser?.displayName} username={currentUser?.username} size="md" />
          </AvatarOption>
          {progress.avatars.map((avatar) => (
            <AvatarOption
              key={avatar.id}
              label={avatar.unlocked ? avatar.id.replace(/-/g, " ") : `Unlocks at level ${avatar.unlockLevel}`}
              checked={selectedId === avatar.id}
              disabled={!avatar.unlocked || saving}
              locked={!avatar.unlocked}
              lockLevel={avatar.unlockLevel}
              onChoose={() => void choose(avatar.id)}
            >
              <img src={avatarSrc(avatar)} alt="" className="h-12 w-12 rounded-full object-cover" />
            </AvatarOption>
          ))}
        </div>
      )}
    </Block>
  )
}

function AvatarOption({
  label, checked, disabled, locked = false, lockLevel, onChoose, children,
}: {
  label: string
  checked: boolean
  disabled: boolean
  locked?: boolean
  lockLevel?: number
  onChoose: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChoose}
      className={`relative rounded-full p-0.5 transition-all ${checked ? "ring-2 ring-accent" : "ring-1 ring-white/10 hover:ring-white/30"} ${locked ? "cursor-not-allowed" : "disabled:opacity-60"}`}
    >
      <span className={locked ? "block opacity-30 grayscale" : "block"}>{children}</span>
      {locked && (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">Lv {lockLevel}</span>
      )}
    </button>
  )
}

function DisplayNameForm() {
  const store = useStore()
  const [value, setValue] = useState(store.currentUser?.displayName ?? "")
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [saving, setSaving] = useState(false)
  const trimmed = value.trim()
  const invalid = trimmed.length < 1 || trimmed.length > 50

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (invalid) return setFeedback({ type: "error", text: "Display name must be 1–50 characters." })
    setSaving(true)
    setFeedback(null)
    const res = await store.changeDisplayName(trimmed)
    setSaving(false)
    setFeedback(res.ok ? { type: "success", text: "Display name saved." } : { type: "error", text: res.error || "Could not save your display name." })
  }

  return (
    <Block title="Display name">
      <form onSubmit={submit} className="mt-3 space-y-3">
        <label htmlFor="settings-display-name" className={LABEL}>Display name</label>
        <input id="settings-display-name" type="text" maxLength={50} value={value} onChange={(e) => setValue(e.target.value)} className={INPUT} />
        <div className="flex items-center justify-between gap-3">
          <Message feedback={feedback} />
          <button type="submit" disabled={saving || trimmed === store.currentUser?.displayName} className={`${SAVE} ml-auto`}>
            {saving ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
    </Block>
  )
}

type Availability = "idle" | "checking" | "available" | "taken" | "error"

function UsernameForm() {
  const store = useStore()
  const current = store.currentUser?.username ?? ""
  const [value, setValue] = useState(current)
  const [availability, setAvailability] = useState<{ state: Availability; message?: string }>({ state: "idle" })
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [saving, setSaving] = useState(false)
  const trimmed = value.trim()
  const unchanged = trimmed === current

  // Live uniqueness check, reusing the signup availability endpoint (#31).
  useEffect(() => {
    if (!trimmed || unchanged) { setAvailability({ state: "idle" }); return }
    const controller = new AbortController()
    setAvailability({ state: "checking" })
    const timer = window.setTimeout(() => {
      authApi.checkUsername(trimmed, controller.signal)
        .then((res) => setAvailability({ state: res.available ? "available" : "taken", message: res.message }))
        .catch((err) => { if (!controller.signal.aborted) setAvailability({ state: "error", message: err instanceof Error ? err.message : undefined }) })
    }, 400)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [trimmed, unchanged])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (unchanged || availability.state === "taken") return
    setSaving(true)
    setFeedback(null)
    const res = await store.changeUsername(trimmed)
    setSaving(false)
    if (res.ok) {
      setAvailability({ state: "idle" })
      setFeedback({ type: "success", text: "Username saved. Sign in with it from now on." })
    } else {
      setFeedback({ type: "error", text: res.error || "Could not save your username." })
    }
  }

  const hint =
    availability.state === "checking" ? { cls: "text-text-muted", text: "Checking…" }
    : availability.state === "available" ? { cls: "text-green-400", text: availability.message || "Username is available" }
    : availability.state === "taken" ? { cls: "text-danger", text: availability.message || "That username is already taken." }
    : availability.state === "error" ? { cls: "text-warning", text: availability.message || "Could not check right now; saving will still verify it." }
    : null

  return (
    <Block title="Username">
      <form onSubmit={submit} className="mt-3 space-y-3">
        <label htmlFor="settings-username" className={LABEL}>Username</label>
        <input
          id="settings-username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={50}
          value={value}
          onChange={(e) => { setValue(e.target.value); setFeedback(null) }}
          aria-describedby="settings-username-hint"
          className={INPUT}
        />
        <p id="settings-username-hint" aria-live="polite" className={`text-[11px] ${hint?.cls ?? "text-zinc-500"}`}>
          {hint?.text ?? "Friends see your username. Letters, numbers, dots, dashes and underscores."}
        </p>
        <div className="flex items-center justify-between gap-3">
          <Message feedback={feedback} />
          <button type="submit" disabled={saving || unchanged || !trimmed || availability.state === "taken" || availability.state === "checking"} className={`${SAVE} ml-auto`}>
            {saving ? "Saving…" : "Save username"}
          </button>
        </div>
      </form>
    </Block>
  )
}

function EmailForm() {
  const store = useStore()
  const [email, setEmail] = useState(store.currentUser?.email ?? "")
  const [password, setPassword] = useState("")
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [saving, setSaving] = useState(false)
  const unchanged = email.trim().toLowerCase() === (store.currentUser?.email ?? "").toLowerCase()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setFeedback({ type: "error", text: "Enter your current password to change your email." })
    setSaving(true)
    setFeedback(null)
    const res = await store.changeEmail(email, password)
    setSaving(false)
    if (res.ok) {
      setPassword("")
      setFeedback({ type: "success", text: "Email saved. Sign in with it from now on." })
    } else {
      setFeedback({ type: "error", text: res.error || "Could not save your email." })
    }
  }

  return (
    <Block title="Email">
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-email" className={LABEL}>New email</label>
            <input id="settings-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label htmlFor="settings-email-password" className={LABEL}>Current password</label>
            <input id="settings-email-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Message feedback={feedback} />
          <button type="submit" disabled={saving || unchanged || !email.trim()} className={`${SAVE} ml-auto`}>
            {saving ? "Saving…" : "Save email"}
          </button>
        </div>
      </form>
    </Block>
  )
}

function PasswordForm() {
  const store = useStore()
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) return setFeedback({ type: "error", text: "New passwords do not match." })
    setSaving(true)
    setFeedback(null)
    const res = await store.changePassword(oldPassword, newPassword)
    setSaving(false)
    if (res.ok) {
      setOldPassword(""); setNewPassword(""); setConfirmPassword("")
      setFeedback({ type: "success", text: "Password changed." })
    } else {
      setFeedback({ type: "error", text: res.error || "Could not change your password." })
    }
  }

  return (
    <Block title="Password">
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div>
          <label htmlFor="settings-current-password" className={LABEL}>Current password</label>
          <input id="settings-current-password" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={INPUT} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-new-password" className={LABEL}>New password</label>
            <input id="settings-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label htmlFor="settings-confirm-password" className={LABEL}>Confirm new password</label>
            <input id="settings-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={INPUT} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Message feedback={feedback} />
          <button type="submit" disabled={saving || !oldPassword || !newPassword} className={`${SAVE} ml-auto`}>
            {saving ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </Block>
  )
}
