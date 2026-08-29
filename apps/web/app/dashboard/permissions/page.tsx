"use client";

import { apiFetch, apiEventSource } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, ShieldCheck, X, UserPlus, Edit, Trash2 } from "lucide-react";

export default function PermissionsPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  // Form States
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("ATTORNEY");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    const tenantId = (session?.user as any)?.tenantId;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch("/permissions/users");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      setLoading(false);
      return;
    }
    fetchUsers();
  }, [session, status, fetchUsers]);

  const getHeaders = () => ({ "Content-Type": "application/json" });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await apiFetch("/permissions/users", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email, name, role })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to invite user");
      
      setIsInviteOpen(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await apiFetch(`/permissions/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ role })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      
      setIsEditOpen(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!window.confirm("Are you sure you want to completely remove this user from the tenant? This will also revoke their access to all cases.")) {
      return;
    }

    try {
      const res = await apiFetch(`/permissions/users/${userId}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      
      fetchUsers();
    } catch (err: any) {
      alert("Error removing user: " + err.message);
    }
  };

  const resetForm = () => {
    setEmail("");
    setName("");
    setRole("ATTORNEY");
    setError("");
    setSelectedUser(null);
  };

  const openEdit = (user: any) => {
    setSelectedUser(user);
    setRole(user.role);
    setIsEditOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#161B22] text-white p-8 font-sans">
      <header className="mb-8 border-b border-[#D4AF37]/20 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-[#D4AF37] flex items-center">
            <ShieldCheck className="w-6 h-6 mr-3" />
            Permissions & Access
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage user roles and case-level access control.
          </p>
        </div>
      </header>

      <div className="bg-[#0B0E14] border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Tenant Users</h2>
          <button 
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center bg-[#161B22] border border-[#D4AF37]/50 hover:bg-[#D4AF37]/10 hover:border-[#D4AF37] px-4 py-2 rounded-md text-sm transition-all text-[#D4AF37]"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite User
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 animate-pulse">Loading users...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#161B22] border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">System Role</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-800/50 hover:bg-[#161B22]/50 transition-colors">
                  <td className="p-4 font-medium text-gray-200">{user.name || "Unknown"}</td>
                  <td className="p-4 text-gray-400 text-sm">{user.email}</td>
                  <td className="p-4">
                    <span className={`text-xs px-3 py-1 rounded-full border ${
                      user.role === 'ADMIN' ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30' : 
                      user.role === 'ATTORNEY' ? 'bg-blue-900/20 text-blue-400 border-blue-900/50' : 
                      'bg-purple-900/20 text-purple-400 border-purple-900/50'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-right flex justify-end gap-3">
                    <button 
                      onClick={() => openEdit(user)}
                      className="text-gray-400 hover:text-[#D4AF37] transition-colors p-1"
                      title="Edit Role"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {(session?.user as any)?.id !== user.id && (
                      <button 
                        onClick={() => handleRevoke(user.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors p-1"
                        title="Remove User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 italic">
                    No users found in this tenant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0B0E14] border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#161B22]">
                <h3 className="text-lg font-semibold text-white">Invite Team Member</h3>
                <button onClick={() => { setIsInviteOpen(false); resetForm(); }} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleInvite} className="p-6 space-y-4">
                {error && <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-sm">{error}</div>}
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                  <input 
                    type="email" required
                    className="w-full bg-[#161B22] border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-[#D4AF37]"
                    value={email} onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                  <input 
                    type="text" required
                    className="w-full bg-[#161B22] border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-[#D4AF37]"
                    value={name} onChange={e => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">System Role</label>
                  <select 
                    className="w-full bg-[#161B22] border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-[#D4AF37]"
                    value={role} onChange={e => setRole(e.target.value)}
                  >
                    <option value="ADMIN">Admin (Full Access)</option>
                    <option value="ATTORNEY">Attorney (Create Cases)</option>
                    <option value="INVESTIGATOR">Investigator</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => { setIsInviteOpen(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-[#D4AF37] text-black font-medium rounded hover:bg-[#F3E5AB] transition-colors disabled:opacity-50">
                    {submitting ? "Inviting..." : "Send Invite"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Role Modal */}
      <AnimatePresence>
        {isEditOpen && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0B0E14] border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#161B22]">
                <h3 className="text-lg font-semibold text-white">Edit User Access</h3>
                <button onClick={() => { setIsEditOpen(false); resetForm(); }} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleEdit} className="p-6 space-y-4">
                {error && <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-sm">{error}</div>}
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">User</label>
                  <div className="text-white p-2 bg-[#161B22] rounded border border-gray-800 opacity-70">
                    {selectedUser.name} ({selectedUser.email})
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">System Role</label>
                  <select 
                    className="w-full bg-[#161B22] border border-gray-700 rounded p-2 text-white focus:outline-none focus:border-[#D4AF37]"
                    value={role} onChange={e => setRole(e.target.value)}
                  >
                    <option value="ADMIN">Admin (Full Access)</option>
                    <option value="ATTORNEY">Attorney (Create Cases)</option>
                    <option value="INVESTIGATOR">Investigator</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => { setIsEditOpen(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-[#D4AF37] text-black font-medium rounded hover:bg-[#F3E5AB] transition-colors disabled:opacity-50">
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
