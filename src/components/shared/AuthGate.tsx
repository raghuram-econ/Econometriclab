import React, { useState } from "react";
import { motion } from "motion/react";
import {
  BarChart3,
  Sparkles,
  FileText,
  ShieldCheck,
  LogIn,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  User as UserIcon
} from "lucide-react";
import { signInWithGoogle, signInAsGuest } from "../../services/authService";
import { useStore } from "../../store/useStore";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isHydrated, user, setMockUser } = useStore();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningInGuest, setIsSigningInGuest] = useState(false);
  const [error, setError] = useState("");
  const [isPopupBlocked, setIsPopupBlocked] = useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setError("");
    setIsPopupBlocked(false);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (
        e?.code === "auth/popup-blocked" || 
        e?.message?.includes("popup-blocked") || 
        e?.message?.includes("popup blocked") ||
        e?.message?.includes("auth/popup-closed-by-user") === false
      ) {
        setIsPopupBlocked(true);
        setError("Sign-in popup was blocked by your browser.");
      } else {
        setError(e.message || "Sign-in failed.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignInGuest = async () => {
    setIsSigningInGuest(true);
    setError("");
    setIsPopupBlocked(false);
    try {
      const guestUser = await signInAsGuest();
      setMockUser(guestUser);
    } catch (e: any) {
      setError(e.message || "Guest session initialization failed.");
    } finally {
      setIsSigningInGuest(false);
    }
  };

  if (isHydrated && user) return <>{children}</>;

  const features = [
    {
      icon: BarChart3,
      title: "Live Matrix Engine",
      desc: "Run OLS, ARIMA & panel regressions in your browser. No STATA or EViews required.",
    },
    {
      icon: Sparkles,
      title: "AI Interpretation",
      desc: "Every output includes peer-referee level written analysis, diagnostics and insights.",
    },
    {
      icon: FileText,
      title: "APA Citation Generator",
      desc: "One click generates a complete APA 7th methodology citation for your paper.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* LEFT PANEL */}
      <motion.div
        className="w-full md:w-3/5 bg-slate-950 flex flex-col justify-between p-8 md:p-12"
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-emerald-500 rounded-lg p-2">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white font-bold tracking-widest uppercase text-sm">
            Econometrics Lab
          </span>
        </div>

        {/* Headline */}
        <div className="flex-1">
          <h1 className="text-white text-4xl md:text-5xl font-bold leading-tight mb-4">
            The Research Workbench for Graduate Economics.
          </h1>
          <p className="text-slate-400 text-base mb-8 max-w-md">
            Built for MA, MPhil & PhD Scholars. Run live econometric models,
            get AI-powered interpretations, and generate research-ready
            citations — all in your browser.
          </p>

          {/* Estimator tags */}
          <div className="flex flex-wrap gap-2 mb-10">
            {["OLS", "ARIMA", "Panel FE", "DiD", "IV", "Logit", "Probit"].map(
              (tag) => (
                <span
                  key={tag}
                  className="font-mono text-emerald-400 text-xs bg-slate-900 border border-slate-800 rounded px-2 py-1"
                >
                  {tag}
                </span>
              ),
            )}
          </div>

          {/* Feature cards */}
          <div className="space-y-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                className="flex items-start gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
              >
                <div className="bg-emerald-500/10 rounded-lg p-2 mt-0.5 flex-shrink-0">
                  <f.icon className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold mb-0.5">
                    {f.title}
                  </p>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 flex items-center justify-end">
          <span className="text-slate-700 text-xs font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded">
            REL 3.4.0 STABLE
          </span>
        </div>
      </motion.div>

      {/* RIGHT PANEL */}
      <motion.div
        className="w-full md:w-2/5 bg-white flex flex-col justify-center px-8 md:px-12 py-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="max-w-sm w-full mx-auto">
          {/* Label */}
          <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-4">
            Scholar Access
          </p>

          {/* Heading */}
          <h2 className="text-slate-900 text-2xl font-semibold mb-2">
            Sign in to your research environment.
          </h2>
          <p className="text-slate-500 text-sm mb-8">
            Free for MA, MPhil & PhD Scholars.
          </p>

          {error && !isPopupBlocked && <p className="text-red-500 text-xs mb-4">{error}</p>}

          {/* Special popup-blocked info block */}
          {isPopupBlocked && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-3 text-slate-800 animate-in fade-in duration-200">
              <div className="flex gap-2 items-start">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-amber-900">Sign-In Popup Blocked</p>
                  <p className="text-amber-700 mt-1 leading-relaxed">
                    Your browser or the sandboxed preview iframe blocked the Google login popup. Choose an option to proceed:
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <a 
                  href={window.location.href} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open App in New Tab
                </a>
                <button
                  type="button"
                  onClick={handleSignInGuest}
                  disabled={isSigningInGuest}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  {isSigningInGuest ? "Launching..." : "Continue as Guest (Local Sandbox)"}
                </button>
              </div>
            </div>
          )}

          
          {/* Google Sign-in button (primary) */}
          {!isPopupBlocked && (
            <motion.button
              onClick={handleSignIn}
              disabled={isSigningIn || isSigningInGuest}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 border border-slate-900 rounded-xl py-3 px-4 text-white font-semibold text-xs hover:bg-slate-800 transition-all duration-200 disabled:opacity-50 mb-3"
              initial={{ scale: 0.97 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
            >
              <LogIn className="w-4 h-4" />
              {isSigningIn ? "Signing in..." : "Continue with Google"}
            </motion.button>
          )}

          {/* Guest Sign-in button (secondary) */}
          {!isPopupBlocked && (
            <motion.button
              onClick={handleSignInGuest}
              disabled={isSigningIn || isSigningInGuest}
              className="w-full flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-700 font-medium text-xs hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 disabled:opacity-50 mb-6"
              initial={{ scale: 0.97 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
            >
              <UserIcon className="w-4 h-4 text-slate-500" />
              {isSigningInGuest ? "Launching Sandbox..." : "Continue as Guest (Local Sandbox)"}
            </motion.button>
          )}

          {/* Privacy note */}
          <div className="flex items-start gap-2 mb-8">
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-slate-400 text-xs leading-relaxed">
              Your datasets stay in your browser. Cloud sync activates automatically upon standard login.
            </p>
          </div>

          {/* Learn more */}
          <p className="text-emerald-600 text-xs tracking-wide uppercase font-medium cursor-pointer hover:text-emerald-700 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Learn what you can do in Econometrics Lab →
          </p>

          {/* Terms */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-slate-300 text-xs text-center">
              <span className="hover:text-slate-500 cursor-pointer">Terms</span>
              <span className="mx-2">•</span>
              <span className="hover:text-slate-500 cursor-pointer">
                Privacy
              </span>
              <span className="mx-2">•</span>
              <span className="hover:text-slate-500 cursor-pointer">
                Attribution
              </span>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
