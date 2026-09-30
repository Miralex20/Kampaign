"use client";

import React, { useEffect, useState } from "react";

interface OrgRow {
  id: string;
  name: string;
  sending_domain: string | null;
  domain_verified_at: string | null;
  plan: "trial" | "starter" | "growth" | "enterprise";
  daily_cap: number;
  review_state: "approved" | "suspended" | "pending";
  created_at: string;
  userCount: number;
  campaignCount: number;
}

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function fetchOrgs() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (reviewFilter && reviewFilter !== "all") params.set("review_state", reviewFilter);

      const res = await fetch(`/api/admin/organizations?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrgs(json.data);
      }
    } catch (err) {
      console.error("Error loading organizations:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrgs();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, reviewFilter]);

  async function updateReviewState(
    orgId: string,
    newReviewState: "approved" | "suspended" | "pending",
  ) {
    try {
      setUpdatingId(orgId);
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_state: newReviewState }),
      });

      if (res.ok) {
        setFeedback(`Organization status updated to ${newReviewState}`);
        setOrgs((prev) =>
          prev.map((o) => (o.id === orgId ? { ...o, review_state: newReviewState } : o)),
        );
      } else {
        const err = await res.json();
        setFeedback(`Error: ${err.error || "Failed to update review state"}`);
      }
    } catch {
      setFeedback("Network error updating organization");
    } finally {
      setUpdatingId(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  }

  async function handleCapChange(orgId: string, currentCap: number) {
    const promptVal = window.prompt(
      "Enter new daily sending cap for this organization:",
      String(currentCap),
    );
    if (promptVal === null) return;
    const newCap = parseInt(promptVal, 10);
    if (isNaN(newCap) || newCap < 0) {
      alert("Invalid number");
      return;
    }

    try {
      setUpdatingId(orgId);
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_cap: newCap }),
      });

      if (res.ok) {
        setFeedback(`Daily cap updated to ${newCap.toLocaleString()}`);
        setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, daily_cap: newCap } : o)));
      } else {
        const err = await res.json();
        setFeedback(`Error: ${err.error || "Failed to update cap"}`);
      }
    } catch {
      setFeedback("Network error updating daily cap");
    } finally {
      setUpdatingId(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Organizations & Deliverability Oversight
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitor multi-tenant sending domains, manage daily dispatch caps, and pause organizations
          in response to complaint spikes.
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

      {/* Filter Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search organization by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Review State:
          </label>
          <select
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
          >
            <option value="all">All States</option>
            <option value="approved">Approved</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading organizations...</div>
        ) : orgs.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">No organizations found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Sending Domain</th>
                  <th className="px-5 py-3">Plan / Daily Cap</th>
                  <th className="px-5 py-3">Review Status</th>
                  <th className="px-5 py-3">Users / Campaigns</th>
                  <th className="px-5 py-3 text-right">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orgs.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      <div>{o.name}</div>
                      <div className="text-xs font-normal text-slate-400">
                        ID: {o.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {o.sending_domain ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              o.domain_verified_at ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                          ></span>
                          <span className="font-mono text-xs text-slate-800">
                            {o.sending_domain}
                          </span>
                          {o.domain_verified_at && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              SPF/DKIM ✓
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not configured</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <div className="capitalize font-semibold text-slate-800">{o.plan} plan</div>
                      <button
                        onClick={() => handleCapChange(o.id, o.daily_cap)}
                        className="text-indigo-600 hover:text-indigo-700 underline text-xs"
                      >
                        {o.daily_cap.toLocaleString()} daily cap ✎
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          o.review_state === "approved"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : o.review_state === "suspended"
                              ? "bg-rose-50 text-rose-800 border border-rose-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {o.review_state.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      <div>{o.userCount} users</div>
                      <div className="text-slate-500">{o.campaignCount} campaigns</div>
                    </td>
                    <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                      {o.review_state === "suspended" ? (
                        <button
                          onClick={() => updateReviewState(o.id, "approved")}
                          disabled={updatingId === o.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
                        >
                          Lift Suspension
                        </button>
                      ) : (
                        <button
                          onClick={() => updateReviewState(o.id, "suspended")}
                          disabled={updatingId === o.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition disabled:opacity-50"
                        >
                          Suspend Sending
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
