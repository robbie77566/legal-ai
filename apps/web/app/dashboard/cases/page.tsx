"use client";

import { apiFetch, apiEventSource } from "@/lib/api";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FolderOpen, ChevronRight, Search, FileText } from "lucide-react";

export default function AllCasesPage() {
  const { data: session, status } = useSession();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user) {
      setLoading(false);
      return;
    }

    const fetchCases = async () => {
      try {
        const tenantId = (session?.user as any)?.tenantId || "";
        const userId = session?.user?.id || "";
        
        if (!tenantId) {
          console.error("No tenant ID found in session");
          setLoading(false);
          return;
        }

        const res = await apiFetch("/cases");
        const data = await res.json();
        if (Array.isArray(data)) {
          setCases(data);
        }
      } catch (e) {
        console.error("Failed to fetch cases", e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCases();
  }, [session, status]);

  const [editingCase, setEditingCase] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleDelete = async (caseId: string) => {
    if (!confirm("Are you sure you want to delete this workspace? This cannot be undone.")) return;
    
    try {
      const tenantId = (session?.user as any)?.tenantId || "";
      const userId = session?.user?.id || "";
      await apiFetch(`/cases/${caseId}`, { method: 'DELETE' });
      setCases(cases.filter(c => c.id !== caseId));
    } catch (e) {
      console.error("Failed to delete case", e);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingCase) return;
    try {
      const tenantId = (session?.user as any)?.tenantId || "";
      const userId = session?.user?.id || "";
      await apiFetch(`/cases/${editingCase.id}`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle })
      });
      setCases(cases.map(c => c.id === editingCase.id ? { ...c, title: editTitle } : c));
      setEditingCase(null);
    } catch (e) {
      console.error("Failed to update case", e);
    }
  };

  const filteredCases = cases.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#161B22] text-white p-8 font-sans">
      <header className="mb-8 border-b border-[#D4AF37]/20 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-[#D4AF37] flex items-center">
            <FolderOpen className="w-6 h-6 mr-3" />
            All Workspaces
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Browse, search, and manage all cases you have access to.
          </p>
        </div>
        <Link href="/dashboard" className="bg-[#161B22] border border-gray-600 hover:border-[#D4AF37] px-4 py-2 rounded-md text-sm transition-all">
          Back to Dashboard
        </Link>
      </header>

      <div className="bg-[#0B0E14] border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search by case title or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#161B22] border border-gray-700 rounded-md pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 animate-pulse">Loading workspaces...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#161B22] border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4 font-medium">Case ID</th>
                <th className="p-4 font-medium">Title</th>
                <th className="p-4 font-medium">Your Role</th>
                <th className="p-4 font-medium">Last Updated</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-[#161B22]/50 transition-colors group">
                  <td className="p-4 font-mono text-sm text-gray-400">{c.id}</td>
                  <td className="p-4 font-medium text-gray-200">
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 mr-2 text-[#D4AF37]/70" />
                      {c.title}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-xs px-3 py-1 rounded-full border bg-blue-900/20 text-blue-400 border-blue-900/50">
                      {c.accessList?.[0]?.role || "INHERITED"}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400 text-sm">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 flex items-center justify-end gap-3">
                    <button 
                      onClick={() => { setEditingCase(c); setEditTitle(c.title); }}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(c.id)}
                      className="text-sm text-gray-400 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                    <Link href={`/workspace/${c.id}`} className="text-sm text-[#D4AF37] hover:text-[#F2D675] font-medium transition-colors flex items-center ml-2">
                      Open <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                    No cases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {editingCase && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#0B0E14] border border-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">Edit Case Title</h2>
            <input 
              type="text" 
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-[#161B22] border border-gray-700 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37] mb-6"
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setEditingCase(null)}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                className="bg-[#D4AF37] hover:bg-[#F2D675] text-[#0B0E14] px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
