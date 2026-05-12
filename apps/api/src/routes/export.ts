import { FastifyInstance } from 'fastify';
import { generateWritMasterSheet } from '../services/export';
import prisma from '@hg/database';

export default async function exportRoutes(fastify: FastifyInstance) {
  fastify.get('/export/writ/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    
    // In production, we query the `GraphState` PostgreSQL table here to get the actual 
    // finalized CREAC output from the LangGraph agent for this specific case.
    
    // For this mock pipeline test, we simulate the LLM's CREAC output:
    const mockClaims = [
      "CONCLUSION: Trial counsel was ineffective for failing to object to hearsay evidence.",
      "RULE: Under Strickland v. Washington, counsel is deficient if performance falls below an objective standard of reasonableness, and that deficiency prejudices the defense.",
      "EXPLANATION: Ex parte Smith states that failure to object to critical hearsay can constitute deficient performance.",
      "APPLICATION: Here, trial counsel failed to object to Detective Smith's testimony on Line 11, which was the only evidence linking the defendant to the jacket.",
      "CONCLUSION: Because this failure prejudiced the outcome, the defendant was denied effective assistance of counsel."
    ];
    
    // Buffer the raw .docx binary
    const buffer = await generateWritMasterSheet(mockClaims);
    
    // Stream the binary to the frontend client for download
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('Content-Disposition', `attachment; filename="Writ_Master_Sheet_${caseId}.docx"`)
      .send(buffer);
  });
}
