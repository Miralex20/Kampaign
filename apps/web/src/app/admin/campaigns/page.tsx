"use client";

import React, { useEffect, useState } from "react";

interface CampaignRow {
  id: string;
  name: string;
  campaign_mode: "managed_send" | "link_per_recipient" | "link_universal";
  status: "draft" | "review" | "approved" | "live" | "suspended" | "archived" | "completed";
  subject: string | null;
  preheader: string | null;
  email_html: string | null;
  page_html: string;
  require_otp: boolean;
  allow_replies: boolean;
  created_at: string;
  updated_at: string;
  org_id: string;
  org_name: string;
  org_sending_domain: string | null;
  org_review_state: string;
  totalMessages: number;
  verifiedReads: number;
  totalReplies: number;
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeModalCampaign, setActiveModalCampaign] = useState<CampaignRow | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  async function fetchCampaigns() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (modeFilter && modeFilter !== "all") params.set("mode", modeFilter);

      const res = await fetch(`/api/admin/campaigns?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setCampaigns(json.data);
      }
    } catch (err) {
      console.error("Error loading campaigns:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCampaigns();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, statusFilter, modeFilter]);

  async function updateStatus(campaignId: string, newStatus: CampaignRow["status"]) {
    try {
      setActionInProgressId(campaignId);
      const res = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setFeedback(`Campaign status updated to ${newStatus}`);
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaignId ? { ...c, status: newStatus } : c)),
        );
        if (activeModalCampaign?.id === campaignId) {
          setActiveModalCampaign((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
      } else {
        const err = await res.json();
        setFeedback(`Error: ${err.error || "Failed to update status"}`);
      }
    } catch {
      setFeedback("Network error updating status");
    } finally {
      setActionInProgressId(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  }

  async function handleDelete(campaignId: string, campaignName: string) {
    if (!window.confirm(`Are you sure you want to permanently delete "${campaignName}"?`)) {
      return;
    }

    try {
      setActionInProgressId(campaignId);
      const res = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFeedback(`Campaign "${campaignName}" was deleted.`);
        setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
        if (activeModalCampaign?.id === campaignId) {
          setActiveModalCampaign(null);
        }
      } else {
        const err = await res.json();
        setFeedback(`Error: ${err.error || "Failed to delete campaign"}`);
      }
    } catch {
      setFeedback("Network error deleting campaign");
    } finally {
      setActionInProgressId(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campaigns Oversight</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review, approve, pause, or audit campaigns across all organizations and delivery modes.
        </p>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter controls */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search campaign or organization..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
            >
              <option value="all">All Statuses</option>
              <option value="review">In Review</option>
              <option value="approved">Approved</option>
              <option value="live">Live</option>
              <option value="draft">Draft</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Mode filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Mode:
            </label>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
            >
              <option value="all">All Modes</option>
              <option value="managed_send">Managed Send (A)</option>
              <option value="link_per_recipient">Personal Links (B)</option>
              <option value="link_universal">Broadcast (C)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No campaigns found matching current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Campaign</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Mode</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Reads / Replies</th>
                  <th className="px-5 py-3 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      <div>{c.name}</div>
                      {c.subject && (
                        <div className="text-xs font-normal text-slate-500 truncate max-w-xs">
                          {c.subject}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <div>{c.org_name}</div>
                      {c.org_sending_domain && (
                        <div className="text-xs text-slate-400">{c.org_sending_domain}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {c.campaign_mode === "managed_send"
                          ? "We Send It"
                          : c.campaign_mode === "link_per_recipient"
                            ? "You Send It"
                            : "Broadcast"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          c.status === "review"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : c.status === "approved" || c.status === "live"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : c.status === "suspended"
                                ? "bg-rose-50 text-rose-800 border border-rose-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <div className="font-semibold text-slate-800">
                        {c.verifiedReads.toLocaleString()} reads
                      </div>
                      <div className="text-slate-500">
                        {c.totalReplies.toLocaleString()} replies
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
                      {/* Inspect button */}
                      <button
                        onClick={() => setActiveModalCampaign(c)}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
                      >
                        Inspect
                      </button>

                      {/* 1-Click Approve button if in review */}
                      {c.status === "review" && (
                        <button
                          onClick={() => updateStatus(c.id, "approved")}
                          disabled={actionInProgressId === c.id}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
                        >
                          Approve
                        </button>
                      )}

                      {/* Suspend / Pause if live */}
                      {(c.status === "live" || c.status === "approved") && (
                        <button
                          onClick={() => updateStatus(c.id, "suspended")}
                          disabled={actionInProgressId === c.id}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-50"
                        >
                          Pause
                        </button>
                      )}

                      {/* Resume if suspended */}
                      {c.status === "suspended" && (
                        <button
                          onClick={() => updateStatus(c.id, "approved")}
                          disabled={actionInProgressId === c.id}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition disabled:opacity-50"
                        >
                          Resume
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        disabled={actionInProgressId === c.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 transition disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspection Modal */}
      {activeModalCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{activeModalCampaign.name}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  Org: {activeModalCampaign.org_name} • Mode: {activeModalCampaign.campaign_mode}
                </div>
              </div>
              <button
                onClick={() => setActiveModalCampaign(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl px-2"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              {/* Meta metrics */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <span className="text-xs text-slate-500 uppercase font-semibold">
                    Current Status
                  </span>
                  <div className="font-bold text-slate-900 capitalize">
                    {activeModalCampaign.status}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 uppercase font-semibold">
                    Verified Reads
                  </span>
                  <div className="font-bold text-emerald-700">
                    {activeModalCampaign.verifiedReads.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 uppercase font-semibold">Replies</span>
                  <div className="font-bold text-indigo-700">
                    {activeModalCampaign.totalReplies.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Subject & Teaser */}
              {activeModalCampaign.subject && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-1">
                    Email Subject
                  </h4>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium">
                    {activeModalCampaign.subject}
                  </div>
                </div>
              )}

              {/* Security & Feature Flags */}
              <div className="flex gap-4">
                <div className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
                  OTP Protection:{" "}
                  <strong
                    className={
                      activeModalCampaign.require_otp ? "text-indigo-600" : "text-slate-500"
                    }
                  >
                    {activeModalCampaign.require_otp ? "Enabled" : "Disabled"}
                  </strong>
                </div>
                <div className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
                  Two-Way Replies:{" "}
                  <strong
                    className={
                      activeModalCampaign.allow_replies ? "text-emerald-600" : "text-slate-500"
                    }
                  >
                    {activeModalCampaign.allow_replies ? "Enabled" : "Disabled"}
                  </strong>
                </div>
              </div>

              {/* Page Content HTML Preview */}
              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">
                  Personalized Landing Content (HTML)
                </h4>
                <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-mono text-slate-600">
                    /m/[preview_token] Sandbox View
                  </div>
                  <div
                    className="p-5 max-h-64 overflow-y-auto prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: activeModalCampaign.page_html }}
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <div className="text-xs text-slate-500">
                Created on {new Date(activeModalCampaign.created_at).toLocaleString()}
              </div>
              <div className="flex items-center gap-2">
                {activeModalCampaign.status === "review" && (
                  <button
                    onClick={() => updateStatus(activeModalCampaign.id, "approved")}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
                  >
                    Approve Campaign
                  </button>
                )}
                <button
                  onClick={() => setActiveModalCampaign(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
