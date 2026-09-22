"use client";

import { Archive, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { AMBASSADOR_STAGES, AMBASSADOR_STAGE_META, type AmbassadorStage } from "@/lib/ambassadors";
import type { AmbassadorRow } from "@/lib/types";

/**
 * Everything editable about one applicant, in one panel.
 *
 * Notes save on blur rather than on every keystroke — a recruiting note is a
 * paragraph, not a search box, and a request per character would be both
 * wasteful and prone to interleaving out of order.
 */
export default function AmbassadorEditor({
  ambassador,
  teamEmails,
}: {
  ambassador: AmbassadorRow;
  teamEmails: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(ambassador.notes ?? "");

  // A scan or a teammate can change the row under us; once the refreshed row
  // arrives, take its version rather than leaving a stale draft on screen.
  useEffect(() => setNotes(ambassador.notes ?? ""), [ambassador.notes]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ambassadors/${ambassador.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not save");
        return;
      }
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;
  const notesChanged = notes.trim() !== (ambassador.notes ?? "").trim();

  return (
    <div style={{ display: "grid", gap: 12, opacity: disabled ? 0.6 : 1 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="label">Stage</span>
        <select
          value={ambassador.stage}
          disabled={disabled}
          onChange={(event) => patch({ stage: event.target.value as AmbassadorStage })}
        >
          {AMBASSADOR_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {AMBASSADOR_STAGE_META[stage].label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
          {AMBASSADOR_STAGE_META[ambassador.stage].blurb}
        </span>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="label">Owner</span>
        <select
          value={ambassador.owner_email ?? ""}
          disabled={disabled}
          onChange={(event) => patch({ owner_email: event.target.value })}
        >
          <option value="">Unassigned</option>
          {teamEmails.map((email) => (
            <option key={email} value={email}>
              {email.split("@")[0]}
            </option>
          ))}
          {ambassador.owner_email && !teamEmails.includes(ambassador.owner_email) && (
            <option value={ambassador.owner_email}>{ambassador.owner_email.split("@")[0]}</option>
          )}
        </select>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="label">Notes</span>
        <textarea
          value={notes}
          disabled={disabled}
          rows={5}
          placeholder="Anything worth remembering — a call, an ID still outstanding, which campus they can cover."
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => notesChanged && patch({ notes: notes.trim() || null })}
          style={{ fontSize: 13, lineHeight: 1.45, resize: "vertical" }}
        />
        <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
          {notesChanged ? "Unsaved — click outside to save." : "Saved."}
        </span>
      </label>

      <button
        className="btn btn-sm"
        disabled={disabled}
        onClick={() => patch(ambassador.archived ? { restore: true } : { archive: true })}
      >
        {ambassador.archived ? (
          <>
            <Undo2 size={13} /> Put back on the list
          </>
        ) : (
          <>
            <Archive size={13} /> Archive
          </>
        )}
      </button>

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
