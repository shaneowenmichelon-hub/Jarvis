"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { BrandRow } from "@/lib/types";

/**
 * The fields a person fills in that email cannot tell us: who owns the
 * relationship, what it is worth, which event it is for, and notes.
 */
export default function BrandEditor({
  brand,
  teamEmails,
}: {
  brand: BrandRow;
  teamEmails: string[];
}) {
  const router = useRouter();
  const [owner, setOwner] = useState(brand.owner_email ?? "");
  const [value, setValue] = useState(brand.deal_value?.toString() ?? "");
  const [event, setEvent] = useState(brand.event_tag ?? "");
  const [notes, setNotes] = useState(brand.notes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);

    const parsedValue = value.trim() === "" ? null : Number(value);
    if (parsedValue !== null && !Number.isFinite(parsedValue)) {
      setState("error");
      setError("Deal value has to be a number.");
      return;
    }

    try {
      const response = await fetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner_email: owner.trim() || null,
          deal_value: parsedValue,
          event_tag: event.trim() || null,
          notes,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setState("error");
        setError(data.error ?? "Could not save");
        return;
      }

      setState("saved");
      router.refresh();
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "Could not save");
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Owner">
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Unassigned</option>
          {teamEmails.map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
          {owner && !teamEmails.includes(owner) && <option value={owner}>{owner}</option>}
        </select>
      </Field>

      <Field label="Deal value (USD)">
        <input
          type="number"
          min="0"
          step="500"
          value={value}
          placeholder="—"
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>

      <Field label="Event">
        <input
          type="text"
          value={event}
          placeholder="Night School, HOMETURF, Hells Gala…"
          onChange={(e) => setEvent(e.target.value)}
        />
      </Field>

      <Field label="Notes">
        <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        {state === "saved" && (
          <span style={{ fontSize: 12, color: "var(--good)" }}>Saved</span>
        )}
        {state === "error" && error && (
          <span style={{ fontSize: 12, color: "var(--critical)" }} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
