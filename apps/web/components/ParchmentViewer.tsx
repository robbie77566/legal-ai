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
          <div className="space-y-8">
            {documents.map((doc, i) => (
              <div key={i} className="mb-2">
                <h3 className="text-lg font-bold border-b border-[#D4AF37]/30 pb-2 mb-4">{doc.filename}</h3>
                
                {doc.chunks && doc.chunks.length > 0 ? (
                  <div className="space-y-4">
                    {doc.chunks.map((chunk: any) => (
                      <p key={chunk.id} className="text-[#586E75] leading-loose text-justify">
                        {chunk.content}
                      </p>
                    ))}
                  </div>
                ) : (
                  <span className="ml-2 text-xs text-gray-500 italic px-2 bg-gray-200 rounded-full">Processing AI Extraction...</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="italic">No documents have been attached to this case yet.</p>
        )}
      </div>
    </div>
  );
}
