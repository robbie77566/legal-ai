"use client";
import KnowledgeGraph from '../../../../components/KnowledgeGraph';
import { useMemo } from 'react';

export default function GraphWorkspacePage({ params }: { params: { caseId: string } }) {
  
  // Mock Neo4j Graph Data simulating the extracted entities and their relationships
  const graphData = useMemo(() => {
    const nodes = [
      { id: 'Defendant: John Doe', group: 'Person', neighbors: ['Event: 1998 Medical Incident', 'Evidence: Transcript Line 11'] },
      { id: 'Detective Smith', group: 'Person', neighbors: ['Evidence: Transcript Line 11'] },
      { id: 'Event: 1998 Medical Incident', group: 'Event', neighbors: ['Defendant: John Doe'] },
      { id: 'Evidence: Transcript Line 11', group: 'Evidence', neighbors: ['Defendant: John Doe', 'Detective Smith'] },
    ];
    
    const links = [
      { source: 'Defendant: John Doe', target: 'Event: 1998 Medical Incident' },
      { source: 'Defendant: John Doe', target: 'Evidence: Transcript Line 11' },
      { source: 'Detective Smith', target: 'Evidence: Transcript Line 11' },
    ];
    
    return { nodes, links };
  }, []);

  return (
    <div className="h-screen w-full bg-[#0B0E14] text-white flex flex-col">
      <header className="h-12 border-b border-[#D4AF37]/20 flex items-center px-4 shrink-0">
        <h1 className="text-[#D4AF37] font-semibold tracking-wide">Knowledge Graph Explorer</h1>
        <span className="ml-4 text-xs text-gray-400">Case ID: {params.caseId}</span>
      </header>
      
      <main className="flex-1 p-4 flex gap-4">
        <div className="w-1/4 h-full flex flex-col">
          <h2 className="text-xl font-bold mb-4 text-[#D4AF37]">Chronological Discovery</h2>
          <p className="text-sm text-gray-400 mb-6">
            Hover over a node to instantly highlight its connected edges in <span className="text-[#D4AF37] font-semibold">Law Gold</span>. This enables rapid, non-linear pattern discovery across decades of disparate institutional records.
          </p>
          <div className="bg-[#161B22] p-4 rounded-lg border border-gray-800 mt-auto">
            <h3 className="font-semibold text-sm mb-3">Entity Legend</h3>
            <div className="flex items-center gap-2 mb-2"><div className="w-3 h-3 rounded-full bg-[#3FB950]"></div> <span className="text-xs text-gray-300">Person</span></div>
            <div className="flex items-center gap-2 mb-2"><div className="w-3 h-3 rounded-full bg-[#D29922]"></div> <span className="text-xs text-gray-300">Event / Timeline</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#586E75]"></div> <span className="text-xs text-gray-300">Evidence Source</span></div>
          </div>
        </div>
        
        <div className="w-3/4 h-full">
          <KnowledgeGraph data={graphData} />
        </div>
      </main>
    </div>
  );
}
