"use client";

import React, { useState, useEffect, useRef } from "react";

interface CampaignItem {
  id: string;
  name: string;
  campaign_mode: string;
  status: string;
  created_at: string;
}

interface RecipientRow {
  email: string;
  first_name: string;
  sex: string;
  fields?: Record<string, string>;
  landing_link?: string;
}

interface CampaignStudioProps {
  initialCampaigns: CampaignItem[];
  recipientCount: number;
  orgName: string;
  userEmail?: string | null;
  initialSendingDomain?: string | null;
  initialDomainVerified?: boolean;
}

interface ReplyItem {
  id: string;
  name: string;
  email: string;
  sex: string | null;
  body: string;
  createdAt: string;
  isBroadcast: boolean;
}

export function CampaignStudio({
  initialCampaigns,
  recipientCount,
  orgName,
  userEmail,
  initialSendingDomain,
  initialDomainVerified,
}: CampaignStudioProps) {
  // Navigation / Stepper
  const [activeStep, setActiveStep] = useState<"audience" | "compose" | "preview" | "export_send" | "inbox">("audience");

  // Mode Selection: "personalized" vs "broadcast"
  const [mode, setMode] = useState<"personalized" | "broadcast">("personalized");

  // Campaign Meta
  const [campaignName, setCampaignName] = useState("VIP Client Consultation & Update");

  // Contact list
  const defaultRecipients: RecipientRow[] = [
    { email: "alex.morgan@example.com", first_name: "Alex", sex: "Male" },
    { email: "sarah.connor@example.com", first_name: "Sarah", sex: "Female" },
    { email: "jamie.lee@example.com", first_name: "Jamie", sex: "Non-binary" },
  ];
  const [recipients, setRecipients] = useState<RecipientRow[]>(defaultRecipients);
  const [csvRawText, setCsvRawText] = useState("");
  const [csvUploadFeedback, setCsvUploadFeedback] = useState<string | null>(null);

  // Template fields
  const [subject, setSubject] = useState("Special confidential update for {{first_name}}");
  const [introTeaser, setIntroTeaser] = useState(
    "Hi {{first_name}}, as a valued {{sex|member}}, I wanted to personally reach out with our latest project update. Please review your personalized overview page below.",
  );
  const [buttonText, setButtonText] = useState("Open Your Private Page →");
  const [landingContent, setLandingContent] = useState(
    `Welcome, {{first_name}}!\n\nThis confidential briefing is prepared specifically for you.\nAs registered in our system (Identity: {{sex|client}}), your account has been provisioned with priority access.\n\nPlease read through the details below and feel free to send any questions directly through the reply box below.`,
  );
  const [allowReplies, setAllowReplies] = useState(true);
  const [requireOtp, setRequireOtp] = useState(false);

  // Active target field for variable pill insertion
  const [focusedField, setFocusedField] = useState<"subject" | "intro" | "landing">("intro");

  // Preview state
  const [previewTab, setPreviewTab] = useState<"email" | "landing">("email");
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">("desktop");
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0);

  // Domain Verification State
  const [sendingDomain, setSendingDomain] = useState(initialSendingDomain || "acmeglobal.com");
  const [isDomainVerified, setIsDomainVerified] = useState(initialDomainVerified || false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [domainCheckMessage, setDomainCheckMessage] = useState<string | null>(null);

  // Execution & Results state
  const [loading, setLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    campaignId: string;
    campaignName: string;
    campaignMode: string;
    sharedUrl?: string;
    landingUrl?: string;
    recipients: RecipientRow[];
    exportCsv: string;
    renderedEmailHtml: string;
    renderedPageHtml: string;
    renderedSubject: string;
    dispatchViaPlatform: boolean;
  } | null>(null);

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>(initialCampaigns);

  // Inbox & Replies state
  const [repliesList, setRepliesList] = useState<ReplyItem[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);

  // Parse custom CSV input
  function handleCsvParse(raw: string) {
    if (!raw.trim()) return;
    const lines = raw.trim().split("\n");
    if (lines.length === 0) return;

    // Header row
    const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const emailIdx = headers.indexOf("email");
    const nameIdx = headers.findIndex((h) => h === "first_name" || h === "name");
    const sexIdx = headers.findIndex((h) => h === "sex" || h === "gender");

    if (emailIdx === -1) {
      setCsvUploadFeedback("❌ CSV must include an 'email' column header.");
      return;
    }

    const parsed: RecipientRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const email = cols[emailIdx];
      if (email && email.includes("@")) {
        const first_name = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : "Friend";
        const sex = sexIdx !== -1 && cols[sexIdx] ? cols[sexIdx] : "";
        parsed.push({ email, first_name, sex });
      }
    }

    if (parsed.length > 0) {
      setRecipients(parsed);
      setCsvUploadFeedback(`✓ Successfully imported ${parsed.length} contacts!`);
    } else {
      setCsvUploadFeedback("❌ No valid rows found with valid email addresses.");
    }
  }

  // Insert variable into active input
  function insertVariable(variable: string) {
    if (focusedField === "subject") {
      setSubject((prev) => prev + ` {{${variable}}}`);
    } else if (focusedField === "intro") {
      setIntroTeaser((prev) => prev + ` {{${variable}}}`);
    } else if (focusedField === "landing") {
      setLandingContent((prev) => prev + ` {{${variable}}}`);
    }
  }

  // Handle Create & Generate (Export Links or Send via Platform)
  async function handleGenerate(dispatchViaPlatform = false) {
    setLoading(true);
    setExecutionResult(null);

    const backendMode = mode === "broadcast" ? "link_universal" : dispatchViaPlatform ? "managed_send" : "link_per_recipient";

    try {
      const res = await fetch("/api/campaigns/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          campaignMode: backendMode,
          recipientsList: mode === "broadcast" ? [] : recipients,
          subject,
          message: introTeaser,
          pageHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 40px auto; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 40px; color: #f9fafb; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 24px;">
    <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981;"></div>
    <span style="font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Verified Private Page for {{first_name}}</span>
  </div>
  <h1 style="font-size: 26px; font-weight: 800; margin: 0 0 16px 0; color: #ffffff;">Hello {{first_name}}</h1>
  <div style="background: #1f2937; border-left: 4px solid #6366f1; padding: 20px; border-radius: 8px; margin: 24px 0; font-size: 16px; line-height: 1.6; color: #e5e7eb; white-space: pre-wrap;">
${landingContent}
  </div>
  <p style="color: #9ca3af; line-height: 1.6; font-size: 14px;">
    Identified Profile: <strong>{{sex|Preferred Member}}</strong> · Recipient: <strong>{{email}}</strong>
  </p>
</div>
          `.trim(),
          buttonText,
          allowReplies,
          dispatchViaPlatform,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Failed to process campaign");
        return;
      }

      setExecutionResult(json.data);

      // Add to campaign list
      setCampaigns((prev) => [
        {
          id: json.data.campaignId,
          name: json.data.campaignName,
          campaign_mode: json.data.campaignMode,
          status: "live",
          created_at: new Date().toISOString(),
        },
        ...prev.filter((c) => c.id !== json.data.campaignId),
      ]);

      // Move to Export/Send tab
      setActiveStep("export_send");
    } catch (err) {
      alert("Network error processing campaign");
    } finally {
      setLoading(false);
    }
  }

  // Download exported CSV
  function downloadCsv() {
    if (!executionResult?.exportCsv) return;
    const blob = new Blob([executionResult.exportCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${campaignName.replace(/\s+/g, "_")}_personalized_links.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Copy helper
  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2500);
  }

  // Load replies for active campaign
  async function fetchReplies(campaignId: string) {
    setLoadingReplies(true);
    try {
      const res = await fetch(`/api/replies?campaignId=${campaignId}`);
      const data = await res.json();
      if (res.ok && data.replies) {
        setRepliesList(data.replies);
      }
    } catch {
      // ignore
    } finally {
      setLoadingReplies(false);
    }
  }

  // Export replies as CSV for external download & CRM import
  function exportRepliesCsv() {
    if (repliesList.length === 0) return;
    const header = "Name,Email,Sex,Type,Received At,Reply Body\r\n";
    const rows = repliesList
      .map((r) => {
        const cleanName = `"${(r.name || "").replace(/"/g, '""')}"`;
        const cleanEmail = `"${(r.email || "").replace(/"/g, '""')}"`;
        const cleanSex = `"${(r.sex || "").replace(/"/g, '""')}"`;
        const type = r.isBroadcast ? `"Broadcast / WhatsApp"` : `"Personalized"`;
        const date = `"${new Date(r.createdAt).toISOString()}"`;
        const cleanBody = `"${(r.body || "").replace(/"/g, '""')}"`;
        return [cleanName, cleanEmail, cleanSex, type, date, cleanBody].join(",");
      })
      .join("\r\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign_replies_${executionResult?.campaignId ?? "export"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  // Trigger DNS verify
  async function handleVerifyDomain() {
    setVerifyingDomain(true);
    setDomainCheckMessage(null);
    try {
      const res = await fetch("/api/org/verify-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: sendingDomain }),
      });
      const data = await res.json();
      if (res.ok && data.data?.verified) {
        setIsDomainVerified(true);
        setDomainCheckMessage("✓ Domain verified successfully with active SPF & DMARC records!");
      } else {
        setDomainCheckMessage(
          `⚠️ Verification pending: ${data.data?.spf ? "✓ SPF found" : "❌ Missing SPF"} · ${
            data.data?.dmarc ? "✓ DMARC found" : "❌ Missing DMARC"
          }. (You can still send using the platform shared sender).`,
        );
      }
    } catch {
      setDomainCheckMessage("❌ DNS lookup failed. Please ensure the domain name is valid.");
    } finally {
      setVerifyingDomain(false);
    }
  }

  // Preview interpolation helper
  const activeRecipient = recipients[selectedPreviewIdx] || recipients[0] || {
    email: "visitor@example.com",
    first_name: "Friend",
    sex: "Member",
  };

  const previewSubject = subject
    .replace(/\{\{first_name(?:\|[^}]*)?\}\}/g, activeRecipient.first_name)
    .replace(/\{\{sex(?:\|[^}]*)?\}\}/g, activeRecipient.sex || "Client")
    .replace(/\{\{email(?:\|[^}]*)?\}\}/g, activeRecipient.email);

  const previewIntro = introTeaser
    .replace(/\{\{first_name(?:\|[^}]*)?\}\}/g, activeRecipient.first_name)
    .replace(/\{\{sex(?:\|[^}]*)?\}\}/g, activeRecipient.sex || "Client")
    .replace(/\{\{email(?:\|[^}]*)?\}\}/g, activeRecipient.email);

  const previewLandingBody = landingContent
    .replace(/\{\{first_name(?:\|[^}]*)?\}\}/g, activeRecipient.first_name)
    .replace(/\{\{sex(?:\|[^}]*)?\}\}/g, activeRecipient.sex || "Client")
    .replace(/\{\{email(?:\|[^}]*)?\}\}/g, activeRecipient.email);

  return (
    <div style={{ color: "#f3f4f6" }}>
      {/* Step Navigation Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#111827",
          padding: "8px",
          borderRadius: "12px",
          border: "1px solid #1f2937",
          marginBottom: "24px",
          overflowX: "auto",
        }}
      >
        <button
          onClick={() => setActiveStep("audience")}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: "none",
            background: activeStep === "audience" ? "#4f46e5" : "transparent",
            color: activeStep === "audience" ? "#ffffff" : "#9ca3af",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <span>1. Audience & Mode</span>
          <span style={{ fontSize: "11px", opacity: 0.8 }}>({mode === "personalized" ? `${recipients.length} Contacts` : "Broadcast"})</span>
        </button>

        <button
          onClick={() => setActiveStep("compose")}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: "none",
            background: activeStep === "compose" ? "#4f46e5" : "transparent",
            color: activeStep === "compose" ? "#ffffff" : "#9ca3af",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <span>2. Compose & Variables</span>
        </button>

        <button
          onClick={() => setActiveStep("preview")}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: "none",
            background: activeStep === "preview" ? "#4f46e5" : "transparent",
            color: activeStep === "preview" ? "#ffffff" : "#9ca3af",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <span>3. Live Preview</span>
        </button>

        <button
          onClick={() => setActiveStep("export_send")}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: "none",
            background: activeStep === "export_send" ? "#4f46e5" : "transparent",
            color: activeStep === "export_send" ? "#ffffff" : "#9ca3af",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <span>4. Export / Send</span>
          {executionResult && <span style={{ fontSize: "10px", background: "#10b981", color: "#fff", padding: "1px 6px", borderRadius: "10px" }}>Ready</span>}
        </button>

        <button
          onClick={() => {
            setActiveStep("inbox");
            if (executionResult?.campaignId) fetchReplies(executionResult.campaignId);
          }}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: "none",
            background: activeStep === "inbox" ? "#4f46e5" : "transparent",
            color: activeStep === "inbox" ? "#ffffff" : "#9ca3af",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <span>5. Replies & Inbox</span>
          {repliesList.length > 0 && (
            <span style={{ fontSize: "10px", background: "#ec4899", color: "#fff", padding: "1px 6px", borderRadius: "10px" }}>
              {repliesList.length}
            </span>
          )}
        </button>
      </div>

      {/* STEP 1: AUDIENCE & MODE */}
      {activeStep === "audience" && (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 8px 0" }}>Choose Campaign Mode & Audience</h2>
          <p style={{ color: "#9ca3af", fontSize: "14px", margin: "0 0 24px 0" }}>
            Select how you plan to distribute this campaign. You can import contacts with custom attributes (like sex, name) or generate a public group link.
          </p>

          {/* Mode Selector Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "28px" }}>
            <div
              onClick={() => setMode("personalized")}
              style={{
                border: `2px solid ${mode === "personalized" ? "#6366f1" : "#1f2937"}`,
                background: mode === "personalized" ? "rgba(79, 70, 229, 0.1)" : "#182234",
                borderRadius: "12px",
                padding: "20px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>👥 Contact List (Personalized)</span>
                {mode === "personalized" && <span style={{ color: "#6366f1", fontWeight: "700" }}>✓ Selected</span>}
              </div>
              <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0, lineHeight: "1.5" }}>
                Import emails with details (Name, Sex, etc.). Every recipient receives a custom email intro and their own private dynamic page (`/m/[token]`).
              </p>
            </div>

            <div
              onClick={() => setMode("broadcast")}
              style={{
                border: `2px solid ${mode === "broadcast" ? "#6366f1" : "#1f2937"}`,
                background: mode === "broadcast" ? "rgba(79, 70, 229, 0.1)" : "#182234",
                borderRadius: "12px",
                padding: "20px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#fff" }}>📢 Group Broadcast (WhatsApp / SMS)</span>
                {mode === "broadcast" && <span style={{ color: "#6366f1", fontWeight: "700" }}>✓ Selected</span>}
              </div>
              <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0, lineHeight: "1.5" }}>
                No recipient list needed. Produces a single shareable link for WhatsApp groups. If replies are on, respondents enter their Name & Email.
              </p>
            </div>
          </div>

          {/* Campaign Title Input */}
          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "8px" }}>
              Campaign Reference Name
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0d131f",
                border: "1px solid #374151",
                padding: "12px 14px",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "14px",
              }}
            />
          </div>

          {/* Contact List Importer (Only for Personalized Mode) */}
          {mode === "personalized" && (
            <div style={{ borderTop: "1px solid #1f2937", paddingTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>Import Contact List</h3>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>Accepts CSV with headers: email, first_name, sex</span>
              </div>

              {/* CSV Upload & Paste Form */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                    Paste CSV Data or Add Custom Rows:
                  </label>
                  <textarea
                    rows={4}
                    placeholder="email,first_name,sex&#10;john@example.com,John,Male&#10;claire@example.com,Claire,Female"
                    value={csvRawText}
                    onChange={(e) => setCsvRawText(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "#0d131f",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                      padding: "10px",
                      color: "#e2e8f0",
                      fontSize: "13px",
                      fontFamily: "monospace",
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleCsvParse(csvRawText)}
                      style={{
                        background: "#3b82f6",
                        color: "#fff",
                        border: "none",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Parse & Add Contacts
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipients(defaultRecipients)}
                      style={{
                        background: "#1f2937",
                        color: "#cbd5e1",
                        border: "1px solid #374151",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      Load Sample 3 Contacts
                    </button>
                  </div>
                  {csvUploadFeedback && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: csvUploadFeedback.startsWith("✓") ? "#34d399" : "#f87171" }}>
                      {csvUploadFeedback}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                    Or Upload CSV File from Disk:
                  </label>
                  <div
                    style={{
                      border: "2px dashed #374151",
                      borderRadius: "8px",
                      padding: "24px",
                      textAlign: "center",
                      background: "#0d131f",
                    }}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const content = event.target?.result as string;
                            if (content) handleCsvParse(content);
                          };
                          reader.readAsText(file);
                        }
                      }}
                      style={{ display: "none" }}
                      id="csv-file-input"
                    />
                    <label
                      htmlFor="csv-file-input"
                      style={{
                        display: "inline-block",
                        background: "#4f46e5",
                        color: "#fff",
                        padding: "8px 18px",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      📁 Browse CSV File
                    </label>
                    <p style={{ margin: "10px 0 0 0", fontSize: "11px", color: "#9ca3af" }}>
                      Column headers will be automatically mapped: email, first_name, sex
                    </p>
                  </div>
                </div>
              </div>

              {/* Contacts Table Preview */}
              <div style={{ background: "#0d131f", border: "1px solid #1f2937", borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#cbd5e1" }}>
                    Active Recipient List ({recipients.length} contacts)
                  </span>
                  <span style={{ fontSize: "12px", color: "#6366f1" }}>Ready for dynamic interpolation</span>
                </div>
                <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#111827", color: "#9ca3af" }}>
                        <th style={{ padding: "10px 16px" }}>#</th>
                        <th style={{ padding: "10px 16px" }}>Email</th>
                        <th style={{ padding: "10px 16px" }}>First Name</th>
                        <th style={{ padding: "10px 16px" }}>Sex / Identity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                          <td style={{ padding: "10px 16px", color: "#6b7280" }}>{i + 1}</td>
                          <td style={{ padding: "10px 16px", fontWeight: "600", color: "#e2e8f0" }}>{r.email}</td>
                          <td style={{ padding: "10px 16px", color: "#cbd5e1" }}>{r.first_name || "—"}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{ background: "#1e293b", padding: "2px 8px", borderRadius: "4px", color: "#93c5fd", fontSize: "12px" }}>
                              {r.sex || "Default"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Action to proceed */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
            <button
              onClick={() => setActiveStep("compose")}
              style={{
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.4)",
              }}
            >
              Continue to Compose & Templates →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: COMPOSE & TEMPLATES */}
      {activeStep === "compose" && (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 4px 0" }}>Compose Message & Dynamic Page</h2>
              <p style={{ color: "#9ca3af", fontSize: "14px", margin: 0 }}>
                Write the email teaser notice and the full confidential landing page. Insert personal variables with 1 click.
              </p>
            </div>
          </div>

          {/* Variable Injection Chips Toolbar */}
          <div
            style={{
              background: "#182234",
              border: "1px solid #374151",
              borderRadius: "10px",
              padding: "14px 18px",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: "700", color: "#a5b4fc" }}>
              Insert Variable into Active Field:
            </span>
            <button
              type="button"
              onClick={() => insertVariable("first_name")}
              style={{
                background: "#312e81",
                color: "#c7d2fe",
                border: "1px solid #4338ca",
                padding: "5px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              + {`{{first_name}}`}
            </button>
            <button
              type="button"
              onClick={() => insertVariable("sex")}
              style={{
                background: "#312e81",
                color: "#c7d2fe",
                border: "1px solid #4338ca",
                padding: "5px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              + {`{{sex}}`}
            </button>
            <button
              type="button"
              onClick={() => insertVariable("email")}
              style={{
                background: "#312e81",
                color: "#c7d2fe",
                border: "1px solid #4338ca",
                padding: "5px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              + {`{{email}}`}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "auto" }}>
              Fallback syntax supported: {`{{sex|friend}}`}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Box 1: Intro Email Notice */}
            <div style={{ background: "#0d131f", border: "1px solid #1f2937", borderRadius: "12px", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <span style={{ fontSize: "18px" }}>✉️</span>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#f3f4f6" }}>
                  1. Intro Email (Sent to Inbox)
                </h3>
              </div>
              <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 16px 0", lineHeight: "1.4" }}>
                This is the clean notification email. Contains a short intro teaser and a button taking them to the dynamic page.
              </p>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#cbd5e1" }}>
                    Email Subject Line
                  </label>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      color: subject.length > 60 ? "#f59e0b" : "#10b981",
                    }}
                  >
                    {subject.length}/60 chars {subject.length > 60 ? "(may truncate on mobile)" : "(optimal length)"}
                  </span>
                </div>
                <input
                  type="text"
                  value={subject}
                  onFocus={() => setFocusedField("subject")}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "#182234",
                    border: subject.length > 60 ? "1px solid #f59e0b" : "1px solid #374151",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                  Custom Intro Teaser Message
                </label>
                <textarea
                  rows={4}
                  value={introTeaser}
                  onFocus={() => setFocusedField("intro")}
                  onChange={(e) => setIntroTeaser(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "#182234",
                    border: "1px solid #374151",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "13px",
                    lineHeight: "1.5",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                  Action Button Label
                </label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "#182234",
                    border: "1px solid #374151",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>
            </div>

            {/* Box 2: Dynamic Landing Page */}
            <div style={{ background: "#0d131f", border: "1px solid #1f2937", borderRadius: "12px", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <span style={{ fontSize: "18px" }}>🌐</span>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#f3f4f6" }}>
                  2. Dynamic Landing Page (/m/[token])
                </h3>
              </div>
              <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 16px 0", lineHeight: "1.4" }}>
                The full message rendered on the protected page. Each person's name and sex will be substituted automatically.
              </p>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                  Page Content
                </label>
                <textarea
                  rows={8}
                  value={landingContent}
                  onFocus={() => setFocusedField("landing")}
                  onChange={(e) => setLandingContent(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "#182234",
                    border: "1px solid #374151",
                    padding: "12px",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                />
              </div>

              {/* Toggles */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #1f2937", paddingTop: "14px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={allowReplies}
                    onChange={(e) => setAllowReplies(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "#6366f1" }}
                  />
                  <span>
                    <strong>Enable Recipient Replies</strong> (Shows private reply box on the page)
                  </span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={requireOtp}
                    onChange={(e) => setRequireOtp(e.target.checked)}
                    style={{ width: "16px", height: "16px", accentColor: "#6366f1" }}
                  />
                  <span>Require 6-digit OTP verification email before opening</span>
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
            <button
              onClick={() => setActiveStep("audience")}
              style={{
                background: "#1f2937",
                color: "#cbd5e1",
                border: "1px solid #374151",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              ← Back to Audience
            </button>
            <button
              onClick={() => setActiveStep("preview")}
              style={{
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.4)",
              }}
            >
              Continue to Live Preview →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: LIVE PREVIEW */}
      {activeStep === "preview" && (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 4px 0" }}>Interactive Live Preview</h2>
              <p style={{ color: "#9ca3af", fontSize: "14px", margin: 0 }}>
                Test how the variables swap for different recipients.
              </p>
            </div>

            {/* Recipient switcher */}
            {mode === "personalized" && recipients.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#182234", padding: "6px 12px", borderRadius: "8px", border: "1px solid #374151" }}>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>Preview as:</span>
                <select
                  value={selectedPreviewIdx}
                  onChange={(e) => setSelectedPreviewIdx(Number(e.target.value))}
                  style={{
                    background: "#0d131f",
                    border: "1px solid #4b5563",
                    color: "#fff",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  {recipients.map((r, i) => (
                    <option key={i} value={i}>
                      {r.first_name} ({r.sex || "No sex"} - {r.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {/* Tab Switcher: Email vs Landing */}
              <div style={{ display: "flex", background: "#1f2937", padding: "4px", borderRadius: "8px" }}>
                <button
                  type="button"
                  onClick={() => setPreviewTab("email")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    background: previewTab === "email" ? "#4f46e5" : "transparent",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  ✉️ Email Inbox View
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("landing")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    background: previewTab === "landing" ? "#4f46e5" : "transparent",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  🌐 Private Web Page View
                </button>
              </div>

              {/* Device Viewport Mode Switcher */}
              <div style={{ display: "flex", background: "#1f2937", padding: "4px", borderRadius: "8px", gap: "2px" }}>
                <button
                  type="button"
                  onClick={() => setViewportMode("desktop")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: viewportMode === "desktop" ? "#374151" : "transparent",
                    color: viewportMode === "desktop" ? "#fff" : "#9ca3af",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  🖥️ Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode("mobile")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: viewportMode === "mobile" ? "#374151" : "transparent",
                    color: viewportMode === "mobile" ? "#fff" : "#9ca3af",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  📱 Mobile (375px)
                </button>
              </div>
            </div>
          </div>

          {/* Preview Container */}
          <div
            style={{
              background: "#0d131f",
              border: "1px solid #1f2937",
              borderRadius: "12px",
              padding: viewportMode === "mobile" ? "24px 12px" : "32px",
              minHeight: "380px",
            }}
          >
            {viewportMode === "mobile" ? (
              /* Smartphone Mockup Frame */
              <div
                style={{
                  width: "375px",
                  maxWidth: "100%",
                  margin: "0 auto",
                  background: "#030712",
                  borderRadius: "40px",
                  border: "8px solid #1f2937",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px #374151",
                  overflow: "hidden",
                }}
              >
                {/* Speaker Notch */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "10px 0 6px 0", background: "#0b0f19" }}>
                  <div style={{ width: "50px", height: "4px", borderRadius: "2px", background: "#334155" }} />
                </div>

                {/* Mobile Viewport Scroll Area */}
                <div
                  style={{
                    maxHeight: "560px",
                    overflowY: "auto",
                    padding: previewTab === "email" ? "0" : "12px",
                    background: previewTab === "email" ? "#ffffff" : "#0d131f",
                  }}
                >
                  {previewTab === "email" ? (
                    <div style={{ background: "#ffffff", color: "#1e293b" }}>
                      <div style={{ background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)", padding: "20px 16px", textAlign: "center", color: "#ffffff" }}>
                        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>Hello, {activeRecipient.first_name}!</h1>
                        <p style={{ margin: "4px 0 0 0", opacity: 0.9, fontSize: "12px" }}>A personal note from {orgName}</p>
                      </div>
                      <div style={{ padding: "18px 16px", fontSize: "14px", lineHeight: "1.6", color: "#334155" }}>
                        <p style={{ margin: "0 0 12px 0" }}>Hi <strong>{activeRecipient.first_name}</strong>,</p>
                        <div style={{ background: "#f8fafc", borderLeft: "4px solid #4f46e5", padding: "12px", margin: "14px 0", borderRadius: "4px", fontStyle: "italic", color: "#1e293b", fontSize: "13px" }}>
                          "{previewIntro}"
                        </div>
                        <p style={{ fontSize: "13px" }}>We created a private, interactive landing page for you to view more details and reply directly:</p>
                        <div style={{ textAlign: "center", margin: "20px 0" }}>
                          <span style={{ background: "#4f46e5", color: "#ffffff", padding: "10px 20px", borderRadius: "8px", fontWeight: "600", fontSize: "14px", display: "inline-block" }}>
                            {buttonText}
                          </span>
                        </div>
                      </div>
                      <div style={{ background: "#f9fafb", borderTop: "1px solid #e2e8f0", padding: "12px", textAlign: "center", fontSize: "10px", color: "#94a3b8" }}>
                        Delivered to {activeRecipient.email} · One-Click Unsubscribe
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", padding: "20px", color: "#f3f4f6" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                        <span style={{ fontSize: "10px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>
                          Verified Private Message
                        </span>
                      </div>
                      <h2 style={{ fontSize: "18px", fontWeight: "800", margin: "0 0 12px 0", color: "#fff" }}>
                        Hello, {activeRecipient.first_name}
                      </h2>
                      <div style={{ background: "#1f2937", borderLeft: "4px solid #6366f1", padding: "14px", borderRadius: "8px", margin: "14px 0", fontSize: "13px", lineHeight: "1.5", color: "#e2e8f0", whiteSpace: "pre-wrap" }}>
                        {previewLandingBody}
                      </div>
                      {allowReplies && (
                        <div style={{ marginTop: "16px", padding: "14px", background: "#182234", borderRadius: "8px", border: "1px solid #374151" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                            <span>💬</span>
                            <strong style={{ fontSize: "13px" }}>Reply to {orgName}</strong>
                          </div>
                          {mode === "broadcast" && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px", marginBottom: "8px" }}>
                              <input disabled placeholder="Your Name" style={{ background: "#0d131f", border: "1px solid #374151", padding: "6px 8px", borderRadius: "6px", fontSize: "11px", color: "#9ca3af" }} />
                              <input disabled placeholder="Your Email" style={{ background: "#0d131f", border: "1px solid #374151", padding: "6px 8px", borderRadius: "6px", fontSize: "11px", color: "#9ca3af" }} />
                            </div>
                          )}
                          <textarea disabled rows={2} placeholder="Write a confidential reply..." style={{ width: "100%", boxSizing: "border-box", background: "#0d131f", border: "1px solid #374151", padding: "6px 8px", borderRadius: "6px", fontSize: "11px", color: "#9ca3af" }} />
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                            <span style={{ background: "#4f46e5", color: "#fff", padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
                              Send Reply →
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Home Indicator Bar */}
                <div style={{ display: "flex", justifyContent: "center", padding: "8px 0", background: "#0b0f19" }}>
                  <div style={{ width: "90px", height: "4px", borderRadius: "2px", background: "#475569" }} />
                </div>
              </div>
            ) : previewTab === "email" ? (
              /* Desktop Email Inbox Simulator */
              <div
                style={{
                  maxWidth: "600px",
                  margin: "0 auto",
                  background: "#ffffff",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                  color: "#1e293b",
                }}
              >
                <div style={{ background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)", padding: "28px", textAlign: "center", color: "#ffffff" }}>
                  <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "700" }}>Hello, {activeRecipient.first_name}!</h1>
                  <p style={{ margin: "6px 0 0 0", opacity: 0.9, fontSize: "14px" }}>A personal note from {orgName}</p>
                </div>
                <div style={{ padding: "28px", fontSize: "15px", lineHeight: "1.6", color: "#334155" }}>
                  <p style={{ margin: "0 0 16px 0" }}>Hi <strong>{activeRecipient.first_name}</strong>,</p>
                  <div style={{ background: "#f8fafc", borderLeft: "4px solid #4f46e5", padding: "14px", margin: "18px 0", borderRadius: "4px", fontStyle: "italic", color: "#1e293b" }}>
                    "{previewIntro}"
                  </div>
                  <p>We created a private, interactive landing page for you to view more details and reply directly:</p>
                  <div style={{ textAlign: "center", margin: "28px 0" }}>
                    <span style={{ background: "#4f46e5", color: "#ffffff", padding: "12px 24px", borderRadius: "8px", fontWeight: "600", fontSize: "15px", display: "inline-block" }}>
                      {buttonText}
                    </span>
                  </div>
                </div>
                <div style={{ background: "#f9fafb", borderTop: "1px solid #e2e8f0", padding: "16px", textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
                  Delivered to {activeRecipient.email} · One-Click Unsubscribe
                </div>
              </div>
            ) : (
              /* Desktop Landing Page Simulator */
              <div
                style={{
                  maxWidth: "640px",
                  margin: "0 auto",
                  background: "#111827",
                  border: "1px solid #1f2937",
                  borderRadius: "16px",
                  padding: "36px",
                  color: "#f3f4f6",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                  <span style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>
                    Verified Private Message
                  </span>
                </div>
                <h2 style={{ fontSize: "24px", fontWeight: "800", margin: "0 0 16px 0", color: "#fff" }}>
                  Hello, {activeRecipient.first_name}
                </h2>
                <div style={{ background: "#1f2937", borderLeft: "4px solid #6366f1", padding: "18px", borderRadius: "8px", margin: "20px 0", fontSize: "15px", lineHeight: "1.6", color: "#e2e8f0", whiteSpace: "pre-wrap" }}>
                  {previewLandingBody}
                </div>

                {allowReplies && (
                  <div style={{ marginTop: "24px", padding: "18px", background: "#182234", borderRadius: "10px", border: "1px solid #374151" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <span>💬</span>
                      <strong style={{ fontSize: "14px" }}>Reply directly to {orgName}</strong>
                    </div>
                    {mode === "broadcast" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        <input disabled placeholder="Your Name" style={{ background: "#0d131f", border: "1px solid #374151", padding: "8px", borderRadius: "6px", fontSize: "12px", color: "#9ca3af" }} />
                        <input disabled placeholder="Your Email" style={{ background: "#0d131f", border: "1px solid #374151", padding: "8px", borderRadius: "6px", fontSize: "12px", color: "#9ca3af" }} />
                      </div>
                    )}
                    <textarea disabled rows={2} placeholder="Write a confidential reply..." style={{ width: "100%", boxSizing: "border-box", background: "#0d131f", border: "1px solid #374151", padding: "8px", borderRadius: "6px", fontSize: "12px", color: "#9ca3af" }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                      <span style={{ background: "#4f46e5", color: "#fff", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600" }}>
                        Send Reply →
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
            <button
              onClick={() => setActiveStep("compose")}
              style={{
                background: "#1f2937",
                color: "#cbd5e1",
                border: "1px solid #374151",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              ← Back to Compose
            </button>
            <button
              onClick={() => setActiveStep("export_send")}
              style={{
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.4)",
              }}
            >
              Proceed to Export & Send Options →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: EXPORT OR SEND */}
      {activeStep === "export_send" && (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 6px 0" }}>Fulfillment: Export Links or Send Directly</h2>
          <p style={{ color: "#9ca3af", fontSize: "14px", margin: "0 0 24px 0" }}>
            {mode === "personalized"
              ? "You can export the CSV with each person's unique dynamic link to use in your own mailer, OR send the intro emails directly through this platform."
              : "Your universal broadcast link is ready for WhatsApp, Telegram, or social media sharing."}
          </p>

          {/* Domain Verification Status Banner */}
          {mode === "personalized" && (
            <div
              style={{
                background: isDomainVerified ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                border: `1px solid ${isDomainVerified ? "#059669" : "#d97706"}`,
                borderRadius: "12px",
                padding: "16px 20px",
                marginBottom: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>{isDomainVerified ? "🛡️" : "⚠️"}</span>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: isDomainVerified ? "#34d399" : "#fbbf24" }}>
                    Sender Domain: {sendingDomain} ({isDomainVerified ? "Verified" : "Unverified"})
                  </div>
                  <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                    {isDomainVerified
                      ? "Custom DKIM & SPF active. Platform sends under your verified brand identity."
                      : "Unverified. You can still send via platform (will use safe fallback sender) or verify DNS."}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDomainModal(true)}
                style={{
                  background: "#1f2937",
                  color: "#e2e8f0",
                  border: "1px solid #4b5563",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                DNS Settings & Verification →
              </button>
            </div>
          )}

          {/* Action Cards */}
          {mode === "personalized" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "28px" }}>
              {/* Option A: Export CSV */}
              <div
                style={{
                  background: "#182234",
                  border: "1px solid #374151",
                  borderRadius: "14px",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "22px" }}>📥</span>
                    <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>Export CSV with Unique Links</h3>
                  </div>
                  <p style={{ fontSize: "13px", color: "#9ca3af", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                    Generate individual token-protected pages for all {recipients.length} recipients, and download a CSV with
                    `email, first_name, sex, landing_link`.
                  </p>
                  <div style={{ background: "#0d131f", padding: "10px", borderRadius: "6px", fontSize: "12px", color: "#64748b", fontFamily: "monospace", marginBottom: "20px" }}>
                    email, first_name, sex, landing_link
                  </div>
                </div>

                <div>
                  <button
                    disabled={loading}
                    onClick={() => handleGenerate(false)}
                    style={{
                      width: "100%",
                      background: "#059669",
                      color: "#fff",
                      border: "none",
                      padding: "12px",
                      borderRadius: "8px",
                      fontWeight: "700",
                      fontSize: "14px",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(5, 150, 105, 0.4)",
                    }}
                  >
                    {loading ? "Generating..." : "Generate & Download CSV Links →"}
                  </button>
                </div>
              </div>

              {/* Option B: Send via Platform */}
              <div
                style={{
                  background: "#182234",
                  border: "1px solid #374151",
                  borderRadius: "14px",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "22px" }}>🚀</span>
                    <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>Send via Our Platform</h3>
                  </div>
                  <p style={{ fontSize: "13px", color: "#9ca3af", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                    We automatically dispatch the customized intro email to each person's inbox with their unique button link to the private dynamic page.
                  </p>
                  <ul style={{ margin: "0 0 20px 0", paddingLeft: "20px", fontSize: "12px", color: "#9ca3af", lineHeight: "1.6" }}>
                    <li>Delivers via background engine (Listmonk + BullMQ)</li>
                    <li>Immune to email scanner false-open tracking</li>
                    <li>Direct two-way replies delivered to your Inbox tab</li>
                  </ul>
                </div>

                <div>
                  <button
                    disabled={loading}
                    onClick={() => handleGenerate(true)}
                    style={{
                      width: "100%",
                      background: "#4f46e5",
                      color: "#fff",
                      border: "none",
                      padding: "12px",
                      borderRadius: "8px",
                      fontWeight: "700",
                      fontSize: "14px",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(79, 70, 229, 0.4)",
                    }}
                  >
                    {loading ? "Dispatching..." : "Launch & Send via Platform Now →"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Broadcast WhatsApp Share Card */
            <div style={{ background: "#182234", border: "1px solid #374151", borderRadius: "14px", padding: "28px", maxWidth: "600px", margin: "0 auto 28px auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <span style={{ fontSize: "28px" }}>💬</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>WhatsApp & Social Broadcast Link</h3>
                  <span style={{ fontSize: "12px", color: "#9ca3af" }}>Single shared link for groups</span>
                </div>
              </div>
              <p style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: "1.5", marginBottom: "20px" }}>
                Click below to generate the universal link. Anyone in your WhatsApp group can open the page, and if they submit a reply, they will be prompted for their Name & Email.
              </p>
              <button
                disabled={loading}
                onClick={() => handleGenerate(false)}
                style={{
                  width: "100%",
                  background: "#25d366",
                  color: "#000",
                  border: "none",
                  padding: "12px",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                {loading ? "Generating..." : "Generate WhatsApp Broadcast Link →"}
              </button>
            </div>
          )}

          {/* Generated Result Display Banner */}
          {executionResult && (
            <div style={{ background: "#064e3b", border: "1px solid #059669", borderRadius: "12px", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#ecfdf5" }}>
                    ✓ Campaign Created & Active ({executionResult.campaignName})
                  </div>
                  <div style={{ fontSize: "13px", color: "#a7f3d0" }}>
                    {executionResult.dispatchViaPlatform
                      ? `Delivering ${executionResult.recipients.length} personalized emails with dynamic links.`
                      : mode === "broadcast"
                      ? "Public broadcast link is live and tracking views."
                      : `Successfully generated ${executionResult.recipients.length} unique recipient landing links.`}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  {executionResult.exportCsv && (
                    <button
                      onClick={downloadCsv}
                      style={{
                        background: "#ffffff",
                        color: "#064e3b",
                        border: "none",
                        padding: "8px 16px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      💾 Download Links CSV
                    </button>
                  )}
                  {executionResult.sharedUrl && (
                    <button
                      onClick={() => copyText(executionResult.sharedUrl!, "Broadcast Link Copied!")}
                      style={{
                        background: "#ffffff",
                        color: "#064e3b",
                        border: "none",
                        padding: "8px 16px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      {copyFeedback || "📋 Copy WhatsApp Link"}
                    </button>
                  )}
                </div>
              </div>

              {/* Sample link box */}
              <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px 16px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span style={{ fontSize: "13px", color: "#d1fae5", wordBreak: "break-all", fontFamily: "monospace" }}>
                  {executionResult.sharedUrl || executionResult.landingUrl}
                </span>
                <a
                  href={executionResult.sharedUrl || executionResult.landingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "#34d399",
                    fontSize: "13px",
                    fontWeight: "600",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Open Page ↗
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: REPLIES & INBOX */}
      {activeStep === "inbox" && (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 4px 0" }}>Recipient Replies & Responses</h2>
              <p style={{ color: "#9ca3af", fontSize: "14px", margin: 0 }}>
                Two-way communication from both personalized contact links and WhatsApp group respondents.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {repliesList.length > 0 && (
                <button
                  type="button"
                  onClick={exportRepliesCsv}
                  style={{
                    background: "#065f46",
                    border: "1px solid #059669",
                    color: "#a7f3d0",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  📥 Export Replies to CSV ({repliesList.length})
                </button>
              )}
              {executionResult?.campaignId && (
                <button
                  onClick={() => fetchReplies(executionResult.campaignId)}
                  style={{
                    background: "#1f2937",
                    border: "1px solid #374151",
                    color: "#cbd5e1",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  ↻ Refresh Replies
                </button>
              )}
            </div>
          </div>

          {loadingReplies ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>Loading replies...</div>
          ) : repliesList.length === 0 ? (
            <div style={{ border: "2px dashed #1f2937", borderRadius: "12px", padding: "48px 24px", textAlign: "center" }}>
              <span style={{ fontSize: "36px" }}>📬</span>
              <h3 style={{ fontSize: "16px", color: "#e2e8f0", margin: "12px 0 6px 0" }}>No replies received yet</h3>
              <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 16px 0", maxWidth: "450px", marginLeft: "auto", marginRight: "auto" }}>
                When recipients open their private page and submit a reply, it will appear here instantly with their profile details.
              </p>
              {executionResult?.landingUrl && (
                <a
                  href={executionResult.landingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "#4f46e5",
                    color: "#fff",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  Test Sending a Reply on Landing Page ↗
                </a>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {repliesList.map((reply) => (
                <div
                  key={reply.id}
                  style={{
                    background: "#182234",
                    border: "1px solid #1f2937",
                    borderRadius: "10px",
                    padding: "18px 20px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontSize: "15px", color: "#fff" }}>{reply.name}</strong>
                      <span style={{ fontSize: "12px", color: "#60a5fa" }}>({reply.email})</span>
                      {reply.sex && (
                        <span style={{ fontSize: "11px", background: "#312e81", color: "#c7d2fe", padding: "1px 6px", borderRadius: "4px" }}>
                          {reply.sex}
                        </span>
                      )}
                      {reply.isBroadcast && (
                        <span style={{ fontSize: "11px", background: "#064e3b", color: "#6ee7b7", padding: "1px 6px", borderRadius: "4px" }}>
                          WhatsApp / Public Reply
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      {new Date(reply.createdAt).toLocaleTimeString()} · {new Date(reply.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <p style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#e2e8f0", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                    "{reply.body}"
                  </p>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <a
                      href={`mailto:${reply.email}?subject=Re: Your update&body=Hi ${reply.name},\n\n`}
                      style={{
                        fontSize: "12px",
                        color: "#a5b4fc",
                        textDecoration: "none",
                        fontWeight: "600",
                      }}
                    >
                      Reply to {reply.email} ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DOMAIN VERIFICATION MODAL */}
      {showDomainModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: "16px",
              padding: "28px",
              maxWidth: "580px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>Domain Verification (DKIM & SPF)</h3>
              <button
                onClick={() => setShowDomainModal(false)}
                style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: "13px", color: "#9ca3af", lineHeight: "1.5", margin: "0 0 18px 0" }}>
              To ensure emails arrive in inboxes instead of spam folders, verify your sending domain with your DNS provider (Cloudflare, GoDaddy, AWS Route53).
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
                Domain Name
              </label>
              <input
                type="text"
                value={sendingDomain}
                onChange={(e) => setSendingDomain(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#0d131f",
                  border: "1px solid #374151",
                  padding: "10px",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "13px",
                }}
              />
            </div>

            <div style={{ background: "#0d131f", border: "1px solid #1f2937", borderRadius: "8px", padding: "14px", marginBottom: "18px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#a5b4fc", marginBottom: "6px" }}>
                Required DNS TXT Records:
              </div>
              <div style={{ fontSize: "11px", color: "#cbd5e1", fontFamily: "monospace", lineHeight: "1.6" }}>
                <strong>SPF:</strong> TXT @ "v=spf1 include:_spf.{sendingDomain} ~all"<br />
                <strong>DMARC:</strong> TXT _dmarc "v=DMARC1; p=none; sp=none;"
              </div>
            </div>

            {domainCheckMessage && (
              <div
                style={{
                  padding: "10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  marginBottom: "16px",
                  background: domainCheckMessage.startsWith("✓") ? "#064e3b" : "#451a03",
                  color: domainCheckMessage.startsWith("✓") ? "#6ee7b7" : "#fde68a",
                }}
              >
                {domainCheckMessage}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowDomainModal(false)}
                style={{
                  background: "#1f2937",
                  color: "#cbd5e1",
                  border: "1px solid #374151",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={verifyingDomain}
                onClick={handleVerifyDomain}
                style={{
                  background: "#4f46e5",
                  color: "#fff",
                  border: "none",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {verifyingDomain ? "Querying DNS..." : "Check DNS Records Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
