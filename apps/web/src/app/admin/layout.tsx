import React from "react";
import Link from "next/link";

export const metadata = {
  title: "Admin Console — Campaign Messaging",
  description: "Superadmin management console for users, campaigns, and organizations",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-sm group-hover:bg-indigo-700 transition">
              ADM
            </div>
            <div>
              <div className="font-bold text-slate-900 text-base leading-tight">Admin Console</div>
              <div className="text-xs text-slate-500 font-medium">Superadmin Control Plane</div>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 ml-4 border-l border-slate-200 pl-4">
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition"
            >
              Overview
            </Link>
            <Link
              href="/admin/campaigns"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition"
            >
              Campaigns
            </Link>
            <Link
              href="/admin/users"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition"
            >
              Users
            </Link>
            <Link
              href="/admin/organizations"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition"
            >
              Organizations
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Operational
          </div>
          <Link
            href="/"
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition flex items-center gap-1.5 shadow-sm"
          >
            <span>←</span> Back to Studio
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">{children}</main>
    </div>
  );
}
