import { FastifyInstance } from 'fastify';
import { getStripe, handleStripeEvent } from '../services/payments.service';

/**
 * Stripe webhook receiver (ENG-5). Anonymous path, but every request is
 * verified against the webhook signing secret over the RAW body — an
 * unsigned or tampered payload is rejected before any parsing.
 */
export default async function stripeWebhookRoutes(fastify: FastifyInstance) {
  // Signature verification needs the exact raw bytes; this parser is scoped
  // to this plugin's encapsulation context only.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  );

  fastify.post('/stripe', async (request, reply) => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
      return reply.status(503).send({ error: 'Payments are not configured' });
    }

    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      return reply.status(400).send({ error: 'Missing signature' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, signature, secret);
    } catch {
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    const result = await handleStripeEvent(event);
    request.log.info({ eventId: event.id, type: event.type, ...result }, 'stripe webhook');
    return { received: true };
  });
}
