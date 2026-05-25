const db = require('../../db');
const settings = require('../../services/settings');
const { sendCapiEvent } = require('../../services/metaCapi');

module.exports = async function (fastify) {
  fastify.post('/webhooks/hotmart', {
    config: { skipAuth: true },
  }, async (request, reply) => {
    const all = await settings.getAll();
    const secret = all.hotmart_secret;

    // Verify Hotmart token if configured
    if (secret) {
      const token = request.headers['x-hotmart-hottok'];
      if (token !== secret) {
        return reply.status(401).send({ error: 'Invalid token' });
      }
    }

    const body = request.body;
    const eventType = body?.event || body?.data?.purchase?.status || 'UNKNOWN';

    // Persist raw event
    try {
      await db.query(
        `INSERT INTO webhook_events (source, event_type, payload) VALUES ($1, $2, $3)`,
        ['hotmart', eventType, JSON.stringify(body)]
      );
    } catch (err) {
      console.error('[hotmart webhook] db insert error:', err.message);
    }

    // Also save buyer as a lead if purchase is complete
    const purchase = body?.data?.purchase;
    const buyer    = body?.data?.buyer;
    if (purchase && buyer?.email && (eventType === 'PURCHASE_COMPLETE' || eventType === 'APPROVED')) {
      try {
        await db.query(
          `INSERT INTO lead_events (name, email, phone, source, extra_data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [
            buyer.name || null,
            buyer.email,
            buyer.phone || null,
            'hotmart',
            JSON.stringify({ transaction: purchase.transaction, product: body?.data?.product?.name }),
          ]
        );
      } catch (err) {
        console.error('[hotmart webhook] lead insert error:', err.message);
      }

      // Fire CAPI Purchase
      sendCapiEvent({
        eventName: 'Purchase',
        userData: { email: buyer.email },
        customData: {
          value:        purchase?.price?.value ? parseFloat(purchase.price.value) : undefined,
          currency:     purchase?.price?.currencyCode || 'BRL',
          order_id:     purchase?.transaction,
          content_type: 'product',
        },
      });
    }

    return reply.status(200).send({ ok: true });
  });
};
