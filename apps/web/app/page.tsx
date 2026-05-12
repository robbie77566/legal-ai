"use client";
import { motion } from 'framer-motion';
import HeroGraph from '../components/HeroGraph';
import { ArrowRight, FileSearch, Network, Scale } from 'lucide-react';
import Link from 'next/link';

/**
 * HabeasGraph Landing Page
 * 
 * The primary entry point for the public-facing application. 
 * Designed using the "Industrial Authority" aesthetic, this page aims to build 
 * immediate trust and convey high-end legal intelligence.
 * 
 * Key Sections:
 * 1. **Hero Section:** Features the dynamic `HeroGraph` background and a pulsing 
 *    Framer Motion CTA button.
 * 2. **Bento Grid:** A 3-column CSS grid showcasing the three core personas: 
 *    Clinic Director, Investigator, and Appellate Attorney.
 * 3. **Security Footer:** Emphasizes institutional trust (RLS, Zero-Retention).
 */
export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0B0E14] text-white selection:bg-[#D4AF37]/30 flex flex-col items-center">
      
      {/* Navbar */}
      <nav className="w-full fixed top-0 z-50 bg-[#0B0E14]/80 backdrop-blur-md border-b border-[#D4AF37]/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-[#D4AF37] font-serif font-bold text-xl tracking-wider">HabeasGraph</div>
          <div className="flex gap-4">
            <Link href="/dashboard">
              <button className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Sign In</button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden">
        <HeroGraph />
        
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Texas Post-Conviction <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#F2D675]">
                Advocacy, Untangled.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              Transform massive trial records into structured legal intelligence. Automate discovery, sanitize citations, and instantly draft CREAC arguments with our secure, zero-retention AI platform.
            </p>
            
            <Link href="/dashboard">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={{ 
                  boxShadow: [
                    "0px 0px 0px rgba(212, 175, 55, 0)", 
                    "0px 0px 20px rgba(212, 175, 55, 0.4)", 
                    "0px 0px 0px rgba(212, 175, 55, 0)"
                  ] 
                }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="bg-[#161B22] border border-[#D4AF37] text-[#D4AF37] px-8 py-4 rounded-lg font-medium text-lg flex items-center gap-3 mx-auto hover:bg-[#D4AF37]/10 transition-colors"
              >
                Initialize Workspace <ArrowRight className="w-5 h-5" />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="relative w-full max-w-7xl mx-auto px-6 py-32 z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Institutional-Grade Workflows</h2>
          <p className="text-gray-400">Purpose-built for the Clinic Director, the Investigator, and the Appellate Attorney.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1 */}
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-[#161B22]/80 backdrop-blur border border-gray-800 p-8 rounded-2xl hover:border-[#D4AF37]/50 transition-colors"
          >
            <div className="bg-[#0B0E14] w-12 h-12 rounded-full flex items-center justify-center mb-6 border border-[#D4AF37]/20">
              <Scale className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Triage Engine</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Drop gigabytes of transcripts and bodycam footage into the pulse engine. Instantly generate a Viability Scorecard (Green, Amber, Red) to allocate clinic resources effectively.
            </p>
            <div className="w-full h-24 bg-[#0B0E14] rounded-lg border border-gray-800 flex flex-col justify-center px-4 gap-2">
              <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-[#3FB950] shadow-[0_0_8px_#3FB950]"></div><div className="h-2 w-3/4 bg-gray-800 rounded"></div></div>
              <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-[#D29922] shadow-[0_0_8px_#D29922]"></div><div className="h-2 w-1/2 bg-gray-800 rounded"></div></div>
              <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-[#F85149] shadow-[0_0_8px_#F85149]"></div><div className="h-2 w-2/3 bg-gray-800 rounded"></div></div>
            </div>
          </motion.div>

          {/* Card 2 */}
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-[#161B22]/80 backdrop-blur border border-gray-800 p-8 rounded-2xl hover:border-[#D4AF37]/50 transition-colors"
          >
            <div className="bg-[#0B0E14] w-12 h-12 rounded-full flex items-center justify-center mb-6 border border-[#D4AF37]/20">
              <Network className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Chronological Web</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Unstructured PDFs morph into a force-directed Neo4j timeline. Hover over any entity to illuminate its entire lineage of evidence across decades of institutional records.
            </p>
            <div className="w-full h-24 bg-[#0B0E14] rounded-lg border border-gray-800 flex items-center justify-center relative overflow-hidden">
               <div className="absolute w-2 h-2 rounded-full bg-[#3FB950] left-8 top-6"></div>
               <div className="absolute w-2 h-2 rounded-full bg-[#D4AF37] right-10 top-8 shadow-[0_0_10px_#D4AF37]"></div>
               <div className="absolute w-2 h-2 rounded-full bg-[#D29922] left-12 bottom-6"></div>
               <svg className="absolute inset-0 w-full h-full opacity-30" stroke="#D4AF37" strokeWidth="1">
                 <line x1="36" y1="28" x2="180" y2="36" />
                 <line x1="52" y1="72" x2="180" y2="36" />
               </svg>
            </div>
          </motion.div>

          {/* Card 3 */}
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-[#161B22]/80 backdrop-blur border border-gray-800 p-8 rounded-2xl hover:border-[#D4AF37]/50 transition-colors"
          >
            <div className="bg-[#0B0E14] w-12 h-12 rounded-full flex items-center justify-center mb-6 border border-[#D4AF37]/20">
              <FileSearch className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Parchment Drafting</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              A bespoke side-by-side workspace. Highlight transcript text in Parchment Mode to instantly trigger LangGraph agents to draft strict CREAC arguments and sanitize citations.
            </p>
            <div className="w-full h-24 flex gap-2">
              <div className="w-1/2 h-full bg-[#FDF6E3] rounded-lg p-3 overflow-hidden flex flex-col justify-center">
                <div className="h-2 w-full bg-[#586E75]/20 rounded mb-2"></div>
                <div className="h-2 w-3/4 bg-[#D4AF37]/40 rounded mb-2 border-l-2 border-[#D4AF37]"></div>
                <div className="h-2 w-full bg-[#586E75]/20 rounded"></div>
              </div>
              <div className="w-1/2 h-full bg-[#0B0E14] rounded-lg border border-gray-800 p-3 flex flex-col justify-end">
                <div className="h-6 w-full bg-[#161B22] rounded flex items-center px-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse"></div>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* Security Footer */}
      <footer className="w-full border-t border-gray-800 bg-[#0B0E14]">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between">
          <div className="text-gray-500 text-sm mb-4 md:mb-0">
            &copy; 2026 HabeasGraph Systems. Highly Confidential.
          </div>
          <div className="flex flex-wrap gap-4 md:gap-8 text-xs font-mono text-gray-400">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Zero-Retention AI</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Immutable Audit Logs</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> RLS Tenant Isolation</span>
          </div>
        </div>
      </footer>

    </main>
  );
}
