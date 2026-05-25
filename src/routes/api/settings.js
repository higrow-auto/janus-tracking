const db = require('../../db');
const settings = require('../../services/settings');

module.exports = async function (fastify) {

  // GET current settings — secrets are masked for display
  fastify.get('/settings', async () => {
    const all = await settings.getAll();
    return {
      meta_pixel_id:        all.meta_pixel_id        || '',
      meta_access_token:    all.meta_access_token    ? '••••' + all.meta_access_token.slice(-4) : '',
      meta_test_event_code: all.meta_test_event_code || '',
      hotmart_secret:       all.hotmart_secret       ? '••••' + all.hotmart_secret.slice(-4) : '',
      evolution_api_url:    all.evolution_api_url    || '',
      evolution_api_key:    all.evolution_api_key    ? '••••' + all.evolution_api_key.slice(-4) : '',
      evolution_instance:   all.evolution_instance   || '',
      // booleans for status indicators
      meta_capi_active:      !!(all.meta_pixel_id && all.meta_access_token),
      hotmart_active:        !!all.hotmart_secret,
      evolution_active:      !!(all.evolution_api_url && all.evolution_api_key && all.evolution_instance),
    };
  });

  // PUT — update settings (skip fields that look like masked values)
  fastify.put('/settings', async (req, reply) => {
    const body = req.body || {};
    const updates = {};
    const MASK = '••••';

    for (const key of settings.KEYS) {
      const val = body[key];
      if (val && !val.startsWith(MASK)) updates[key] = val;
    }

    await settings.setMultiple(updates);
    return { ok: true };
  });

  // GET recent webhook events (purchases from Hotmart)
  fastify.get('/webhook-events', async (req) => {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const { rows } = await db.query(`
      SELECT id, source, event_type, received_at,
             payload->'data'->'buyer'->>'email'  AS buyer_email,
             payload->'data'->'buyer'->>'name'   AS buyer_name,
             (payload->'data'->'purchase'->'price'->>'value')::numeric AS amount,
             payload->'data'->'purchase'->>'currencyCode' AS currency,
             payload->'data'->'purchase'->>'transaction' AS transaction_id
      FROM webhook_events
      ORDER BY received_at DESC
      LIMIT $1
    `, [limit]);
    return rows;
  });

  // GET leads
  fastify.get('/leads', async (req) => {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const { rows } = await db.query(`
      SELECT id, name, email, phone, source, extra_data, captured_at
      FROM lead_events
      ORDER BY captured_at DESC
      LIMIT $1
    `, [limit]);
    return rows;
  });
};
