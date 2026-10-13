import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import CinematicScene from "../components/login/CinematicScene";
import { authApi } from "../api/auth";

type ViewMode = "login" | "signup" | "forgot";
type NameState = "idle" | "checking" | "available" | "taken" | "empty";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function LoginPage() {
  const { login, signup, checkName } = useStore();
  const { navigate } = useRouter();

  // Mode: login, signup, or forgot
  const [mode, setMode] = useState<ViewMode>("login");

  // Login inputs
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Signup inputs
  const [signupEmail, setSignupEmail] = useState("");
  const [signupUser, setSignupUser] = useState("");
  const [signupPass, setSignupPass] = useState("");
  const [signupConfirmPass, setSignupConfirmPass] = useState("");

  // Forgot password inputs & steps
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [forgotConfirmPass, setForgotConfirmPass] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [nameState, setNameState] = useState<NameState>("idle");
  const [submitting, setSubmitting] = useState(false);

  // Success transition: idle -> fading (CinematicScene runs its full sequence)
  const [fading, setFading] = useState(false);

  const runSuccess = () => {
    if (prefersReduced()) {
      navigate("/", { replace: true });
      return;
    }
    setFading(true);
  };

  const handleSequenceFinished = () => {
    navigate("/", { replace: true });
  };

  const validateUsername = async () => {
    const trimmed = signupUser.trim();
    if (!trimmed) {
      setNameState("empty");
      return;
    }
    setNameState("checking");
    const ok = await checkName(trimmed);
    setNameState(ok ? "available" : "taken");
  };

  // --- Handlers ---

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailTrimmed = loginEmail.trim();
    if (!emailTrimmed) {
      return setError("Please enter your email.");
    }
    if (!loginPass) {
      return setError("Please enter your password.");
    }

    setSubmitting(true);
    const res = await login(emailTrimmed, loginPass);
    setSubmitting(false);

    if (!res.ok) {
      return setError(res.error ?? "Invalid email or password.");
    }
    runSuccess();
  };

  const handleSignupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailTrimmed = signupEmail.trim();
    const userTrimmed = signupUser.trim();

    if (!emailTrimmed) {
      return setError("Email address is required.");
    }
    if (!EMAIL_REGEX.test(emailTrimmed)) {
      return setError("Please enter a valid email address (e.g. alex@example.com).");
    }
    if (!userTrimmed) {
      return setError("Please choose a username for your friends to see.");
    }
    if (userTrimmed.length < 3) {
      return setError("Username must be at least 3 characters.");
    }
    if (nameState === "taken") {
      return setError("That username is already taken. Please pick another.");
    }
    if (signupPass.length < 6) {
      return setError("Password must be at least 6 characters.");
    }
    if (signupPass !== signupConfirmPass) {
      return setError("Passwords do not match. Please re-enter them.");
    }

    setSubmitting(true);
    const res = await signup({
      email: emailTrimmed,
      username: userTrimmed,
      displayName: userTrimmed,
      password: signupPass,
      confirmPassword: signupConfirmPass,
    });
    setSubmitting(false);

    if (!res.ok) {
      return setError(res.error ?? "Unable to create account.");
    }
    runSuccess();
  };

  const handleSendResetCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotSuccess(null);
    setDevCode(null);

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      return setError("Please enter your registered email address.");
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      return setError("Please enter a valid email format.");
    }

    setForgotLoading(true);
    const res = await authApi.forgotPassword(trimmed);
    setForgotLoading(false);

    if (!res.ok) {
      return setError(res.error ?? "Failed to send reset code.");
    }

    setForgotStep(2);
    setForgotSuccess(res.message || "A 6-digit code has been generated.");
    if (res.devCode) {
      setDevCode(res.devCode);
    }
  };

  const handleResetPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotSuccess(null);

    const codeTrimmed = forgotCode.trim();
    if (!codeTrimmed || codeTrimmed.length < 6) {
      return setError("Please enter the 6-digit verification code.");
    }
    if (forgotNewPass.length < 6) {
      return setError("New password must be at least 6 characters.");
    }
    if (forgotNewPass !== forgotConfirmPass) {
      return setError("Passwords do not match.");
    }

    setForgotLoading(true);
    const res = await authApi.resetPassword({
      email: forgotEmail.trim(),
      code: codeTrimmed,
      newPassword: forgotNewPass,
      confirmPassword: forgotConfirmPass,
    });
    setForgotLoading(false);

    if (!res.ok) {
      return setError(res.error ?? "Failed to reset password.");
    }

    setForgotSuccess("Password updated successfully! You can now sign in.");
    setTimeout(() => {
      setMode("login");
      setLoginEmail(forgotEmail);
      setForgotStep(1);
      setForgotCode("");
      setForgotNewPass("");
      setForgotConfirmPass("");
      setError(null);
    }, 1800);
  };

  const usernameFeedback = () => {
    switch (nameState) {
      case "empty":
        return <Hint tone="error">Username cannot be empty.</Hint>;
      case "taken":
        return <Hint tone="error">Username is already taken.</Hint>;
      case "checking":
        return <Hint tone="muted">Checking availability…</Hint>;
      case "available":
        return <Hint tone="accent">✓ Username available</Hint>;
      default:
        return null;
    }
  };

  const passwordMatchFeedback = () => {
    if (!signupConfirmPass) return null;
    if (signupPass === signupConfirmPass) {
      return <span className="text-[11px] text-emerald-400 font-medium">✓ Passwords match</span>;
    }
    return <span className="text-[11px] text-rose-400 font-medium">✕ Passwords do not match</span>;
  };

  const resetPasswordMatchFeedback = () => {
    if (!forgotConfirmPass) return null;
    if (forgotNewPass === forgotConfirmPass) {
      return <span className="text-[11px] text-emerald-400 font-medium">✓ Passwords match</span>;
    }
    return <span className="text-[11px] text-rose-400 font-medium">✕ Passwords do not match</span>;
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-end overflow-hidden bg-[#05070D]">
      {/* Fullscreen Atmospheric Ambient Video Background */}
      <CinematicScene fading={fading} onFinished={handleSequenceFinished} />

      {/* Main Form Container */}
      <div
        className={`relative z-20 flex w-full justify-end px-6 py-12 md:pr-16 lg:pr-24 xl:pr-32 transition-opacity duration-700 ${
          fading ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{ perspective: "1400px" }}
      >
        <div className="relative w-full max-w-[420px]">
          {/* ==================== FORGOT PASSWORD VIEW ==================== */}
          {mode === "forgot" ? (
            <div className="w-full rounded-2xl bg-black/60 border border-white/10 p-6 sm:p-8 backdrop-blur-xl shadow-2xl transition-all duration-300">
              <div className="mb-6 flex flex-col items-center text-center">
                <div className="mb-2 flex items-baseline justify-center gap-1.5 text-3xl font-black tracking-tight text-white drop-shadow-md">
                  <span>Movie</span>
                  <span className="text-accent">Night</span>
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-white/95">
                  Reset Password
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  {forgotStep === 1
                    ? "Enter your email to receive a 6-digit verification code."
                    : `Enter the 6-digit code sent to ${forgotEmail}.`}
                </p>
              </div>

              {/* Success / Dev Code Banner */}
              {forgotSuccess && (
                <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs text-emerald-300">
                  {forgotSuccess}
                </div>
              )}

              {devCode && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-center text-xs text-amber-300">
                  <span className="font-semibold">Verification Code:</span>{" "}
                  <span className="font-mono text-sm tracking-widest text-amber-200">
                    {devCode}
                  </span>
                </div>
              )}

              {forgotStep === 1 ? (
                /* Step 1: Request Code */
                <form onSubmit={handleSendResetCode} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Your Account Email
                    </label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="alex@example.com"
                      autoCapitalize="none"
                      autoComplete="email"
                      className={input3dCls}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className={btn3dCls}
                  >
                    {forgotLoading ? "Sending Code…" : "Send Reset Code"}
                  </button>

                  {error && (
                    <p className="text-center text-xs font-semibold text-rose-400">
                      {error}
                    </p>
                  )}

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setError(null);
                        setForgotSuccess(null);
                      }}
                      className="text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </form>
              ) : (
                /* Step 2: Code + New Password */
                <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      6-Digit Verification Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={forgotCode}
                      onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className={`${input3dCls} tracking-widest text-center font-mono text-lg`}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={forgotNewPass}
                      onChange={(e) => setForgotNewPass(e.target.value)}
                      placeholder="At least 6 characters"
                      className={input3dCls}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={forgotConfirmPass}
                      onChange={(e) => setForgotConfirmPass(e.target.value)}
                      placeholder="Re-enter new password"
                      className={input3dCls}
                      required
                    />
                    <div className="mt-1">{resetPasswordMatchFeedback()}</div>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className={btn3dCls}
                  >
                    {forgotLoading ? "Updating Password…" : "Update Password"}
                  </button>

                  {error && (
                    <p className="text-center text-xs font-semibold text-rose-400">
                      {error}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep(1);
                        setError(null);
                      }}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      ← Change Email
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setError(null);
                        setForgotSuccess(null);
                      }}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* ==================== 3D FLIP CONTAINER: LOGIN / SIGNUP ==================== */
            <div
              className="relative w-full transition-transform duration-700 ease-in-out"
              style={{
                transformStyle: "preserve-3d",
                transform: mode === "signup" ? "rotateY(-180deg)" : "rotateY(0deg)",
              }}
            >
              {/* FRONT FACE: LOGIN */}
              <div
                className="w-full rounded-2xl bg-black/50 border border-white/10 p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                {/* Wordmark Logo */}
                <div className="mb-7 flex flex-col items-center text-center">
                  <div className="mb-2 flex items-baseline justify-center gap-1.5 text-3xl font-black tracking-tight text-white drop-shadow-md">
                    <span>Movie</span>
                    <span className="text-accent">Night</span>
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight text-white/95">Sign In</h2>
                  <p className="mt-1 text-xs text-text-muted">
                    Welcome back. Sign in with your registered email.
                  </p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="alex@example.com"
                      aria-label="Email Address"
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect="off"
                      className={input3dCls}
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-zinc-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setForgotEmail(loginEmail);
                          setForgotStep(1);
                          setError(null);
                        }}
                        className="text-xs text-accent hover:underline transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      type="password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      placeholder="Enter your password"
                      aria-label="Password"
                      autoComplete="current-password"
                      className={input3dCls}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className={btn3dCls}
                  >
                    {submitting ? "Signing In…" : "Sign In"}
                  </button>

                  {error && mode === "login" && (
                    <p className="mt-2 text-center text-xs font-semibold text-rose-400">{error}</p>
                  )}
                </form>

                <div className="mt-6 text-center text-xs text-text-muted">
                  <span>Don&apos;t have an account? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                    className="font-semibold text-white underline transition-colors hover:text-accent"
                  >
                    Create Account
                  </button>
                </div>
              </div>

              {/* BACK FACE: SIGN UP */}
              <div
                className="absolute inset-0 w-full rounded-2xl bg-black/60 border border-white/10 p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(-180deg)",
                }}
              >
                {/* Wordmark Logo */}
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="mb-1.5 flex items-baseline justify-center gap-1.5 text-3xl font-black tracking-tight text-white drop-shadow-md">
                    <span>Movie</span>
                    <span className="text-accent">Night</span>
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight text-white/95">Create Account</h2>
                  <p className="mt-0.5 text-xs text-text-muted">
                    Set up your email login and public username.
                  </p>
                </div>

                <form onSubmit={handleSignupSubmit} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Email <span className="text-zinc-500 font-normal">(Private login & recovery)</span>
                    </label>
                    <input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="alex@example.com"
                      aria-label="Email"
                      autoComplete="email"
                      className={input3dCls}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Username <span className="text-accent font-normal">(Visible to friends)</span>
                    </label>
                    <input
                      type="text"
                      value={signupUser}
                      onChange={(e) => {
                        setSignupUser(e.target.value);
                        setNameState("idle");
                      }}
                      onBlur={validateUsername}
                      placeholder="e.g. alex99"
                      aria-label="Username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      className={input3dCls}
                      required
                    />
                    <div className="mt-0.5">{usernameFeedback()}</div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Password
                    </label>
                    <input
                      type="password"
                      value={signupPass}
                      onChange={(e) => setSignupPass(e.target.value)}
                      placeholder="At least 6 characters"
                      aria-label="Password"
                      autoComplete="new-password"
                      className={input3dCls}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={signupConfirmPass}
                      onChange={(e) => setSignupConfirmPass(e.target.value)}
                      placeholder="Confirm your password"
                      aria-label="Confirm Password"
                      autoComplete="new-password"
                      className={input3dCls}
                      required
                    />
                    <div className="mt-0.5">{passwordMatchFeedback()}</div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className={`${btn3dCls} mt-1`}
                  >
                    {submitting ? "Creating Account…" : "Create Account"}
                  </button>

                  {error && mode === "signup" && (
                    <p className="mt-1 text-center text-xs font-semibold text-rose-400">{error}</p>
                  )}
                </form>

                <div className="mt-4 text-center text-xs text-text-muted">
                  <span>Already have an account? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="font-semibold text-white underline transition-colors hover:text-accent"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const input3dCls =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 backdrop-blur-md outline-none transition-all duration-200 focus:border-accent focus:bg-black/60 focus:ring-1 focus:ring-accent";

const btn3dCls =
  "w-full rounded-lg bg-accent border border-accent/40 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-accent/90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

function Hint({
  tone,
  children,
}: {
  tone: "muted" | "error" | "accent";
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "text-rose-400"
      : tone === "accent"
        ? "text-emerald-400"
        : "text-text-muted";
  return <span className={`text-[11px] ${cls}`}>{children}</span>;
}
