"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { STAGES, STAGE_META, type Stage } from "@/lib/types";

/**
 * Put a lead on the board that did not come through the website form.
 *
 * The scan only ever creates cards from form submissions. This is how a call,
 * a DM or an introduction gets tracked — give it an email address and the
 * hourly scan follows the conversation from the next run onwards.
 */
export default function AddBrandButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    contact_email: "",
    summary: "",
    stage: "new_submission" as Stage,
    deal_value: "",
    event_tag: "",
    doc_name: "",
    doc_url: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  function close() {
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const value = form.deal_value.trim();
    if (value && !Number.isFinite(Number(value))) {
      setError("Deal value has to be a number.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          contact_name: form.contact_name,
          contact_email: form.contact_email,
          summary: form.summary,
          stage: form.stage,
          deal_value: value ? Number(value) : null,
          event_tag: form.event_tag,
          documents:
            form.doc_name.trim() && form.doc_url.trim()
              ? [{ name: form.doc_name, url: form.doc_url }]
              : [],
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not add the brand.");
        return;
      }

      setForm({
        name: "",
        contact_name: "",
        contact_email: "",
        summary: "",
        stage: "new_submission",
        deal_value: "",
        event_tag: "",
        doc_name: "",
        doc_url: "",
      });
      close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the brand.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        Add a brand
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a brand"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        onSubmit={submit}
        className="card"
        style={{
          padding: 20,
          width: "100%",
          maxWidth: 460,
          display: "grid",
          gap: 12,
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 17 }}>Add a brand</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>
            For leads that came in off-website. Give it an email address and the hourly scan
            will track the conversation from the next run.
          </p>
        </div>

        <Field label="Brand" required>
          <input
            type="text"
            required
            autoFocus
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="Triumph"
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Contact">
            <input
              type="text"
              value={form.contact_name}
              onChange={(e) => set("contact_name")(e.target.value)}
              placeholder="Full name"
            />
          </Field>
          <Field label="Stage">
            <select value={form.stage} onChange={(e) => set("stage")(e.target.value)}>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_META[stage].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Contact email" hint="What the scan tracks. Leave blank if you have none yet.">
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => set("contact_email")(e.target.value)}
            placeholder="name@brand.com"
          />
        </Field>

        <Field label="What they want">
          <textarea
            rows={2}
            value={form.summary}
            onChange={(e) => set("summary")(e.target.value)}
            placeholder="Campus signup challenge, one campus, two weeks."
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Deal value (USD)">
            <input
              type="number"
              min="0"
              step="500"
              value={form.deal_value}
              onChange={(e) => set("deal_value")(e.target.value)}
            />
          </Field>
          <Field label="Event">
            <input
              type="text"
              value={form.event_tag}
              onChange={(e) => set("event_tag")(e.target.value)}
              placeholder="Night School"
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Document">
            <input
              type="text"
              value={form.doc_name}
              onChange={(e) => set("doc_name")(e.target.value)}
              placeholder="Proposal"
            />
          </Field>
          <Field label="Link">
            <input
              type="text"
              value={form.doc_url}
              onChange={(e) => set("doc_url")(e.target.value)}
              placeholder="/documents/proposal.pdf"
            />
          </Field>
        </div>

        {error && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--critical)" }} role="alert">
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn btn-sm" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
            {saving ? "Adding…" : "Add to board"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="label">
        {label}
        {required && <span style={{ color: "var(--critical)" }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{hint}</span>}
    </label>
  );
}
