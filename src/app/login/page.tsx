import SignInButton from "@/components/SignInButton";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  not_allowed:
    "That Google account is not on the team list. Ask Shane to add your address, then try again.",
  missing_code: "Google did not complete the sign-in. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? error) : null;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div className="card" style={{ padding: 28, width: "100%", maxWidth: 380 }}>
        <h1 style={{ margin: 0, fontSize: 21, letterSpacing: "-0.01em" }}>Sponsor Command</h1>
        <p style={{ margin: "6px 0 20px", fontSize: 13, color: "var(--ink-secondary)" }}>
          Internal pipeline for ZMM Events. Sign in with your agency Google account.
        </p>

        {message && (
          <p
            role="alert"
            style={{
              margin: "0 0 16px",
              padding: "9px 11px",
              fontSize: 12.5,
              color: "var(--critical)",
              border: "1px solid var(--critical)",
              borderRadius: 8,
            }}
          >
            {message}
          </p>
        )}

        <SignInButton />
      </div>
    </main>
  );
}
