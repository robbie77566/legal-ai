"use client";
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';

// ForceGraph2D requires browser APIs and canvas, so we dynamically import it to disable SSR
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

/**
 * KnowledgeGraph Component
 * 
 * Interactive 2D Force-Directed Graph used primarily by the Investigator persona 
 * to visualize chronological relationships between legal entities, evidence, and 
 * case files. It fetches data dynamically and handles entity relationships.
 * 
 * @props {Object} data - The graph data containing { nodes, links } from Neo4j.
 * 
 * @design-system "Industrial Authority"
 * - Selected/Hovered Nodes: Illuminate with "Law Gold" (#D4AF37)
 * - Neighbors: Highlighted in Law Gold.
 * - Unselected Nodes: Subdued into the background for focus (#161B22)
 * - Groups: Green (#3FB950) for Persons, Amber (#D29922) for Events.
 */
export default function KnowledgeGraph({ data }: { data: any }) {
  const fgRef = useRef<any>();
  const [hoverNode, setHoverNode] = useState<any>(null);

  const handleNodeHover = useCallback((node: any) => {
    setHoverNode(node);
  }, []);

  // Determine colors based on hover state and entity type
  const nodeColor = (node: any) => {
    if (hoverNode && node.id === hoverNode.id) return '#D4AF37'; // Law Gold when directly hovered
    if (hoverNode && hoverNode.neighbors && hoverNode.neighbors.includes(node.id)) return '#D4AF37'; // Highlight 1st-degree neighbors
    if (hoverNode) return '#161B22'; // Dim un-connected nodes
    
    // Default colors matching the Viability indicators and design system
    if (node.group === 'Person') return '#3FB950'; 
    if (node.group === 'Event') return '#D29922'; 
    return '#586E75'; 
  };

  const linkColor = (link: any) => {
    if (hoverNode && ((link.source?.id || link.source) === hoverNode.id || (link.target?.id || link.target) === hoverNode.id)) {
      return '#D4AF37'; // Illuminate the connecting edge in Law Gold
    }
    return hoverNode ? '#161B22' : '#30363D'; // Default dark subtle lines
  };

  return (
    <div className="w-full h-full bg-[#0B0E14] overflow-hidden rounded-xl border border-gray-800">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        nodeLabel="id"
        nodeColor={nodeColor}
        linkColor={linkColor}
        nodeRelSize={6}
        linkWidth={(link: any) => (hoverNode && ((link.source?.id || link.source) === hoverNode.id || (link.target?.id || link.target) === hoverNode.id) ? 3 : 1)}
        onNodeHover={handleNodeHover}
        backgroundColor="#0B0E14"
      />
    </div>
  );
}
