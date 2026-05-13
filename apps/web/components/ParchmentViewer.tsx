import React from 'react';

export interface ParchmentViewerProps {
  onMouseUp: () => void;
  documents?: any[];
}

export function ParchmentViewer({ onMouseUp, documents = [] }: ParchmentViewerProps) {
  return (
    <div 
      data-testid="parchment-viewer"
      className="h-full bg-[#FDF6E3] text-[#586E75] p-8 overflow-y-auto font-serif selection:bg-[#D4AF37]/30"
      onMouseUp={onMouseUp}
    >
      <h2 className="text-xl font-bold mb-4 text-[#0B0E14]">Case Documents</h2>
      <div className="space-y-4 leading-relaxed">
        {documents.length > 0 ? (
          <ul className="list-disc pl-5">
            {documents.map((doc, i) => (
              <li key={i} className="mb-2">
                <strong>{doc.filename}</strong>
                <span className="ml-2 text-xs text-gray-500 italic px-2 bg-gray-200 rounded-full">Processing AI Extraction...</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="italic">No documents have been attached to this case yet.</p>
        )}
        
        <div className="mt-12 p-4 bg-gray-200/50 rounded-lg border border-gray-300">
          <p className="text-sm italic text-gray-500 font-sans text-center">
            ✨ Once processing is complete, the raw text will be available here. Highlight any text to trigger automated AI drafting actions.
          </p>
        </div>
      </div>
    </div>
  );
}
