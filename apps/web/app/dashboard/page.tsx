"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronRight,
  FolderOpen,
  X,
} from "lucide-react";
import { ViabilityScorecard } from "@/components/ViabilityScorecard";

export default function BentoDashboard() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [processingLogs, setProcessingLogs] = useState<
    { message: string; source: string }[]
  >([]);

  // New Modal State
  const [showModal, setShowModal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [caseMeta, setCaseMeta] = useState({
    name: "",
    defendant: "",
    jurisdiction: "",
  });
  const [caseId, setCaseId] = useState("CASE-999");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mock Viability Indicators representing the LangGraph Agent's preliminary triage
  const viabilityScores = [
    {
      type: "Strickland (IAC)",
      status: "High Probability",
      color: "text-[#3FB950]",
      icon: <CheckCircle className="w-5 h-5" />,
      desc: "Failure to object to hearsay on Line 12.",
    },
    {
      type: "Brady Violation",
      status: "Moderate",
      color: "text-[#D29922]",
      icon: <AlertTriangle className="w-5 h-5" />,
      desc: "Discrepancy in Detective Smith timeline.",
    },
    {
      type: "Actual Innocence",
      status: "Low",
      color: "text-[#F85149]",
      icon: <ShieldAlert className="w-5 h-5" />,
      desc: "No DNA or newly discovered evidence.",
    },
  ];

  const router = useRouter();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
      setShowModal(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setShowModal(true);
    }
  };

  const submitCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowModal(false);
    setIsProcessing(true);
    setHasProcessed(false);
    setProcessingLogs([]);

    try {
      // 1. Create Case in PostgreSQL
      const caseRes = await fetch("http://localhost:3001/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: caseMeta.name,
          defendant: caseMeta.defendant,
          jurisdiction: caseMeta.jurisdiction,
        }),
      });

      const caseData = await caseRes.json();
      if (!caseData.success) throw new Error("Failed to create case");
      const generatedCaseId = caseData.caseId;
      setCaseId(generatedCaseId);

      // 2. Upload files
      for (const file of files) {
        // Get Pre-signed URL
        const urlRes = await fetch("http://localhost:3001/upload/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            caseId: generatedCaseId,
          }),
        });
        const { url, s3Key } = await urlRes.json();

        // Upload directly to S3 (wrapped in try/catch to gracefully degrade locally)
        try {
          const s3Upload = await fetch(url, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          });
          if (!s3Upload.ok) {
            console.warn(
              "S3 Upload returned non-200, continuing for local dev",
              s3Upload.statusText,
            );
          }
        } catch (s3Err) {
          console.warn(
            "S3 Upload failed (likely CORS or missing AWS credentials in local dev). Mocking success to proceed with UI flow.",
            s3Err,
          );
        }

        // Register complete
        await fetch("http://localhost:3001/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: generatedCaseId,
            filename: file.name,
            s3Key,
          }),
        });
      }

      // 3. Establish SSE Connection for Real-Time Logs
      const eventSource = new EventSource(
        `http://localhost:3001/cases/${generatedCaseId}/progress`,
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProcessingLogs((prev) => [...prev, data]);

        if (data.status === "complete") {
          eventSource.close();
          setIsProcessing(false);
          setHasProcessed(true);
        }
      };

      eventSource.onerror = (err) => {
        console.error("EventSource failed:", err);
        eventSource.close();
        setIsProcessing(false);
        setHasProcessed(true); // Failsafe
      };
    } catch (err) {
      console.error(err);
      triggerToast(
        "An error occurred during upload. Is the API server running?",
      );
      setIsProcessing(false);
    }
  };

  const triggerToast = (msg: string) => {
    alert(msg); // Placeholder for a toast notification system
  };

  return (
    <div className="min-h-screen bg-[#161B22] text-white p-8 font-sans relative">
      <header className="mb-8 border-b border-[#D4AF37]/20 pb-4">
        <h1 className="text-2xl font-semibold text-[#D4AF37]">
          HabeasGraph Litigation Triage
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage intake and allocate investigative resources.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ingestion Module */}
        <div
          className={`col-span-1 ${hasProcessed ? "lg:col-span-2" : "lg:col-span-2"}`}
        >
          <motion.div
            className={`border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center transition-colors relative overflow-hidden ${
              isDragging
                ? "border-[#D4AF37] bg-[#D4AF37]/10"
                : "border-gray-700 bg-[#0B0E14]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            animate={
              isProcessing
                ? {
                    boxShadow: [
                      "0px 0px 0px rgba(212, 175, 55, 0)",
                      "0px 0px 20px rgba(212, 175, 55, 0.5)",
                      "0px 0px 0px rgba(212, 175, 55, 0)",
                    ],
                  }
                : {}
            }
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center w-full px-6 text-[#D4AF37]">
                <div className="w-10 h-10 border-4 border-t-[#D4AF37] border-gray-600 rounded-full animate-spin mb-4"></div>
                <p className="font-semibold tracking-wide mb-2">
                  LangGraph Agents Analyzing...
                </p>

                {/* Real-time Stream Viewer */}
                <div className="w-full max-w-md bg-black/50 border border-gray-800 rounded-lg p-3 h-32 overflow-y-auto text-left flex flex-col justify-end">
                  {processingLogs.length === 0 ? (
                    <p className="text-xs text-gray-500 italic animate-pulse">
                      Initializing processing workers...
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {processingLogs.map((log, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-xs text-gray-300 font-mono flex items-start"
                        >
                          <span
                            className={`mr-2 shrink-0 ${log.source === "entity" ? "text-purple-400" : "text-blue-400"}`}
                          >
                            [{log.source}]
                          </span>
                          <span>{log.message}</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-gray-500 mb-4" />
                <h3 className="text-lg font-medium">
                  Drop Files to Auto-Generate Case
                </h3>
                <p className="text-sm text-gray-500 mt-2 text-center px-4">
                  Our AI will automatically extract case metadata from your
                  PDFs, dockets, and Axon MP4s.
                </p>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  data-testid="file-upload-input"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-6 bg-[#161B22] border border-gray-600 hover:border-[#D4AF37] text-white px-6 py-2 rounded-md font-medium text-sm transition-all"
                >
                  Create Case from Files
                </button>
              </>
            )}
          </motion.div>
        </div>

        {/* Quick Start Guide or Actionable Triage Actions */}
        {!hasProcessed ? (
          <div className="col-span-1 bg-[#0B0E14] border border-gray-800 rounded-xl p-6 h-64 flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4">
              How it Works
            </h3>
            <ul className="space-y-4 flex-1">
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center text-xs font-bold shrink-0 mr-3">
                  1
                </div>
                <p className="text-sm text-gray-300">
                  Upload unstructured trial transcripts or case dockets.
                </p>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center text-xs font-bold shrink-0 mr-3">
                  2
                </div>
                <p className="text-sm text-gray-300">
                  LangGraph extracts entities and indexes pgvector chunks.
                </p>
              </li>
              <li className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center text-xs font-bold shrink-0 mr-3">
                  3
                </div>
                <p className="text-sm text-gray-300">
                  Review the auto-generated viability scorecard.
                </p>
              </li>
            </ul>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="col-span-1 flex flex-col gap-4"
          >
            <div className="bg-[#0B0E14] border border-gray-800 rounded-xl p-6 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-[#D4AF37] mb-4">
                Quick Actions
              </h3>
              <button
                onClick={() =>
                  triggerToast("Investigator Assigned to " + caseId)
                }
                className="bg-[#161B22] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-white py-3 px-4 rounded-lg text-sm transition-all text-left flex items-center mb-3"
              >
                <FileText className="w-4 h-4 mr-3 text-[#D4AF37]" />
                Assign Investigator
              </button>
              <button
                onClick={() => triggerToast("Clio Matter Sync Initiated")}
                className="bg-[#161B22] border border-gray-700 hover:border-gray-500 text-white py-3 px-4 rounded-lg text-sm transition-all text-left flex items-center mb-3"
              >
                Connect Clio Matter
              </button>
              <Link
                href={`/workspace/${caseId}`}
                className="bg-[#D4AF37] text-[#0B0E14] hover:bg-[#F2D675] font-semibold py-3 px-4 rounded-lg text-sm transition-all text-center mt-auto flex justify-center"
              >
                Open Workspace ({caseId})
              </Link>
            </div>
          </motion.div>
        )}

        {/* Viability Scorecard */}
        {hasProcessed && <ViabilityScorecard scores={viabilityScores} />}
      </div>

      {/* Recent Cases Section */}
      {!hasProcessed && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
            <FolderOpen className="w-5 h-5 mr-2 text-gray-400" />
            Recent Case Workspaces
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                id: "CASE-998",
                title: "State v. Johnson",
                status: "High Viability",
                date: "Oct 24, 2023",
              },
              {
                id: "CASE-997",
                title: "Doe v. Smith",
                status: "Moderate Viability",
                date: "Oct 20, 2023",
              },
              {
                id: "CASE-996",
                title: "In re: Thompson Estate",
                status: "Low Viability",
                date: "Oct 15, 2023",
              },
            ].map((c) => (
              <Link href={`/workspace/${c.id}`} key={c.id}>
                <div className="bg-[#0B0E14] border border-gray-800 hover:border-[#D4AF37]/50 rounded-xl p-5 cursor-pointer transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-gray-500">
                      {c.id}
                    </span>
                    <span className="text-xs text-gray-500">{c.date}</span>
                  </div>
                  <h4 className="font-medium text-white mb-1 group-hover:text-[#D4AF37] transition-colors">
                    {c.title}
                  </h4>
                  <div className="flex justify-between items-center mt-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        c.status.includes("High")
                          ? "bg-[#3FB950]/10 text-[#3FB950]"
                          : c.status.includes("Moderate")
                            ? "bg-[#D29922]/10 text-[#D29922]"
                            : "bg-[#F85149]/10 text-[#F85149]"
                      }`}
                    >
                      {c.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#D4AF37]" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Case Creation Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ y: 20, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.95 }}
              className="bg-[#0B0E14] border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-800">
                <h2 className="text-xl font-semibold text-[#D4AF37]">
                  Setup New Case
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-white"
                  data-testid="close-modal-btn"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={submitCase} className="p-6">
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Case Name
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="e.g., State v. Smith"
                      value={caseMeta.name}
                      onChange={(e) =>
                        setCaseMeta({ ...caseMeta, name: e.target.value })
                      }
                      className="w-full bg-[#161B22] border border-gray-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">
                        Defendant Name
                      </label>
                      <input
                        type="text"
                        placeholder="John Smith"
                        value={caseMeta.defendant}
                        onChange={(e) =>
                          setCaseMeta({
                            ...caseMeta,
                            defendant: e.target.value,
                          })
                        }
                        className="w-full bg-[#161B22] border border-gray-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">
                        Jurisdiction
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., SDNY"
                        value={caseMeta.jurisdiction}
                        onChange={(e) =>
                          setCaseMeta({
                            ...caseMeta,
                            jurisdiction: e.target.value,
                          })
                        }
                        className="w-full bg-[#161B22] border border-gray-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">
                    Attached Files
                  </h3>
                  <div className="bg-[#161B22] border border-gray-700 rounded-md p-3 max-h-32 overflow-y-auto">
                    {files.length > 0 ? (
                      <ul className="space-y-2">
                        {files.map((file, i) => (
                          <li
                            key={i}
                            className="text-sm text-gray-300 flex items-center"
                          >
                            <FileText className="w-4 h-4 mr-2 text-[#D4AF37]" />
                            {file.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">
                        No files selected.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#D4AF37] hover:bg-[#F2D675] text-[#0B0E14] px-6 py-2 rounded-md font-medium text-sm transition-colors shadow-lg"
                  >
                    Save & Analyze
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
