"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  permissions: Record<string, boolean>;
  status: string;
  last_active_at: string | null;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  status: string;
  expires_at: string;
  created_at: string;
}

interface OrgInfo {
  id: string;
  name: string;
  sending_domain: string | null;
  plan: string;
  daily_cap: number;
}

export default function TeamManagementPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [inviteCanLaunch, setInviteCanLaunch] = useState(false);
  const [inviteCanExport, setInviteCanExport] = useState(false);
  const [inviteCanAudience, setInviteCanAudience] = useState(true);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Edit permissions modal state
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState<"owner" | "admin" | "editor" | "viewer">("editor");
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [membersRes, invitesRes] = await Promise.all([
        fetch("/api/team/members"),
        fetch("/api/team/invites"),
      ]);

      if (membersRes.ok) {
        const json = await membersRes.json();
        setMembers(json.data.members);
        setOrg(json.data.organization);
        setCurrentUserId(json.data.currentUserId);
      }

      if (invitesRes.ok) {
        const json = await invitesRes.json();
        setInvites(json.data);
      }
    } catch (err) {
      console.error("Failed to load team data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;

    try {
      setSubmittingInvite(true);
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          permissions: {
            can_launch_campaigns: inviteCanLaunch,
            can_export_data: inviteCanExport,
            can_manage_audience: inviteCanAudience,
            can_manage_templates: true,
            can_view_replies: true,
          },
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setGeneratedInviteUrl(json.data.inviteUrl);
        setFeedback(`Invitation generated for ${inviteEmail}`);
        await loadData();
      } else {
        setFeedback(`Error: ${json.error || "Failed to invite"}`);
      }
    } catch {
      setFeedback("Network error generating invitation");
    } finally {
      setSubmittingInvite(false);
    }
  }

  async function handleRevokeInvite(id: string) {
    try {
      const res = await fetch(`/api/team/invites/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFeedback("Invitation revoked");
        await loadData();
      }
    } catch {
      setFeedback("Failed to revoke invite");
    }
  }

  async function handleRemoveMember(id: string, email: string) {
    if (!window.confirm(`Are you sure you want to remove ${email} from the organization?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/team/members/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFeedback(`Member ${email} removed`);
        await loadData();
      } else {
        const json = await res.json();
        setFeedback(`Error: ${json.error || "Failed to remove member"}`);
      }
    } catch {
      setFeedback("Network error removing member");
    }
  }

  async function handleSavePermissions() {
    if (!editingMember) return;
    try {
      setSavingPerms(true);
      const res = await fetch(`/api/team/members/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          permissions: editPerms,
        }),
      });

      if (res.ok) {
        setFeedback(`Permissions updated for ${editingMember.email}`);
        setEditingMember(null);
        await loadData();
      } else {
        const json = await res.json();
        setFeedback(`Error: ${json.error || "Failed to update permissions"}`);
      }
    } catch {
      setFeedback("Network error updating permissions");
    } finally {
      setSavingPerms(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                Workspace
              </span>
              <h1 className="text-2xl font-bold text-slate-900">
                {org?.name ?? "Team Management"}
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Invite teammates, assign role presets, and configure granular permissions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
            >
              ← Back to Studio
            </Link>
            <button
              onClick={() => {
                setGeneratedInviteUrl(null);
                setInviteEmail("");
                setShowInviteModal(true);
              }}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm flex items-center gap-1.5"
            >
              <span>+</span> Invite Teammate
            </button>
          </div>
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

        {/* Active Members Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Active Team Members ({members.length})
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              Plan: {org?.plan ?? "trial"} ({org?.daily_cap.toLocaleString()} daily cap)
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading members...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Capabilities</th>
                    <th className="px-5 py-3">Joined</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        <div>{m.name || m.email}</div>
                        {m.name && (
                          <div className="text-xs font-normal text-slate-400">{m.email}</div>
                        )}
                        {m.id === currentUserId && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 mt-1 inline-block">
                            YOU
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                            m.role === "owner"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : m.role === "admin"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : m.role === "editor"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {m.role === "owner" || m.role === "admin" ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200">
                              Full Capabilities
                            </span>
                          ) : (
                            <>
                              {m.permissions?.can_launch_campaigns ? (
                                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  Launch ✓
                                </span>
                              ) : (
                                <span className="text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  Launch ✗
                                </span>
                              )}
                              {m.permissions?.can_export_data ? (
                                <span className="text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                  Export CSV ✓
                                </span>
                              ) : (
                                <span className="text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  Export CSV ✗
                                </span>
                              )}
                              {m.permissions?.can_manage_audience && (
                                <span className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  Audience ✓
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                        {m.role !== "owner" && (
                          <>
                            <button
                              onClick={() => {
                                setEditingMember(m);
                                setEditRole(m.role);
                                setEditPerms(m.permissions || {});
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
                            >
                              Edit Capabilities
                            </button>
                            {m.id !== currentUserId && (
                              <button
                                onClick={() => handleRemoveMember(m.id, m.email)}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 transition"
                              >
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending Invitations Section */}
        {invites.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                Pending Invitations ({invites.filter((i) => i.status === "pending").length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Invited Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Expires</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invites.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-4 font-semibold text-slate-900">{inv.email}</td>
                      <td className="px-5 py-4 capitalize text-slate-700 text-xs font-medium">
                        {inv.role}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            inv.status === "pending"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {inv.status === "pending" && (
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Invite a Teammate</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {generatedInviteUrl ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-sm">
                  <strong>✓ Invitation Link Created!</strong>
                  <p className="text-xs text-emerald-700 mt-1">
                    Share this unique single-use link with your teammate. It will expire in 7 days.
                  </p>
                  <div className="mt-3 p-2 bg-white border border-emerald-300 rounded font-mono text-xs break-all select-all">
                    {generatedInviteUrl}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInviteUrl);
                      setFeedback("Link copied to clipboard!");
                    }}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Role Preset
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => {
                      const r = e.target.value as "admin" | "editor" | "viewer";
                      setInviteRole(r);
                      if (r === "admin") {
                        setInviteCanLaunch(true);
                        setInviteCanExport(true);
                        setInviteCanAudience(true);
                      } else if (r === "editor") {
                        setInviteCanLaunch(false);
                        setInviteCanExport(false);
                        setInviteCanAudience(true);
                      } else {
                        setInviteCanLaunch(false);
                        setInviteCanExport(false);
                        setInviteCanAudience(false);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  >
                    <option value="editor">Editor (Create templates, upload contacts)</option>
                    <option value="admin">Admin (Full campaign launch & management)</option>
                    <option value="viewer">Viewer (Read-only analytics and replies)</option>
                  </select>
                </div>

                {/* Granular Capabilities */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 uppercase">
                    Granular Capabilities
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteCanLaunch}
                      onChange={(e) => setInviteCanLaunch(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-0"
                    />
                    <span>Can launch live Mode A campaigns</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteCanExport}
                      onChange={(e) => setInviteCanExport(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-0"
                    />
                    <span>Can export contact & reply CSV data (PII)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteCanAudience}
                      onChange={(e) => setInviteCanAudience(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-0"
                    />
                    <span>Can import and manage audience lists</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
                  >
                    {submittingInvite ? "Generating Invite..." : "Generate Invitation"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Capabilities Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Member Capabilities</h3>
                <div className="text-xs text-slate-500">{editingMember.email}</div>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) =>
                    setEditRole(e.target.value as "owner" | "admin" | "editor" | "viewer")
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                <div className="text-xs font-bold text-slate-700 uppercase">Capabilities</div>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editPerms["can_launch_campaigns"])}
                    onChange={(e) =>
                      setEditPerms((prev) => ({
                        ...prev,
                        can_launch_campaigns: e.target.checked,
                      }))
                    }
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span>Can launch live Mode A campaigns</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editPerms["can_export_data"])}
                    onChange={(e) =>
                      setEditPerms((prev) => ({
                        ...prev,
                        can_export_data: e.target.checked,
                      }))
                    }
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span>Can export contact & reply CSV data (PII)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editPerms["can_manage_audience"])}
                    onChange={(e) =>
                      setEditPerms((prev) => ({
                        ...prev,
                        can_manage_audience: e.target.checked,
                      }))
                    }
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span>Can import and manage audience lists</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingPerms}
                  onClick={handleSavePermissions}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
                >
                  {savingPerms ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
