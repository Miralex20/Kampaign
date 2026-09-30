"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

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
  organization?: string;
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
  const [activeStep, setActiveStep] = useState<
    "audience" | "compose" | "preview" | "export_send" | "inbox"
  >("audience");

  // Mode Selection: "personalized" vs "broadcast"
  const [mode, setMode] = useState<"personalized" | "broadcast">("personalized");

  // Campaign Meta
  const [campaignName, setCampaignName] = useState("");

  // Contact list
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [csvRawText, setCsvRawText] = useState("");
  const [csvUploadFeedback, setCsvUploadFeedback] = useState<string | null>(null);

  // Template fields
  const [subject, setSubject] = useState("Confidential Executive Briefing for {{first_name}}");
  const [introTeaser, setIntroTeaser] = useState(
    "Hi {{first_name}}, as a valued {{sex|member}}, I wanted to personally reach out with our latest project update. Please review your personalized overview page below.",
  );
  const [buttonText, setButtonText] = useState("Open Confidential Briefing →");
  const [landingContent, setLandingContent] = useState(
    `Welcome, {{first_name}}!\n\nThis confidential briefing is prepared specifically for you.\nAs registered in our system (Identity: {{sex|client}}), your account has been provisioned with priority access.\n\nPlease read through the perimeter governance details below and feel free to send any questions directly through the verified reply box below.`,
  );
  const [allowReplies, setAllowReplies] = useState(true);
  const [requireOtp, setRequireOtp] = useState(false);

  // Active target field for variable pill insertion
  const [focusedField, setFocusedField] = useState<"subject" | "intro" | "landing">("intro");

  // Preview state
  const [previewTab, setPreviewTab] = useState<"email" | "landing">("landing");
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">("mobile");
  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0);

  // Domain Verification State
  const [sendingDomain, setSendingDomain] = useState(initialSendingDomain || "");
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
    const orgIdx = headers.findIndex((h) => h === "organization" || h === "company" || h === "org");

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
        const organization = orgIdx !== -1 && cols[orgIdx] ? cols[orgIdx] : "Client Partner";
        parsed.push({ email, first_name, sex, organization });
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

    const backendMode =
      mode === "broadcast"
        ? "link_universal"
        : dispatchViaPlatform
          ? "managed_send"
          : "link_per_recipient";

    try {
      const res = await fetch("/api/campaigns/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName || "Confidential Executive Briefing",
          campaignMode: backendMode,
          recipientsList: mode === "broadcast" ? [] : recipients,
          subject,
          message: introTeaser,
          pageHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 40px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; color: #0f172a; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
    <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></div>
    <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Confidential Message for {{first_name}}</span>
  </div>
  <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px 0; color: #0f172a;">Hello {{first_name}}</h1>
  <div style="background: #f8fafc; border-left: 3px solid #4f46e5; padding: 18px; border-radius: 6px; margin: 20px 0; font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap;">
${landingContent}
  </div>
  <p style="color: #64748b; line-height: 1.6; font-size: 13px; margin: 20px 0 0 0;">
    Recipient: <strong>{{email}}</strong> · Profile: <strong>{{sex|Direct Member}}</strong>
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
    link.setAttribute("download", `${(campaignName || "campaign").replace(/\s+/g, "_")}_personalized_links.csv`);
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
  const activeRecipient: RecipientRow = recipients[selectedPreviewIdx] ||
    recipients[0] || {
      email: userEmail || "recipient@company.com",
      first_name: "Sarah",
      sex: "Member",
      organization: "Enterprise Corp",
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
    <div className="flex flex-col gap-6">
      {/* 5-STEP WORKFLOW STEPPER BAR (Direct from Stitch) */}
      <nav className="w-full bg-white border border-slate-200 rounded-xl px-4 lg:px-6 shadow-subtle overflow-hidden">
        <div className="flex items-center justify-between overflow-x-auto custom-scrollbar">
          <div className="flex items-center space-x-6 sm:space-x-8 pt-3">
            {/* 1. Audience */}
            <button
              type="button"
              onClick={() => setActiveStep("audience")}
              className={`pb-3 flex items-center gap-2 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeStep === "audience"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full font-mono text-[11px] flex items-center justify-center ${
                  activeStep === "audience"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                1
              </span>
              <span>1. Audience</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  mode === "personalized"
                    ? recipients.length > 0
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-600"
                    : "bg-purple-100 text-purple-700"
                }`}
              >
                {mode === "personalized"
                  ? recipients.length > 0
                    ? `${recipients.length} VALID`
                    : "MANIFEST"
                  : "BROADCAST"}
              </span>
            </button>

            {/* 2. Compose */}
            <button
              type="button"
              onClick={() => setActiveStep("compose")}
              className={`pb-3 flex items-center gap-2 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeStep === "compose"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full font-mono text-[11px] flex items-center justify-center ${
                  activeStep === "compose"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                2
              </span>
              <span>2. Compose & Variables</span>
            </button>

            {/* 3. Preview */}
            <button
              type="button"
              onClick={() => setActiveStep("preview")}
              className={`pb-3 flex items-center gap-2 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeStep === "preview"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full font-mono text-[11px] flex items-center justify-center ${
                  activeStep === "preview"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                3
              </span>
              <span>3. Live Simulator</span>
            </button>

            {/* 4. Fulfillment */}
            <button
              type="button"
              onClick={() => setActiveStep("export_send")}
              className={`pb-3 flex items-center gap-2 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeStep === "export_send"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full font-mono text-[11px] flex items-center justify-center ${
                  activeStep === "export_send"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                4
              </span>
              <span>4. Fulfillment</span>
              {executionResult && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                  READY
                </span>
              )}
            </button>

            {/* 5. Verified Inbox */}
            <button
              type="button"
              onClick={() => {
                setActiveStep("inbox");
                if (executionResult?.campaignId) fetchReplies(executionResult.campaignId);
              }}
              className={`pb-3 flex items-center gap-2 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeStep === "inbox"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full font-mono text-[11px] flex items-center justify-center ${
                  activeStep === "inbox"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                5
              </span>
              <span>5. Verified Inbox</span>
              {repliesList.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 text-indigo-700">
                  {repliesList.length}
                </span>
              )}
            </button>
          </div>

          {/* Architecture Status */}
          <div className="hidden xl:flex items-center gap-2 pb-3 pt-3">
            <span className="text-xs text-slate-500">Security Architecture:</span>
            <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-800">
              DKIM: ed25519-sha256
            </span>
          </div>
        </div>
      </nav>

      {/* STEP 1: AUDIENCE & MODE */}
      {activeStep === "audience" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (Execution & Audience Panel) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Mode Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setMode("personalized")}
                className={`p-5 rounded-xl cursor-pointer transition-all border ${
                  mode === "personalized"
                    ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-sm font-bold ${
                      mode === "personalized" ? "text-indigo-900" : "text-slate-900"
                    }`}
                  >
                    Contact List (Personalized)
                  </span>
                  {mode === "personalized" && (
                    <span className="text-xs font-bold text-indigo-600">✓ Selected</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 m-0 leading-relaxed">
                  Import audience with custom attributes (Name, Sex, Org). Every recipient receives
                  their own private cryptographic link (`/m/[token]`).
                </p>
              </div>

              <div
                onClick={() => setMode("broadcast")}
                className={`p-5 rounded-xl cursor-pointer transition-all border ${
                  mode === "broadcast"
                    ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-sm font-bold ${
                      mode === "broadcast" ? "text-indigo-900" : "text-slate-900"
                    }`}
                  >
                    Group Broadcast (WhatsApp / Web)
                  </span>
                  {mode === "broadcast" && (
                    <span className="text-xs font-bold text-indigo-600">✓ Selected</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 m-0 leading-relaxed">
                  Generates a single universal campaign URL for WhatsApp groups. Respondents verify
                  identity directly via the 2-way briefing receipt.
                </p>
              </div>
            </div>

            {/* Campaign Protocol Title */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-subtle">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900 m-0">Campaign Execution & Protocol</h2>
                  <p className="text-xs text-slate-500 m-0">Establish immutable target parameters and briefing identity.</p>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">
                  ID: CMP-{new Date().getFullYear()}-098
                </span>
              </div>
              <div className="mt-4">
                <label className="block text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
                  Campaign Protocol Title
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. Q4 Strategic Briefing: Perimeter Defense Protocol"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none transition-all pr-10"
                  />
                  <span className="absolute right-3 top-3 text-slate-400 text-xs">🔒</span>
                </div>
              </div>
            </div>

            {/* Recipient Manifest Ingestion (Dropzone) */}
            {mode === "personalized" && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-subtle flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                    Recipient Manifest Ingestion
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                      .csv, UTF-8
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvRawText(
                          "email,first_name,sex,organization\nsarah.jenkins@enterprisecorp.io,Sarah,Female,Enterprise Corp\ndavid.vance@apexcap.internal,David,Male,Apex Sovereign Capital\nelena.rostova@helios-labs.ch,Elena,Female,Helios BioDefense Lab",
                        );
                        setCsvUploadFeedback("✓ Inserted standard CSV template into field below.");
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
                    >
                      Insert CSV Template
                    </button>
                  </div>
                </div>

                {/* CSV Textarea / Dropzone */}
                <div className="border-2 border-dashed border-slate-300 hover:border-indigo-600 rounded-xl p-4 bg-slate-50/50 transition-colors">
                  <textarea
                    rows={4}
                    placeholder="Paste CSV rows here: email, first_name, sex, organization"
                    value={csvRawText}
                    onChange={(e) => setCsvRawText(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  />
                  <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleCsvParse(csvRawText)}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                      >
                        Parse & Add Contacts
                      </button>
                      {recipients.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setRecipients([]);
                            setCsvUploadFeedback("Audience cleared.");
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-600 text-xs font-medium hover:bg-rose-50 transition-colors"
                        >
                          Clear Audience
                        </button>
                      )}
                    </div>
                    {csvUploadFeedback && (
                      <span
                        className={`text-xs font-medium ${
                          csvUploadFeedback.startsWith("✓") ? "text-emerald-700" : "text-rose-600"
                        }`}
                      >
                        {csvUploadFeedback}
                      </span>
                    )}
                  </div>
                </div>

                {/* Detected Variable Tokens */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Available Dynamic Tokens:</span>
                  {["first_name", "organization", "sex", "email", "token"].map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => copyText(`{{${tok}}}`, `Copied {{${tok}}}`)}
                      className="inline-flex items-center gap-1 font-mono text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 px-2 py-0.5 rounded transition-colors"
                      title="Click to copy token"
                    >
                      <span>{`{{${tok}}}`}</span>
                      <span className="text-[10px] text-slate-400">📋</span>
                    </button>
                  ))}
                  {copyFeedback && (
                    <span className="text-xs text-emerald-600 font-medium">{copyFeedback}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Verified Pipeline Sample Table & Telemetry */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="bg-white border border-slate-200 rounded-xl shadow-subtle flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">Verified Pipeline Sample</span>
                  {recipients.length > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Sanitized
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-slate-500">
                  {recipients.length > 0 ? `${recipients.length} Recipient(s)` : "Empty State"}
                </span>
              </div>

              {/* Table / Empty State */}
              <div className="overflow-x-auto max-h-[340px] custom-scrollbar">
                {recipients.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <span className="text-3xl block mb-2">📋</span>
                    <p className="text-sm font-semibold text-slate-900 m-0">No contacts imported yet</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      Use the "Insert CSV Template" button on the left to quickly test with verified enterprise recipients.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0">
                        <th className="py-2.5 px-4">NAME</th>
                        <th className="py-2.5 px-4">EMAIL</th>
                        <th className="py-2.5 px-4">TOKEN</th>
                        <th className="py-2.5 px-4 text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {recipients.slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-slate-900">
                            {r.first_name}
                            {r.organization && (
                              <span className="block text-[10px] text-slate-400 font-normal">
                                {r.organization}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">{r.email}</td>
                          <td className="py-2.5 px-4">
                            <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-indigo-600">
                              cmp_{r.email.split("@")[0]?.slice(0, 6) || "9a8f2c"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              SPF Valid
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pipeline Telemetry Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-3 gap-2 text-left">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">
                    Total Recipients
                  </span>
                  <span className="text-base font-bold text-slate-900">
                    {mode === "personalized" ? recipients.length : "Universal"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">
                    Deliverability
                  </span>
                  <span className="text-base font-bold text-emerald-700">99.8%</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase font-semibold">
                    Isolation Level
                  </span>
                  <span className="font-mono text-[11px] font-bold text-indigo-600">
                    Zero-Trust Cryptographic
                  </span>
                </div>
              </div>
            </div>

            {/* Stepper Next Action */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveStep("compose")}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-subtle inline-flex items-center gap-2"
              >
                <span>Proceed to Compose & Variables</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: COMPOSE & VARIABLES */}
      {activeStep === "compose" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 shadow-subtle">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6 flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900 m-0">Compose Briefing & Inject Variables</h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Customize the email invitation message and the confidential landing page experience.
              </p>
            </div>
            {/* Variable insertion buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 font-medium">Click to inject:</span>
              {["first_name", "sex", "organization", "email"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 text-xs font-mono font-medium text-slate-700 transition-colors"
                >
                  +{`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Email Notification */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 pb-2 border-b border-slate-100">
                1. Invitation Email Dispatch
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Subject Line</label>
                <input
                  type="text"
                  value={subject}
                  onFocus={() => setFocusedField("subject")}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Introductory Teaser Message (Markdown)
                </label>
                <textarea
                  rows={4}
                  value={introTeaser}
                  onFocus={() => setFocusedField("intro")}
                  onChange={(e) => setIntroTeaser(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Action Button Text</label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
                />
              </div>
            </div>

            {/* Right: Private Landing Page Content & Security Toggles */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 pb-2 border-b border-slate-100">
                2. Confidential Landing Page (`/m/[token]`)
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Private Briefing Body (Markdown)
                </label>
                <textarea
                  rows={6}
                  value={landingContent}
                  onFocus={() => setFocusedField("landing")}
                  onChange={(e) => setLandingContent(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none font-sans leading-relaxed"
                />
              </div>

              {/* Security & Feedback Controls */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Allow Verified 2-Way Replies</span>
                    <span className="text-[11px] text-slate-500 block">
                      Recipients can reply securely directly from their briefing page into your Inbox tab.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowReplies}
                    onChange={(e) => setAllowReplies(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-600"
                  />
                </label>

                <div className="h-px bg-slate-200" />

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Require Verification PIN / OTP</span>
                    <span className="text-[11px] text-slate-500 block">
                      Enhances perimeter defense by requiring an authentication token before viewing page.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={requireOtp}
                    onChange={(e) => setRequireOtp(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-600"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-slate-200 mt-6">
            <button
              type="button"
              onClick={() => setActiveStep("audience")}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              ← Back to Audience
            </button>
            <button
              type="button"
              onClick={() => setActiveStep("preview")}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-subtle"
            >
              Proceed to Live Simulator →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: LIVE SIMULATOR (Direct from Stitch) */}
      {activeStep === "preview" && (
        <div className="flex flex-col gap-6">
          {/* Top Control Bar */}
          <div className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-subtle flex-wrap gap-3">
            {/* Viewport Toggle */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewportMode("mobile")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewportMode === "mobile"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span>📱</span>
                <span>Mobile Device</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode("desktop")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewportMode === "desktop"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span>💻</span>
                <span>Desktop Browser</span>
              </button>
            </div>

            {/* Preview Target Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Previewing for:</span>
              <select
                value={selectedPreviewIdx}
                onChange={(e) => setSelectedPreviewIdx(Number(e.target.value))}
                className="bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-900 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-600"
              >
                {recipients.length > 0 ? (
                  recipients.map((r, i) => (
                    <option key={i} value={i}>
                      {r.first_name} ({r.email})
                    </option>
                  ))
                ) : (
                  <option value={0}>Sarah Jenkins (Executive Preview)</option>
                )}
              </select>
            </div>
          </div>

          {/* Simulator Canvas Well */}
          <div className="w-full bg-slate-100/60 border border-slate-200 rounded-2xl p-6 lg:p-10 flex justify-center items-center min-h-[640px]">
            {viewportMode === "mobile" ? (
              /* Mobile Hardware Bezel Frame (Stitch Design Specification) */
              <div className="w-full max-w-[380px] bg-slate-900 p-3 rounded-[40px] shadow-card border-4 border-slate-700 relative">
                {/* Speaker Notch */}
                <div className="w-32 h-4 bg-slate-900 rounded-full mx-auto mb-2 flex items-center justify-center gap-2">
                  <div className="w-10 h-1 bg-slate-700 rounded-full" />
                  <div className="w-2.5 h-2.5 bg-slate-800 rounded-full border border-slate-600" />
                </div>

                {/* Viewport Surface Inside Phone */}
                <div className="bg-white rounded-[26px] overflow-hidden flex flex-col h-[620px] border border-slate-200 text-left overflow-y-auto custom-scrollbar">
                  {/* Verified Header Strip */}
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>PROTOCOL / VERIFIED DISPATCH</span>
                      <span>Today, 09:41 AM</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[11px] font-bold text-slate-900">
                          {orgName} Encrypted Relay
                        </span>
                      </div>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                        SPF/DKIM Valid
                      </span>
                    </div>
                  </div>

                  {/* Body Content Stream */}
                  <div className="p-4 flex-1 flex flex-col gap-4">
                    {/* Header */}
                    <div className="border-b border-slate-100 pb-3">
                      <h2 className="text-base font-bold text-slate-900 tracking-tight m-0">
                        {previewSubject}
                      </h2>
                      <p className="text-[11px] text-slate-400 mt-1 m-0">
                        Classification: Confidential / Recipient Eyes Only
                      </p>
                    </div>

                    {/* Briefing Copy */}
                    <div className="text-xs text-slate-700 space-y-2.5 leading-relaxed font-sans">
                      <p>
                        Hello <span className="font-bold text-slate-900">{activeRecipient.first_name}</span>,
                      </p>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap">
                        {previewLandingBody}
                      </div>
                    </div>

                    {/* Confidential Vault Card */}
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 hover:border-indigo-600 transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[10px] text-indigo-700 font-bold">
                          ATTACHED SECURE ASSET
                        </span>
                        <span className="font-mono text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                          Expires in 72h
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center text-indigo-600 font-bold">
                          🔒
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate m-0">
                            CONFIDENTIAL-BRIEFING.pdf
                          </p>
                          <p className="font-mono text-[10px] text-slate-400 truncate m-0">
                            Encrypted Briefing Asset (1.4 MB)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Verified 2-Way Reply Box */}
                    {allowReplies && (
                      <div className="border border-slate-200 rounded-lg p-3 bg-white flex flex-col gap-2 mt-auto">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                            Direct Verified Response
                          </label>
                          <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            E2EE Channel Ready
                          </span>
                        </div>
                        <textarea
                          disabled
                          rows={2}
                          placeholder="Send an encrypted response directly to executive comms..."
                          className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 outline-none resize-none"
                        />
                        <button
                          type="button"
                          disabled
                          className="w-full py-1.5 px-3 rounded bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 opacity-90"
                        >
                          <span>Send Confidential Response</span>
                          <span>→</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bottom Phone Bar */}
                  <div className="py-2 flex justify-center bg-white">
                    <div className="w-24 h-1 bg-slate-300 rounded-full" />
                  </div>
                </div>
              </div>
            ) : (
              /* Desktop Browser Simulator Frame */
              <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
                {/* Browser Chrome */}
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                  </div>
                  <div className="flex-1 max-w-md mx-auto bg-white px-3 py-1 rounded border border-slate-200 text-xs font-mono text-slate-600 flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">🔒</span>
                    <span>https://kampaign.internal/m/cmp_9a8f2c</span>
                  </div>
                </div>

                {/* Browser Interior */}
                <div className="p-8 max-w-xl mx-auto flex flex-col gap-5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                      Confidential Briefing for {activeRecipient.first_name}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 m-0">{previewSubject}</h1>
                  <div className="bg-slate-50 border-l-4 border-indigo-600 p-4 rounded-r-lg text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {previewLandingBody}
                  </div>
                  {allowReplies && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs font-bold text-slate-900 mb-2">Direct Reply Module</div>
                      <textarea
                        disabled
                        rows={2}
                        placeholder="Write a confidential reply..."
                        className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-slate-700 outline-none mb-2"
                      />
                      <button
                        type="button"
                        disabled
                        className="px-4 py-1.5 rounded bg-indigo-600 text-white text-xs font-semibold"
                      >
                        Send Reply →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stepper Navigation Actions */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setActiveStep("compose")}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              ← Back to Compose
            </button>
            <button
              type="button"
              onClick={() => setActiveStep("export_send")}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-subtle"
            >
              Proceed to Fulfillment →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: FULFILLMENT & DISPATCH */}
      {activeStep === "export_send" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 shadow-subtle flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 m-0">Fulfillment: Export Links or Send Directly</h2>
            <p className="text-xs text-slate-500 mt-1 m-0">
              {mode === "personalized"
                ? "Export CSV with unique recipient tokens, OR dispatch emails directly through the background relay."
                : "Generate your universal broadcast link for WhatsApp, Telegram, or executive web channels."}
            </p>
          </div>

          {/* Domain Verification Status Banner */}
          {mode === "personalized" && (
            <div
              className={`p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3 ${
                isDomainVerified
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{isDomainVerified ? "🛡️" : "⚠️"}</span>
                <div>
                  <div className="text-sm font-bold">
                    Sender Domain: {sendingDomain || "Default Shared Domain"} (
                    {isDomainVerified ? "Verified" : "Unverified"})
                  </div>
                  <div className="text-xs text-slate-600">
                    {isDomainVerified
                      ? "Custom DKIM & SPF active. Platform sends under your verified brand identity."
                      : "Unverified. You can still send via platform (uses safe fallback relay) or verify DNS."}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDomainModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                DNS Settings & Verification →
              </button>
            </div>
          )}

          {/* Action Cards */}
          {mode === "personalized" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Option A: Export CSV */}
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="text-xl">📥</span>
                    <h3 className="text-base font-bold text-slate-900 m-0">Export CSV with Unique Links</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    Generate individual token-protected pages for all {recipients.length} recipients,
                    and download a CSV with `email, first_name, sex, organization, landing_link`.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleGenerate(false)}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors shadow-subtle"
                >
                  {loading ? "Generating..." : "Generate & Download CSV Links →"}
                </button>
              </div>

              {/* Option B: Direct Send */}
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="text-xl">🚀</span>
                    <h3 className="text-base font-bold text-slate-900 m-0">Send via Platform Relay</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    We automatically dispatch the customized invitation email to each person's inbox
                    with their single-use link to the private dynamic page.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleGenerate(true)}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 transition-colors shadow-subtle"
                >
                  {loading ? "Dispatching..." : "Launch & Send via Platform Now →"}
                </button>
              </div>
            </div>
          ) : (
            /* Broadcast Card */
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/60 max-w-lg mx-auto w-full text-center">
              <span className="text-3xl block mb-2">💬</span>
              <h3 className="text-base font-bold text-slate-900 m-0">WhatsApp & Public Broadcast Link</h3>
              <p className="text-xs text-slate-600 my-3 leading-relaxed">
                Generate the universal tokenized link for sharing in executive WhatsApp groups or client chats.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleGenerate(false)}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors shadow-subtle"
              >
                {loading ? "Generating..." : "Generate WhatsApp Broadcast Link →"}
              </button>
            </div>
          )}

          {/* Generated Result Display Banner */}
          {executionResult && (
            <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-sm font-bold text-emerald-900 block">
                    ✓ Campaign Created & Active ({executionResult.campaignName})
                  </span>
                  <span className="text-xs text-emerald-700">
                    {executionResult.dispatchViaPlatform
                      ? `Delivering ${executionResult.recipients.length} personalized emails with dynamic links.`
                      : mode === "broadcast"
                        ? "Public broadcast link is live and tracking views."
                        : `Successfully generated ${executionResult.recipients.length} unique recipient landing links.`}
                  </span>
                </div>
                <div className="flex gap-2">
                  {executionResult.exportCsv && (
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold hover:bg-emerald-50 transition-colors"
                    >
                      💾 Download Links CSV
                    </button>
                  )}
                  {executionResult.sharedUrl && (
                    <button
                      type="button"
                      onClick={() => copyText(executionResult.sharedUrl!, "Broadcast Link Copied!")}
                      className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold hover:bg-emerald-50 transition-colors"
                    >
                      {copyFeedback || "📋 Copy WhatsApp Link"}
                    </button>
                  )}
                </div>
              </div>

              {/* Sample Link Box */}
              <div className="bg-white p-3 rounded-lg border border-emerald-200 flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-emerald-800 break-all">
                  {executionResult.sharedUrl || executionResult.landingUrl}
                </span>
                <a
                  href={executionResult.sharedUrl || executionResult.landingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
                >
                  Open Page ↗
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: VERIFIED INBOX */}
      {activeStep === "inbox" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 shadow-subtle flex flex-col gap-5">
          <div className="flex justify-between items-center flex-wrap gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-xl font-bold text-slate-900 m-0">Recipient Replies & Responses</h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Two-way communication from both personalized contact links and WhatsApp group respondents.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {repliesList.length > 0 && (
                <button
                  type="button"
                  onClick={exportRepliesCsv}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors inline-flex items-center gap-1.5"
                >
                  <span>📥</span>
                  <span>Export Replies CSV ({repliesList.length})</span>
                </button>
              )}
              {executionResult?.campaignId && (
                <button
                  type="button"
                  onClick={() => fetchReplies(executionResult.campaignId)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  ↻ Refresh Replies
                </button>
              )}
            </div>
          </div>

          {loadingReplies ? (
            <div className="p-12 text-center text-slate-500 text-xs">Loading replies...</div>
          ) : repliesList.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center bg-slate-50/50">
              <span className="text-3xl block mb-2">📬</span>
              <h3 className="text-sm font-semibold text-slate-900 m-0">No replies received yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                When recipients open their private page and submit a reply, it will appear here instantly with their profile details.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {repliesList.map((reply) => (
                <div
                  key={reply.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2"
                >
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{reply.name}</span>
                      <span className="text-xs text-indigo-600 font-mono">({reply.email})</span>
                      {reply.sex && (
                        <span className="text-[10px] font-medium bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                          {reply.sex}
                        </span>
                      )}
                      {reply.isBroadcast && (
                        <span className="text-[10px] font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-800">
                          Public Broadcast
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(reply.createdAt).toLocaleTimeString()} ·{" "}
                      {new Date(reply.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="bg-white border-l-2 border-indigo-600 border border-slate-200 p-3 rounded-lg text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                    "{reply.body}"
                  </div>

                  <div className="flex justify-end">
                    <a
                      href={`mailto:${reply.email}?subject=Re: Your update&body=Hi ${reply.name},\n\n`}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      Reply via Email ↗
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg w-full shadow-card">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-base font-bold text-slate-900 m-0">Domain Verification (DKIM & SPF)</h3>
              <button
                type="button"
                onClick={() => setShowDomainModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              To guarantee deliverability into executive inboxes and avoid spam filters, verify your
              sending domain with SPF & DMARC records.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Domain Name</label>
              <input
                type="text"
                value={sendingDomain}
                onChange={(e) => setSendingDomain(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 outline-none focus:border-indigo-600"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 leading-relaxed mb-4">
              <strong className="block text-slate-900 font-sans mb-1 font-semibold">Required DNS Records:</strong>
              <div>SPF: TXT @ "v=spf1 include:_spf.{sendingDomain || "yourdomain.com"} ~all"</div>
              <div>DMARC: TXT _dmarc "v=DMARC1; p=none; sp=none;"</div>
            </div>

            {domainCheckMessage && (
              <div
                className={`p-3 rounded-lg text-xs font-medium mb-4 ${
                  domainCheckMessage.startsWith("✓")
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {domainCheckMessage}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Link
                href="/domain"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <span>Open Full Domain Manager</span>
                <span>→</span>
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDomainModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={verifyingDomain}
                  onClick={handleVerifyDomain}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {verifyingDomain ? "Querying DNS..." : "Check DNS Records Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
