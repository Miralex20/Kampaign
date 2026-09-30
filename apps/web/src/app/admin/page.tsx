"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface StatsData {
  totalUsers: number;
  totalCampaigns: number;
  campaignsInReview: number;
  totalOrganizations: number;
  suspendedOrganizations: number;
  totalRecipients: number;
  totalMessages: number;
  totalReplies: number;
  totalVerifiedReads: number;
  pendingReviewList: Array<{
    id: string;
    name: string;
    campaign_mode: string;
    status: string;
    created_at: string;
    org_id: string;
    org_name: string;
  }>;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function loadStats() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const json = await res.json();
        setStats(json.data);
      }
    } catch (err) {
      console.error("Failed to load admin stats:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function handleApprove(id: string) {
    try {
      setApprovingId(id);
      const res = await fetch(`/api/admin/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (res.ok) {
        setActionMessage(`Campaign approved successfully.`);
        await loadStats();
      } else {
        const err = await res.json();
        setActionMessage(`Error: ${err.error || "Approval failed"}`);
      }
    } catch {
      setActionMessage("Network error during approval");
    } finally {
      setApprovingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Superadmin Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitor system-wide deliverability, user registrations, and campaign review pipelines.
        </p>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Total Users
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {loading ? "..." : (stats?.totalUsers ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">cross-org accounts</span>
          </div>
          <div className="mt-3">
            <Link
              href="/admin/users"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
            >
              Manage users →
            </Link>
          </div>
        </div>

        {/* Total Campaigns */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Total Campaigns
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {loading ? "..." : (stats?.totalCampaigns ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">all modes</span>
          </div>
          <div className="mt-3">
            <Link
              href="/admin/campaigns"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
            >
              View campaigns →
            </Link>
          </div>
        </div>

        {/* Verified Reads */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Verified Page Reads
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-700">
              {loading ? "..." : (stats?.totalVerifiedReads ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600">beacon confirmed</span>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {stats?.totalReplies ?? 0} two-way replies received
          </div>
        </div>

        {/* Reviews & Suspensions */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Action Required
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div>
              <span
                className={`text-3xl font-extrabold ${
                  (stats?.campaignsInReview ?? 0) > 0 ? "text-amber-600" : "text-slate-900"
                }`}
              >
                {loading ? "..." : (stats?.campaignsInReview ?? 0)}
              </span>
              <span className="text-xs text-slate-500 ml-1">in review</span>
            </div>
            {(stats?.suspendedOrganizations ?? 0) > 0 && (
              <div className="border-l border-slate-200 pl-3">
                <span className="text-3xl font-extrabold text-rose-600">
                  {stats?.suspendedOrganizations}
                </span>
                <span className="text-xs text-slate-500 ml-1">suspended</span>
              </div>
            )}
          </div>
          <div className="mt-3">
            <Link
              href="/admin/organizations"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
            >
              Review organizations →
            </Link>
          </div>
        </div>
      </div>

      {/* Review Queue Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Campaigns Awaiting Admin Review
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review and approve pending campaigns before Mode A transactional dispatch can proceed.
            </p>
          </div>
          <Link
            href="/admin/campaigns?status=review"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View all ({stats?.campaignsInReview ?? 0})
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading review queue...</div>
        ) : (stats?.pendingReviewList.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <span className="text-emerald-600 font-medium">✓ All clear!</span> No campaigns are
            currently pending review.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Campaign Name</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Mode</th>
                  <th className="px-5 py-3">Submitted</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats?.pendingReviewList.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-5 py-4 text-slate-600">{c.org_name}</td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {c.campaign_mode}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleApprove(c.id)}
                        disabled={approvingId === c.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
                      >
                        {approvingId === c.id ? "Approving..." : "1-Click Approve"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Links & Management Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/admin/users"
          className="p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition block group"
        >
          <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition flex items-center justify-between">
            <span>User Management</span>
            <span className="text-slate-400 group-hover:text-indigo-600">→</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Search cross-tenant users, assign role privileges, and inspect member accounts.
          </p>
        </Link>

        <Link
          href="/admin/campaigns"
          className="p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition block group"
        >
          <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition flex items-center justify-between">
            <span>Campaigns Oversight</span>
            <span className="text-slate-400 group-hover:text-indigo-600">→</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Inspect live templates, pause active campaigns, and audit email/landing page payloads.
          </p>
        </Link>

        <Link
          href="/admin/organizations"
          className="p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition block group"
        >
          <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition flex items-center justify-between">
            <span>Organizations & Domains</span>
            <span className="text-slate-400 group-hover:text-indigo-600">→</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Audit SPF/DKIM/DMARC domain verification, adjust daily sending caps, and pause orgs.
          </p>
        </Link>
      </div>
    </div>
  );
}
