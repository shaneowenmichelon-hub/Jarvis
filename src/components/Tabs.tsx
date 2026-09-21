"use client";

import { Megaphone, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The two halves of the agency, side by side.
 *
 * Brands buying and students applying are different jobs with different
 * questions, so they get different tabs rather than one merged list. The
 * counts sit in the control itself: the point of a tab bar on a working
 * dashboard is to tell you whether the other side needs you, without going
 * there to find out.
 */
export default function Tabs({
  pipelineCount,
  ambassadorCount,
}: {
  pipelineCount: number;
  ambassadorCount: number;
}) {
  const pathname = usePathname();
  const onAmbassadors = pathname.startsWith("/ambassadors");

  const tabs = [
    {
      href: "/",
      label: "Pipeline",
      sub: "Brands",
      count: pipelineCount,
      icon: Megaphone,
      active: !onAmbassadors,
    },
    {
      href: "/ambassadors",
      label: "Ambassadors",
      sub: "Students",
      count: ambassadorCount,
      icon: Users,
      active: onAmbassadors,
    },
  ];

  return (
    <nav
      aria-label="Sections"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        borderRadius: 12,
        background: "var(--sunken)",
        border: "1px solid var(--border)",
        marginBottom: 20,
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "8px 14px",
              borderRadius: 9,
              textDecoration: "none",
              whiteSpace: "nowrap",
              background: tab.active ? "var(--surface-raised)" : "transparent",
              border: `1px solid ${tab.active ? "var(--border-strong)" : "transparent"}`,
              boxShadow: tab.active ? "var(--shadow)" : "none",
              color: tab.active ? "var(--ink)" : "var(--ink-muted)",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            <Icon size={15} style={{ flexShrink: 0 }} />
            <span style={{ display: "grid", lineHeight: 1.2 }}>
              <span style={{ fontSize: 13.5, fontWeight: tab.active ? 600 : 500 }}>
                {tab.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>{tab.sub}</span>
            </span>
            <span
              className="tabular"
              style={{
                fontSize: 12,
                fontWeight: 600,
                minWidth: 22,
                textAlign: "center",
                padding: "2px 6px",
                borderRadius: 999,
                background: tab.active ? "var(--ink)" : "var(--border)",
                color: tab.active ? "var(--page)" : "var(--ink-secondary)",
              }}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
