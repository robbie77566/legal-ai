import React from 'react';
import { motion } from 'framer-motion';

interface ViabilityScore {
  type: string;
  status: string;
  color: string;
  icon: React.ReactNode;
  desc: string;
}

interface ViabilityScorecardProps {
  scores: ViabilityScore[];
}

export function ViabilityScorecard({ scores }: ViabilityScorecardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="col-span-1 lg:col-span-3"
    >
      <div className="bg-[#0B0E14] border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
          Viability Scorecard <span className="ml-3 text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-400">Auto-Generated</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {scores.map((score, idx) => (
            <div key={idx} data-testid={`scorecard-item-${idx}`} className="bg-[#161B22] p-5 rounded-lg border border-gray-800">
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
    </motion.div>
  );
}
