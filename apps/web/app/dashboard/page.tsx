"use client";
import { useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, ShieldAlert } from 'lucide-react';

export default function BentoDashboard() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mock Viability Indicators representing the LangGraph Agent's preliminary triage
  const viabilityScores = [
    { type: 'Strickland (IAC)', status: 'High Probability', color: 'text-[#3FB950]', icon: <CheckCircle className="w-5 h-5" />, desc: 'Failure to object to hearsay on Line 12.' },
    { type: 'Brady Violation', status: 'Moderate', color: 'text-[#D29922]', icon: <AlertTriangle className="w-5 h-5" />, desc: 'Discrepancy in Detective Smith timeline.' },
    { type: 'Actual Innocence', status: 'Low', color: 'text-[#F85149]', icon: <ShieldAlert className="w-5 h-5" />, desc: 'No DNA or newly discovered evidence.' }
  ];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setIsProcessing(true);
    // Simulate LangGraph processing
    setTimeout(() => setIsProcessing(false), 4000);
  };

  return (
    <div className="min-h-screen bg-[#161B22] text-white p-8 font-sans">
      <header className="mb-8 border-b border-[#D4AF37]/20 pb-4">
        <h1 className="text-2xl font-semibold text-[#D4AF37]">HabeasGraph Clinic Triage</h1>
        <p className="text-gray-400 text-sm mt-1">Manage intake and allocate investigative resources.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ingestion Module (Listening Pulse) */}
        <div className="col-span-1 lg:col-span-2">
          <motion.div 
            className={`border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center transition-colors relative overflow-hidden ${
              isDragging ? 'border-[#D4AF37] bg-[#D4AF37]/10' : 'border-gray-700 bg-[#0B0E14]'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            animate={isProcessing ? { boxShadow: ["0px 0px 0px rgba(212, 175, 55, 0)", "0px 0px 20px rgba(212, 175, 55, 0.5)", "0px 0px 0px rgba(212, 175, 55, 0)"] } : {}}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center text-[#D4AF37]">
                <div className="w-10 h-10 border-4 border-t-[#D4AF37] border-gray-600 rounded-full animate-spin mb-4"></div>
                <p className="font-semibold tracking-wide">LangGraph Agents Analyzing...</p>
                <p className="text-xs text-gray-400 mt-2">Extracting pgvector embeddings & Neo4j entities</p>
              </div>
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-gray-500 mb-4" />
                <h3 className="text-lg font-medium">Drag & Drop Case Files</h3>
                <p className="text-sm text-gray-500 mt-2">Support for raw PDF transcripts, ZIP dockets, and Axon MP4s.</p>
              </>
            )}
          </motion.div>
        </div>

        {/* Actionable Triage Actions */}
        <div className="col-span-1 flex flex-col gap-4">
          <div className="bg-[#0B0E14] border border-gray-800 rounded-xl p-6 h-full flex flex-col">
            <h3 className="text-lg font-semibold text-[#D4AF37] mb-4">Quick Actions</h3>
            <button className="bg-[#161B22] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-white py-3 px-4 rounded-lg text-sm transition-all text-left flex items-center mb-3">
              <FileText className="w-4 h-4 mr-3 text-[#D4AF37]" />
              Assign Investigator
            </button>
            <button className="bg-[#161B22] border border-gray-700 hover:border-gray-500 text-white py-3 px-4 rounded-lg text-sm transition-all text-left flex items-center mb-3">
              Connect Clio Matter
            </button>
            <button className="bg-[#D4AF37] text-[#0B0E14] hover:bg-[#F2D675] font-semibold py-3 px-4 rounded-lg text-sm transition-all text-center mt-auto">
              Open Workspace
            </button>
          </div>
        </div>

        {/* Viability Scorecard */}
        <div className="col-span-1 lg:col-span-3">
          <div className="bg-[#0B0E14] border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
              Viability Scorecard <span className="ml-3 text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-400">Auto-Generated</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {viabilityScores.map((score, idx) => (
                <div key={idx} className="bg-[#161B22] p-5 rounded-lg border border-gray-800">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-sm text-gray-300">{score.type}</h4>
                    <span className={score.color}>{score.icon}</span>
                  </div>
                  <p className={`text-lg font-semibold mb-2 ${score.color}`}>{score.status}</p>
                  <p className="text-sm text-gray-500">{score.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
