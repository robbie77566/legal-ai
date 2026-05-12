import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const PacerWebhookSchema = z.object({
  caseNumber: z.string(),
  docketEntry: z.string(),
  filedBy: z.string(),
  timestamp: z.string()
});

export default async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post('/webhooks/pacer', async (request, reply) => {
    const payload = PacerWebhookSchema.parse(request.body);
    
    console.log(`[Webhook] Received PACER update for case ${payload.caseNumber}`);
    
    // In production, this would dispatch a notification or trigger a LangGraph
    // agent to automatically analyze the new filing (e.g., opposing counsel's motion)
    
    return { success: true, receivedEntry: payload.docketEntry };
  });
}
