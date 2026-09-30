"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface DnsRecordCheck {
  passed: boolean;
  expected: string;
  actual: string | null;
  host: string;
  type: string;
  details: string;
}

interface DomainData {
  domain: string | null;
  is_verified: boolean;
  domain_verified_at: string | null;
  checks: {
    spf: DnsRecordCheck;
    dmarc: DnsRecordCheck;
    dkim: DnsRecordCheck;
    mx: {
      passed: boolean;
      records: string[];
      host: string;
      details: string;
    };
  };
  checked_at: string;
  guidance: {
    what_is_verified: string;
    propagation_info: string;
  };
}

export default function DomainVerificationPage() {
  const [data, setData] = useState<DomainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [editingDomain, setEditingDomain] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchDomainStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/org/verify-domain");
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        if (json.data?.domain) {
          setDomainInput(json.data.domain);
        }
      }
    } catch (err) {
      console.error("Failed to load domain status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDomainStatus();
  }, [fetchDomainStatus]);

  async function handleVerifyNow() {
    if (!domainInput.trim()) return;
    setVerifying(true);
    setFeedbackMessage(null);

    try {
      const res = await fetch("/api/org/verify-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim().toLowerCase() }),
      });
      const result = await res.json();

      if (res.ok && result.data?.verified) {
        setFeedbackMessage({
          type: "success",
          text: "✓ Domain verified successfully! All DNS records are active and authenticated.",
        });
        setEditingDomain(false);
        await fetchDomainStatus();
      } else {
        setFeedbackMessage({
          type: "error",
          text: result.message || "DNS verification is still pending. Please check that records match your DNS provider.",
        });
        await fetchDomainStatus();
      }
    } catch {
      setFeedbackMessage({
        type: "error",
        text: "Network or DNS query error. Please verify the domain name format and try again.",
      });
    } finally {
      setVerifying(false);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const activeDomain = domainInput || data?.domain || "yourcompany.com";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Header */}
      <header className="w-full border-b border-slate-200 bg-white px-4 lg:px-8 h-16 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              KM
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Kampaign</span>
          </Link>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-800 transition">
              Studio
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Domain & Deliverability</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/team"
            className="text-xs font-medium px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
          >
            👥 Team Members
          </Link>
          <Link
            href="/"
            className="text-xs font-semibold px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            Back to Studio
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto p-4 lg:p-8 space-y-6">
        {/* Page Title & Overview */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Domain & Deliverability Verification
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Authenticate your custom sending domain using SPF, DKIM, and DMARC to guarantee executive inbox placement and prevent spam classification.
            </p>
          </div>

          <button
            type="button"
            onClick={handleVerifyNow}
            disabled={verifying || loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer self-start sm:self-auto"
          >
            {verifying ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Querying DNS Live...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Check DNS Records Now</span>
              </>
            )}
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div
            className={`p-4 rounded-xl text-xs font-medium border flex items-start gap-3 ${
              feedbackMessage.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            <span className="text-base">{feedbackMessage.type === "success" ? "✓" : "⚠️"}</span>
            <div className="leading-relaxed">{feedbackMessage.text}</div>
          </div>
        )}

        {/* Real-Time Status Hero Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${
                  data?.is_verified
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-amber-100 text-amber-700 border border-amber-200"
                }`}
              >
                {data?.is_verified ? "🛡️" : "⏳"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 m-0">
                    {data?.domain || "No domain assigned"}
                  </h2>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      data?.is_verified
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {data?.is_verified ? "Authenticated & Verified" : "Pending DNS Propagation"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 m-0">
                  {data?.is_verified && data.domain_verified_at ? (
                    <>
                      Verified on{" "}
                      <strong>
                        {new Date(data.domain_verified_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </strong>
                    </>
                  ) : (
                    "Add the DNS records below to your domain registrar (e.g. Cloudflare, Route 53, GoDaddy)."
                  )}
                </p>
              </div>
            </div>

            {/* Change Domain Button */}
            {!editingDomain ? (
              <button
                type="button"
                onClick={() => setEditingDomain(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
              >
                Change Sending Domain
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="e.g. mail.acme.com"
                  className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                />
                <button
                  type="button"
                  onClick={handleVerifyNow}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Save & Check
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDomain(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Telemetry Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  SPF Protocol
                </span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                  {data?.checks?.spf?.passed ? "Active (Authorized)" : "Not Detected"}
                </span>
              </div>
              <span
                className={`w-3 h-3 rounded-full ${
                  data?.checks?.spf?.passed ? "bg-emerald-500 ring-4 ring-emerald-100" : "bg-amber-400 ring-4 ring-amber-100"
                }`}
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  DMARC Policy
                </span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                  {data?.checks?.dmarc?.passed ? "Active (Enforced)" : "Not Detected"}
                </span>
              </div>
              <span
                className={`w-3 h-3 rounded-full ${
                  data?.checks?.dmarc?.passed ? "bg-emerald-500 ring-4 ring-emerald-100" : "bg-amber-400 ring-4 ring-amber-100"
                }`}
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Deliverability Grade
                </span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                  {data?.is_verified ? "Grade A (100% Inboxing)" : "Shared Fallback Sender"}
                </span>
              </div>
              <span
                className={`w-3 h-3 rounded-full ${
                  data?.is_verified ? "bg-indigo-600 ring-4 ring-indigo-100" : "bg-slate-300"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Required DNS Records Table */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Required DNS Records</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Add these exact records to your DNS provider (Cloudflare, GoDaddy, AWS Route 53, etc.).
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Host: <strong className="text-slate-800">{activeDomain}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Host / Name</th>
                  <th className="py-2.5 px-3">Value / Data</th>
                  <th className="py-2.5 px-3 text-center">DNS Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* SPF Record */}
                <tr className="hover:bg-slate-50/50">
                  <td className="py-3.5 px-3 font-mono font-bold text-indigo-700">TXT</td>
                  <td className="py-3.5 px-3 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900">@</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard("@", "spf-host")}
                        className="text-[10px] text-slate-400 hover:text-indigo-600 px-1 py-0.5 rounded border border-slate-200"
                      >
                        {copiedKey === "spf-host" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-mono text-slate-700 max-w-md">
                    <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="truncate">{`v=spf1 include:_spf.${activeDomain} ~all`}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`v=spf1 include:_spf.${activeDomain} ~all`, "spf-val")}
                        className="text-[11px] font-sans font-semibold text-indigo-600 hover:text-indigo-700 shrink-0"
                      >
                        {copiedKey === "spf-val" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    {data?.checks?.spf?.actual && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        Live DNS response: <code className="text-emerald-700 font-mono">{data.checks.spf.actual}</code>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        data?.checks?.spf?.passed
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {data?.checks?.spf?.passed ? "✓ Active" : "⏳ Missing"}
                    </span>
                  </td>
                </tr>

                {/* DMARC Record */}
                <tr className="hover:bg-slate-50/50">
                  <td className="py-3.5 px-3 font-mono font-bold text-indigo-700">TXT</td>
                  <td className="py-3.5 px-3 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900">_dmarc</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard("_dmarc", "dmarc-host")}
                        className="text-[10px] text-slate-400 hover:text-indigo-600 px-1 py-0.5 rounded border border-slate-200"
                      >
                        {copiedKey === "dmarc-host" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-mono text-slate-700 max-w-md">
                    <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="truncate">v=DMARC1; p=none; sp=none;</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard("v=DMARC1; p=none; sp=none;", "dmarc-val")}
                        className="text-[11px] font-sans font-semibold text-indigo-600 hover:text-indigo-700 shrink-0"
                      >
                        {copiedKey === "dmarc-val" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    {data?.checks?.dmarc?.actual && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        Live DNS response: <code className="text-emerald-700 font-mono">{data.checks.dmarc.actual}</code>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        data?.checks?.dmarc?.passed
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {data?.checks?.dmarc?.passed ? "✓ Active" : "⏳ Missing"}
                    </span>
                  </td>
                </tr>

                {/* DKIM Signature */}
                <tr className="hover:bg-slate-50/50">
                  <td className="py-3.5 px-3 font-mono font-bold text-indigo-700">TXT</td>
                  <td className="py-3.5 px-3 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900">k1._domainkey</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard("k1._domainkey", "dkim-host")}
                        className="text-[10px] text-slate-400 hover:text-indigo-600 px-1 py-0.5 rounded border border-slate-200"
                      >
                        {copiedKey === "dkim-host" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-mono text-slate-700 max-w-md">
                    <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="truncate">v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard("v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY", "dkim-val")}
                        className="text-[11px] font-sans font-semibold text-indigo-600 hover:text-indigo-700 shrink-0"
                      >
                        {copiedKey === "dkim-val" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        data?.checks?.dkim?.passed
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {data?.checks?.dkim?.passed ? "✓ Active" : "Optional"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* How to Know if It Is Verified (Interactive Guide) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>💡</span>
            <span>How to Know When Your Domain Is Verified</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  1
                </span>
                <span>The Green "Authenticated & Verified" Shield</span>
              </h3>
              <p>
                When our live DNS resolver detects both your <code>SPF</code> and <code>DMARC</code> TXT records, the status indicator at the top switches to an emerald shield with your verification timestamp.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  2
                </span>
                <span>DNS Propagation Timing (2–15 Minutes)</span>
              </h3>
              <p>
                DNS changes are published across global recursive root nameservers. Most providers like Cloudflare and AWS Route 53 propagate within 2 minutes. If you use GoDaddy or Namecheap, it may take 10–15 minutes.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  3
                </span>
                <span>Cloudflare Users: Disable Proxying</span>
              </h3>
              <p>
                If using Cloudflare, ensure your DNS records are set to <strong>DNS Only</strong> (grey cloud icon). Proxying TXT records is not possible, but subdomains must not be HTTP-proxied for email sending.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                  4
                </span>
                <span>Custom Sender Address Unlocked</span>
              </h3>
              <p>
                Once verified, campaigns sent from your workspace will dispatch with your company's official domain in the <code>From:</code> and <code>Reply-To:</code> headers, ensuring zero spam filtering.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
