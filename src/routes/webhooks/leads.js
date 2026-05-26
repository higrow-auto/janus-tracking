const db = require('../../db');
const { sendCapiEvent } = require('../../services/metaCapi');

// Suporta formato simples {name,email,phone} e formato Elementor {fields:[{id,title,value,type}]}
function parseBody(body) {
  if (!body) return {};

  // Formato Elementor Pro: { fields: [{id, title, value, type}], form_name, referer, ... }
  if (Array.isArray(body.fields)) {
    const out = { extra: { form_name: body.form_name, referer: body.referer, page_url: body.page_url } };
    for (const f of body.fields) {
      const id   = (f.id || '').toLowerCase();
      const type = (f.type || '').toLowerCase();
      const val  = f.value || '';
      if (type === 'email' || id.includes('email'))           out.email = val;
      else if (type === 'tel' || id.includes('phone') || id.includes('telefone') || id.includes('whatsapp')) out.phone = val;
      else if (type === 'text' && (id.includes('name') || id.includes('nome')))  out.name  = out.name || val;
      else if (!out.name && type === 'text')                  out.name  = val; // primeiro campo texto vira nome
    }
    return out;
  }

  // Formato simples ou flat {name, email, phone, ...}
  return {
    name:  body.name  || body.nome  || null,
    email: body.email || null,
    phone: body.phone || body.telefone || body.whatsapp || null,
    extra: body.extra || {},
  };
}

module.exports = async function (fastify) {
  fastify.post('/webhooks/leads', {
    config: { skipAuth: true },
  }, async (request, reply) => {
    const parsed = parseBody(request.body);
    const { name, email, phone, extra } = parsed;
    const source = request.query.source || request.body?.source || 'elementor';

    if (!email) {
      return reply.status(400).send({ error: 'email is required' });
    }

    try {
      await db.query(
        `INSERT INTO lead_events (name, email, phone, source, extra_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [name || null, email, phone || null, source, JSON.stringify(extra || {})]
      );
    } catch (err) {
      console.error('[leads webhook] db insert error:', err.message);
      return reply.status(500).send({ error: 'Failed to save lead' });
    }

    sendCapiEvent({
      eventName: 'Lead',
      userData: { email, ip: request.ip, userAgent: request.headers['user-agent'] },
      customData: { content_name: source },
    });

    return reply.status(200).send({ ok: true });
  });
};
