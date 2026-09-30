"use client";

import { useState } from "react";

export function DevPersonaSwitcher() {
  const [isOpen, setIsOpen] = useState(false);

  // In production, do not render this dev switcher
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const personas = [
    {
      title: "👑 Superadmin",
      roleBadge: "admin",
      badgeColor: "#ede9fe",
      textColor: "#6d28d9",
      email: "admin@campaign.local",
      role: "admin",
      name: "Platform Administrator",
      desc: "Full access to /admin, all tenants, moderation, and approvals.",
    },
    {
      title: "🏢 Org Owner",
      roleBadge: "owner",
      badgeColor: "#e0f2fe",
      textColor: "#0369a1",
      email: "owner@acmeglobal.com",
      role: "owner",
      name: "Acme Global Owner",
      desc: "Full campaign creation, team invitations, and domain settings.",
    },
    {
      title: "✍️ Campaign Editor",
      roleBadge: "member (editor)",
      badgeColor: "#ecfdf5",
      textColor: "#047857",
      email: "editor@acmeglobal.com",
      role: "editor",
      name: "Creative Editor",
      desc: "Can create & edit campaigns, cannot manage team members.",
    },
    {
      title: "📊 Analytics Viewer",
      roleBadge: "member (viewer)",
      badgeColor: "#f1f5f9",
      textColor: "#475569",
      email: "viewer@acmeglobal.com",
      role: "viewer",
      name: "Data Analyst",
      desc: "Read-only analytics and view access. Restricted from editing.",
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#0f172a",
            color: "#ffffff",
            padding: "10px 16px",
            borderRadius: "9999px",
            boxShadow:
              "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            border: "1px solid #334155",
            cursor: "pointer",
            fontWeight: "600",
            fontSize: "13px",
            transition: "transform 0.15s ease, background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.04)";
            e.currentTarget.style.background = "#1e293b";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.background = "#0f172a";
          }}
        >
          <span style={{ fontSize: "15px" }}>⚡</span>
          <span>Dev Persona Switcher</span>
        </button>
      )}

      {/* Expanded Persona Card */}
      {isOpen && (
        <div
          style={{
            width: "360px",
            maxHeight: "85vh",
            background: "#ffffff",
            borderRadius: "16px",
            boxShadow:
              "0 20px 30px -10px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.05)",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 20px",
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: "700",
                  fontSize: "14px",
                }}
              >
                <span>🛠️</span>
                <span>Local Dev Personas</span>
              </div>
              <div
                style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}
              >
                Test interfaces & permissions without bypassing
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "18px",
                cursor: "pointer",
                padding: "4px",
                lineHeight: "1",
              }}
            >
              ✕
            </button>
          </div>

          {/* Persona List */}
          <div
            style={{
              padding: "12px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "#64748b",
                padding: "4px 8px 0 8px",
              }}
            >
              Switch Active User
            </div>

            {personas.map((p) => (
              <a
                key={p.email}
                href={`/api/auth/dev-login?email=${encodeURIComponent(
                  p.email,
                )}&role=${p.role}&name=${encodeURIComponent(
                  p.name,
                )}&redirect=${encodeURIComponent(
                  typeof window !== "undefined"
                    ? window.location.pathname
                    : "/",
                )}`}
                style={{
                  textDecoration: "none",
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #f1f5f9",
                  background: "#f8fafc",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f1f5f9";
                  e.currentTarget.style.borderColor = "#cbd5e1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.borderColor = "#f1f5f9";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      fontWeight: "600",
                      fontSize: "13px",
                      color: "#0f172a",
                    }}
                  >
                    {p.title}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: p.badgeColor,
                      color: p.textColor,
                      textTransform: "uppercase",
                    }}
                  >
                    {p.roleBadge}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", lineHeight: "1.4" }}>
                  {p.desc}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#94a3b8",
                    fontFamily: "monospace",
                    marginTop: "4px",
                  }}
                >
                  {p.email}
                </div>
              </a>
            ))}

            {/* Logout / Guest Mode */}
            <a
              href={`/api/auth/dev-login?action=logout&redirect=${encodeURIComponent(
                typeof window !== "undefined" ? window.location.pathname : "/",
              )}`}
              style={{
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "10px",
                borderRadius: "8px",
                border: "1px dashed #cbd5e1",
                background: "#ffffff",
                color: "#e11d48",
                fontWeight: "600",
                fontSize: "12px",
                marginTop: "4px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#fff1f2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#ffffff";
              }}
            >
              <span>🚪</span>
              <span>Sign Out (Test as Guest / Public Visitor)</span>
            </a>

            {/* Quick Navigation */}
            <div
              style={{
                fontSize: "11px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "#64748b",
                padding: "8px 8px 0 8px",
                borderTop: "1px solid #f1f5f9",
                marginTop: "4px",
              }}
            >
              Quick Navigation
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
              }}
            >
              <a
                href="/"
                style={{
                  fontSize: "12px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  background: "#f1f5f9",
                  color: "#334155",
                  textDecoration: "none",
                  textAlign: "center",
                  fontWeight: "500",
                }}
              >
                🏠 Home
              </a>
              <a
                href="/auth/signin"
                style={{
                  fontSize: "12px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  background: "#f1f5f9",
                  color: "#334155",
                  textDecoration: "none",
                  textAlign: "center",
                  fontWeight: "500",
                }}
              >
                ✉️ Sign In Form
              </a>
              <a
                href="/team"
                style={{
                  fontSize: "12px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  background: "#f1f5f9",
                  color: "#334155",
                  textDecoration: "none",
                  textAlign: "center",
                  fontWeight: "500",
                }}
              >
                👥 Team Admin
              </a>
              <a
                href="/admin"
                style={{
                  fontSize: "12px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  background: "#f1f5f9",
                  color: "#334155",
                  textDecoration: "none",
                  textAlign: "center",
                  fontWeight: "500",
                }}
              >
                ⚙️ Admin Console
              </a>
            </div>

            {/* Local Mailpit Helper */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "8px 10px",
                fontSize: "11px",
                color: "#475569",
                marginTop: "6px",
                lineHeight: "1.4",
              }}
            >
              <div style={{ fontWeight: "600", marginBottom: "2px" }}>
                📬 Local Mailpit Trap:
              </div>
              Magic links sent via <code>/auth/signin</code> appear live at{" "}
              <a
                href="http://localhost:8025"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#4f46e5",
                  fontWeight: "600",
                  textDecoration: "underline",
                }}
              >
                localhost:8025
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
