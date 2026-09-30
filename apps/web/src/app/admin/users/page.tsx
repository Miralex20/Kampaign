"use client";

import React, { useEffect, useState } from "react";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer" | "member";
  created_at: string;
  org_id: string;
  org_name: string;
  org_plan: string;
  org_daily_cap: number;
  org_review_state: string;
  org_sending_domain: string | null;
  org_domain_verified_at: string | null;
}

interface OrgOption {
  id: string;
  name: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Provision user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<"owner" | "admin" | "editor" | "viewer">("owner");
  const [createOrgMode, setCreateOrgMode] = useState<"existing" | "new">("existing");
  const [createOrgId, setCreateOrgId] = useState("");
  const [createNewOrgName, setCreateNewOrgName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  async function fetchUsers() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter && roleFilter !== "all") params.set("role", roleFilter);

      const [usersRes, orgsRes] = await Promise.all([
        fetch(`/api/admin/users?${params.toString()}`),
        fetch("/api/admin/organizations"),
      ]);

      if (usersRes.ok) {
        const json = await usersRes.json();
        setUsers(json.data);
      }
      if (orgsRes.ok) {
        const json = await orgsRes.json();
        setOrgs(json.data);
        if (json.data.length > 0 && !createOrgId) {
          setCreateOrgId(json.data[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, roleFilter]);

  async function handleRoleChange(
    userId: string,
    newRole: "owner" | "admin" | "editor" | "viewer" | "member",
  ) {
    try {
      setUpdatingId(userId);
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        setFeedback(`User role successfully changed to ${newRole}`);
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      } else {
        const err = await res.json();
        setFeedback(`Error: ${err.error || "Failed to update role"}`);
      }
    } catch {
      setFeedback("Network error updating role");
    } finally {
      setUpdatingId(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!createEmail) return;

    try {
      setCreatingUser(true);
      const payload: Record<string, string> = {
        email: createEmail,
        role: createRole,
      };
      if (createName) payload["name"] = createName;
      if (createOrgMode === "existing") {
        payload["org_id"] = createOrgId;
      } else {
        payload["new_org_name"] = createNewOrgName;
      }

      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok) {
        setFeedback(`User ${createEmail} created successfully!`);
        setShowCreateModal(false);
        setCreateEmail("");
        setCreateName("");
        setCreateNewOrgName("");
        await fetchUsers();
      } else {
        setFeedback(`Error: ${json.error || "Failed to create user"}`);
      }
    } catch {
      setFeedback("Network error creating user");
    } finally {
      setCreatingUser(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            View all cross-tenant users, assign role privileges, and provision new accounts.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm flex items-center gap-1.5"
        >
          <span>+</span> Provision User
        </button>
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

      {/* Filters Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <input
            type="text"
            placeholder="Search by email or organization..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Role:
          </label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Superadmin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading user list...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No users found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">User Email</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Org Plan / Cap</th>
                  <th className="px-5 py-3">Role Privilege</th>
                  <th className="px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{u.name || u.email}</span>
                        {u.role === "admin" && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                            SUPERADMIN
                          </span>
                        )}
                      </div>
                      {u.name && (
                        <div className="text-xs font-normal text-slate-400">{u.email}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <div>{u.org_name}</div>
                      {u.org_sending_domain && (
                        <div className="text-xs text-slate-400">{u.org_sending_domain}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      <div className="capitalize font-medium text-slate-800">{u.org_plan}</div>
                      <div className="text-slate-500">
                        {u.org_daily_cap.toLocaleString()} daily cap
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={u.role}
                        disabled={updatingId === u.id}
                        onChange={(e) =>
                          handleRoleChange(
                            u.id,
                            e.target.value as "owner" | "admin" | "editor" | "viewer" | "member",
                          )
                        }
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border focus:outline-none transition cursor-pointer ${
                          u.role === "admin"
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                            : u.role === "owner"
                              ? "bg-purple-50 border-purple-200 text-purple-700"
                              : u.role === "editor"
                                ? "bg-blue-50 border-blue-200 text-blue-700"
                                : "bg-slate-50 border-slate-300 text-slate-700"
                        }`}
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Superadmin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provision User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Provision User Account</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  User Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@company.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Alex Taylor"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Target Organization
                </label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="orgMode"
                      checked={createOrgMode === "existing"}
                      onChange={() => setCreateOrgMode("existing")}
                    />
                    <span>Existing Organization</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="orgMode"
                      checked={createOrgMode === "new"}
                      onChange={() => setCreateOrgMode("new")}
                    />
                    <span>Create New Organization</span>
                  </label>
                </div>

                {createOrgMode === "existing" ? (
                  <select
                    value={createOrgId}
                    onChange={(e) => setCreateOrgId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required={createOrgMode === "new"}
                    placeholder="New Company / Tenant Name"
                    value={createNewOrgName}
                    onChange={(e) => setCreateNewOrgName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Initial Role Privilege
                </label>
                <select
                  value={createRole}
                  onChange={(e) =>
                    setCreateRole(e.target.value as "owner" | "admin" | "editor" | "viewer")
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white transition"
                >
                  <option value="owner">Owner (Full tenant administration)</option>
                  <option value="admin">Superadmin (System-wide admin)</option>
                  <option value="editor">Editor (Templates & audience)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
                >
                  {creatingUser ? "Provisioning..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
