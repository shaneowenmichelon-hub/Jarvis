"use client";

import { useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignInButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}
        onClick={signIn}
        disabled={busy}
      >
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && (
        <p style={{ marginBottom: 0, fontSize: 12.5, color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
