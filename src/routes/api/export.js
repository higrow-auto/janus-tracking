const db = require('../../db');

function toCSV(headers, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => cell(r[h])).join(',')),
  ].join('\n');
}

const ADMIN_PASSWORD = () => process.env.ADMIN_PASSWORD || 'changeme';

module.exports = async function (fastify) {

  // Export routes accept token via query string (for browser download links)
  fastify.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/export/')) return;
    const auth = req.headers.authorization || '';
    const queryToken = req.query?.token || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : queryToken;
    if (token !== ADMIN_PASSWORD()) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.get('/export/leads', { config: { skipAuth: true } }, async (req, reply) => {
    const { rows } = await db.query(`
      SELECT name, email, phone, source,
             to_char(captured_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS captured_at
      FROM lead_events
      ORDER BY captured_at DESC
    `);
    const csv = toCSV(['name', 'email', 'phone', 'source', 'captured_at'], rows);
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="leads.csv"')
      .send('﻿' + csv);
  });

  fastify.get('/export/sales', { config: { skipAuth: true } }, async (req, reply) => {
    const { rows } = await db.query(`
      SELECT
        payload->'data'->'buyer'->>'name'                                AS buyer_name,
        payload->'data'->'buyer'->>'email'                               AS buyer_email,
        (payload->'data'->'purchase'->'price'->>'value')                 AS amount,
        payload->'data'->'purchase'->>'currencyCode'                     AS currency,
        payload->'data'->'purchase'->>'transaction'                      AS transaction_id,
        event_type,
        to_char(received_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS received_at
      FROM webhook_events
      ORDER BY received_at DESC
    `);
    const csv = toCSV(
      ['buyer_name','buyer_email','amount','currency','transaction_id','event_type','received_at'],
      rows
    );
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="vendas.csv"')
      .send('﻿' + csv);
  });
};
