"use client";
import { useState, useRef, useEffect } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

/**
 * WorkspacePage Component (The "Parchment Drafting" Workflow)
 * 
 * A bespoke side-by-side workspace designed for Lead Attorneys.
 * 
 * Features:
 * - **Parchment Mode (Left Pane):** Displays source material (transcripts) using 
 *   a high-contrast, low-eye-strain color palette (#FDF6E3 background).
 * - **Text Selection Capture:** Highlights text in the left pane to trigger a 
 *   floating action menu (handleMouseUp).
 * - **Intelligence Chat (Right Pane):** Dark-mode interface where LangGraph 
 *   agents simulate drafting CREAC arguments based on the selected text.
 * - **Resizable Panels:** Powered by `react-resizable-panels` for fluid layout.
 */
export default function WorkspacePage({ params }: { params: { caseId: string } }) {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [floatingMenu, setFloatingMenu] = useState<{x: number, y: number, text: string} | null>(null);

  const handleSend = () => {
    if (!chatInput) return;
    setMessages(prev => [...prev, { role: 'user', text: chatInput }]);
    setChatInput('');
    
    // Simulate streaming AI execution
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'status', text: 'Drafting CREAC argument...' }]);
    }, 500);

    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.role !== 'status'));
      setMessages(prev => [...prev, { 
        role: 'agent', 
        text: 'I have sanitized the citation and drafted a complete legal argument grounded in the transcript selection.' 
      }]);
    }, 2000);
  };

  const handleMouseUp = () => {
    // Detect text selection inside the Parchment Viewer
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setFloatingMenu({
        x: rect.left + window.scrollX + (rect.width / 2),
        y: rect.top + window.scrollY - 40,
        text: selection.toString()
      });
    } else {
      setFloatingMenu(null);
    }
  };

  const handleFloatingAction = (action: string) => {
    if (floatingMenu) {
      // Send the highlighted text directly to the LangGraph Chat input
      setChatInput(`${action}:\n"${floatingMenu.text}"`);
      setFloatingMenu(null);
      // Clear the native browser highlight
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div className="h-screen w-full bg-[#0B0E14] text-white flex flex-col relative">
      {/* Interactive Floating Action Menu */}
      {floatingMenu && (
        <div 
          className="absolute z-50 bg-[#161B22] border border-[#D4AF37]/50 rounded-md shadow-lg flex shadow-[#D4AF37]/10 overflow-hidden"
          style={{ left: floatingMenu.x, top: floatingMenu.y, transform: 'translateX(-50%)' }}
        >
          <button onClick={() => handleFloatingAction("Sanitize Citation")} className="px-3 py-2 text-xs font-medium hover:bg-[#D4AF37]/20 border-r border-[#D4AF37]/20 transition-colors">
            Sanitize Citation
          </button>
          <button onClick={() => handleFloatingAction("Draft CREAC Argument")} className="px-3 py-2 text-xs font-medium hover:bg-[#D4AF37]/20 transition-colors">
            Draft CREAC
          </button>
        </div>
      )}

      <header className="h-12 border-b border-[#D4AF37]/20 flex items-center px-4 shrink-0">
        <h1 className="text-[#D4AF37] font-semibold tracking-wide">HabeasGraph Workspace</h1>
        <span className="ml-4 text-xs text-gray-400">Case ID: {params.caseId}</span>
      </header>
      
      <main className="flex-1 overflow-hidden">
        <PanelGroup orientation="horizontal">
          {/* Left Pane: Parchment Mode Transcript */}
          <Panel defaultSize={50} minSize={30}>
            <div 
              className="h-full bg-[#FDF6E3] text-[#586E75] p-8 overflow-y-auto font-serif selection:bg-[#D4AF37]/30"
              onMouseUp={handleMouseUp}
            >
              <h2 className="text-xl font-bold mb-4 text-[#0B0E14]">Trial Transcript (Volume 2)</h2>
              <div className="space-y-4 leading-relaxed">
                <p><strong>[Line 10] MR. PROSECUTOR:</strong> Detective Smith, what did you find at the scene?</p>
                <p><strong>[Line 11] DETECTIVE SMITH:</strong> We found the defendant's jacket.</p>
                <p className="bg-[#D4AF37]/20 border-l-4 border-[#D4AF37] pl-2 py-1">
                  <strong>[Line 12] DEFENSE COUNSEL:</strong> Objection, hearsay.
                </p>
                <p><strong>[Line 13] THE COURT:</strong> Overruled.</p>
                <div className="mt-12 p-4 bg-gray-200/50 rounded-lg border border-gray-300">
                  <p className="text-sm italic text-gray-500 font-sans text-center">
                    ✨ Highlight any text in this transcript to trigger automated AI drafting actions.
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-[#161B22] hover:bg-[#D4AF37]/50 transition-colors" />

          {/* Right Pane: Dark Mode Intelligence Chat */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full bg-[#0B0E14] flex flex-col p-4 border-l border-[#D4AF37]/20">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`p-3 rounded-lg ${
                    msg.role === 'user' ? 'bg-[#161B22] ml-12 border border-[#D4AF37]/20' : 
                    msg.role === 'status' ? 'bg-transparent text-[#D4AF37] italic text-xs animate-pulse' :
                    'bg-[#D4AF37]/10 mr-12 border-l-2 border-[#D4AF37]'
                  }`}>
                    <span className="text-sm font-mono whitespace-pre-wrap">{msg.text}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask the Agent or highlight text in the transcript..."
                  className="flex-1 bg-[#161B22] border border-[#D4AF37]/30 rounded-md px-4 py-2 text-sm focus:outline-none focus:border-[#D4AF37] text-white placeholder-gray-500"
                />
                <button onClick={handleSend} className="bg-[#D4AF37] text-[#0B0E14] px-4 py-2 rounded-md font-semibold text-sm hover:bg-[#F2D675] transition-colors">
                  Send
                </button>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
