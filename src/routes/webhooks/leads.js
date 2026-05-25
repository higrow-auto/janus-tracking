const db = require('../../db');
const { sendCapiEvent } = require('../../services/metaCapi');

module.exports = async function (fastify) {
  fastify.post('/webhooks/leads', {
    config: { skipAuth: true },
  }, async (request, reply) => {
    const { name, email, phone, source, extra } = request.body || {};

    if (!email) {
      return reply.status(400).send({ error: 'email is required' });
    }

    try {
      await db.query(
        `INSERT INTO lead_events (name, email, phone, source, extra_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [name || null, email, phone || null, source || 'webhook', JSON.stringify(extra || {})]
      );
    } catch (err) {
      console.error('[leads webhook] db insert error:', err.message);
      return reply.status(500).send({ error: 'Failed to save lead' });
    }

    // Fire CAPI Lead event
    sendCapiEvent({
      eventName: 'Lead',
      userData: {
        email,
        ip:        request.ip,
        userAgent: request.headers['user-agent'],
      },
      customData: { content_name: source || 'webhook' },
    });

    return reply.status(200).send({ ok: true });
  });
};
