import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import CinematicScene from "../components/login/CinematicScene";

type NameState = "idle" | "checking" | "available" | "taken" | "empty";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function LoginPage() {
  const { login, signup, checkName } = useStore();
  const { navigate } = useRouter();

  // 3D Flip State
  const [isSignup, setIsSignup] = useState(false);

  // Login inputs
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Signup inputs
  const [signupDisplay, setSignupDisplay] = useState("");
  const [signupUser, setSignupUser] = useState("");
  const [signupPass, setSignupPass] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [nameState, setNameState] = useState<NameState>("idle");

  // Success transition: idle -> fading (CinematicScene runs its full sequence)
  const [fading, setFading] = useState(false);

  const runSuccess = () => {
    if (prefersReduced()) {
      navigate("/movies", { replace: true });
      return;
    }
    setFading(true);
  };

  const handleSequenceFinished = () => {
    navigate("/movies", { replace: true });
  };

  const validateName = async () => {
    const trimmed = signupDisplay.trim();
    if (!trimmed) {
      setNameState("empty");
      return;
    }
    setNameState("checking");
    const ok = await checkName(trimmed);
    setNameState(ok ? "available" : "taken");
  };

  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = login(loginUser, loginPass);
    if (!res.ok) return setError(res.error ?? "Invalid credentials.");
    runSuccess();
  };

  const handleSignupSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!signupDisplay.trim()) {
      setNameState("empty");
      return;
    }
    if (nameState === "taken") return;
    const res = signup({
      username: signupUser,
      displayName: signupDisplay,
      password: signupPass,
    });
    if (!res.ok) return setError(res.error ?? "Unable to create account.");
    runSuccess();
  };

  const nameMessage = () => {
    switch (nameState) {
      case "empty":
        return <Hint tone="error">Display name can&apos;t be empty.</Hint>;
      case "taken":
        return <Hint tone="error">That name&apos;s already taken.</Hint>;
      case "checking":
        return <Hint tone="muted">Checking…</Hint>;
      case "available":
        return <Hint tone="accent">Available</Hint>;
      default:
        return null;
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-end overflow-hidden bg-[#05070D]">
      {/* Fullscreen Atmospheric Ambient Video Background */}
      <CinematicScene fading={fading} onFinished={handleSequenceFinished} />

      {/* Transparent Flip Card Container */}
      <div
        className={`relative z-20 flex w-full justify-end px-6 py-12 md:pr-16 lg:pr-24 xl:pr-32 transition-opacity duration-700 ${
          fading ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{ perspective: "1400px" }}
      >
        <div
          className="relative w-full max-w-[390px] transition-transform duration-700 ease-in-out"
          style={{
            transformStyle: "preserve-3d",
            transform: isSignup ? "rotateY(-180deg)" : "rotateY(0deg)",
          }}
        >
          {/* FRONT FACE: LOGIN - Completely Transparent */}
          <div
            className="w-full rounded-2xl bg-transparent p-6 sm:p-8"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            {/* Wordmark Logo */}
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-2 flex items-baseline justify-center gap-1.5 text-3xl font-black tracking-tight text-white drop-shadow-md">
                <span>Movie</span>
                <span className="text-accent">Night</span>
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white/90">Sign In</h2>
              <p className="mt-1 text-xs text-text-muted">
                Welcome back. The reel&apos;s still running.
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="Username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={input3dCls}
                />
              </div>

              <div>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Password"
                  className={input3dCls}
                />
              </div>

              <button type="submit" className={btn3dCls}>
                Sign In
              </button>

              {error && !isSignup && (
                <p className="mt-2 text-center text-xs font-semibold text-danger">{error}</p>
              )}
            </form>

            <div className="mt-6 text-center text-xs text-text-muted">
              <span>Don&apos;t have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setIsSignup(true);
                  setError(null);
                }}
                className="font-semibold text-white underline transition-colors hover:text-accent"
              >
                Sign Up
              </button>
            </div>

            <div className="mt-4 text-center text-[11px] text-zinc-400/80">
              Demo: <span className="font-mono text-zinc-300">you</span> /{" "}
              <span className="font-mono text-zinc-300">password</span>
            </div>
          </div>

          {/* BACK FACE: SIGN UP - Completely Transparent */}
          <div
            className="absolute inset-0 w-full rounded-2xl bg-transparent p-6 sm:p-8"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(-180deg)",
            }}
          >
            {/* Wordmark Logo */}
            <div className="mb-7 flex flex-col items-center text-center">
              <div className="mb-2 flex items-baseline justify-center gap-1.5 text-3xl font-black tracking-tight text-white drop-shadow-md">
                <span>Movie</span>
                <span className="text-accent">Night</span>
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white/90">Create Account</h2>
              <p className="mt-1 text-xs text-text-muted">
                Join to start your personal cinema vault.
              </p>
            </div>

            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div>
                <input
                  type="text"
                  value={signupDisplay}
                  onChange={(e) => {
                    setSignupDisplay(e.target.value);
                    setNameState("idle");
                  }}
                  onBlur={validateName}
                  placeholder="Display Name (e.g. Alex)"
                  className={input3dCls}
                />
                <div className="mt-1">{nameMessage()}</div>
              </div>

              <div>
                <input
                  type="text"
                  value={signupUser}
                  onChange={(e) => setSignupUser(e.target.value)}
                  placeholder="Username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={input3dCls}
                />
              </div>

              <div>
                <input
                  type="password"
                  value={signupPass}
                  onChange={(e) => setSignupPass(e.target.value)}
                  placeholder="Password"
                  className={input3dCls}
                />
              </div>

              <button type="submit" className={btn3dCls}>
                Sign Up
              </button>

              {error && isSignup && (
                <p className="mt-2 text-center text-xs font-semibold text-danger">{error}</p>
              )}
            </form>

            <div className="mt-5 text-center text-xs text-text-muted">
              <span>Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setIsSignup(false);
                  setError(null);
                }}
                className="font-semibold text-white underline transition-colors hover:text-accent"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const input3dCls =
  "w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500 backdrop-blur-md outline-none transition-all duration-200 focus:border-accent focus:bg-black/60 focus:ring-1 focus:ring-accent";

const btn3dCls =
  "w-full rounded-lg bg-[#3730a3] border border-indigo-500/30 py-3 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-[#4338ca] active:scale-[0.99]";

function Hint({
  tone,
  children,
}: {
  tone: "muted" | "error" | "accent";
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "text-danger"
      : tone === "accent"
        ? "text-zinc-300"
        : "text-text-muted";
  return <span className={`text-[11px] ${cls}`}>{children}</span>;
}
