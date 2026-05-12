"use client";
import dynamic from 'next/dynamic';
import { useMemo, useRef, useEffect } from 'react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

/**
 * HeroGraph Component
 * 
 * Renders an autonomous, non-interactive force-directed graph designed to sit 
 * behind the main Landing Page hero text. It simulates a "living" intelligence 
 * timeline by randomly plotting nodes and applying a slow, continuous D3 drift.
 * 
 * @dependencies
 * - react-force-graph-2d (Dynamically imported to prevent SSR issues)
 * - d3-force (Underlying physics engine)
 * 
 * @design-system "Industrial Authority"
 * - Nodes: 80% Industrial Dark (#161B22), 20% Law Gold (#D4AF37)
 * - Edges: Translucent Law Gold
 */
export default function HeroGraph() {
  const fgRef = useRef<any>();

  const graphData = useMemo(() => {
    // Generate a beautiful, scattered random graph that looks like a neural net / timeline
    const nodes = Array.from({ length: 60 }).map((_, id) => ({
      id,
      val: Math.random() * 2 + 1,
      color: Math.random() > 0.8 ? '#D4AF37' : '#161B22'
    }));
    
    const links = Array.from({ length: 70 }).map(() => ({
      source: Math.floor(Math.random() * 60),
      target: Math.floor(Math.random() * 60),
      color: 'rgba(212, 175, 55, 0.15)'
    }));

    return { nodes, links };
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      // Set the force-graph to slowly drift to give it a living intelligence feel
      fgRef.current.d3Force('charge').strength(-30);
      fgRef.current.d3Force('link').distance(40);
      
      // Auto-zoom to fit smoothly
      setTimeout(() => {
        fgRef.current?.zoomToFit(1000, 50);
      }, 100);
    }
  }, []);

  return (
    <div className="absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeColor={(node: any) => node.color}
        linkColor={(link: any) => link.color}
        nodeRelSize={4}
        linkWidth={1}
        enableZoomInteraction={false}
        enablePanInteraction={false}
        enableNodeDrag={false}
        backgroundColor="transparent"
      />
    </div>
  );
}
