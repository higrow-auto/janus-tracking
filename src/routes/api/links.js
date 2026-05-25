const db = require('../../db');
const redis = require('../../redis');
const { generateSlug } = require('../../utils/slugGenerator');

async function invalidateCache(slug) {
  try { await redis.del(`link:${slug}`); } catch {}
}

module.exports = async function (fastify) {
  fastify.get('/links', async (req, reply) => {
    const { campaign_id, search, page = 1, limit = 50 } = req.query;
    const params = [];
    const conditions = [];

    if (campaign_id) {
      params.push(campaign_id);
      conditions.push(`l.campaign_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(l.slug ILIKE $${params.length} OR l.base_url ILIKE $${params.length})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const { rows } = await db.query(`
      SELECT
        l.*,
        c.name AS campaign_name,
        COUNT(cl.id) AS total_clicks,
        COUNT(cl.id) FILTER (WHERE cl.is_bot = false) AS real_clicks
      FROM links l
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      LEFT JOIN click_logs cl ON cl.link_id = l.id
      ${where}
      GROUP BY l.id, c.name
      ORDER BY l.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return rows;
  });

  fastify.get('/links/:id', async (req, reply) => {
    const { rows } = await db.query('SELECT * FROM links WHERE id = $1', [req.params.id]);
    if (!rows.length) return reply.status(404).send({ error: 'Not found' });
    return rows[0];
  });

  fastify.post('/links', async (req, reply) => {
    const { campaign_id, slug: customSlug, base_url, utm_parameters, split_urls } = req.body || {};
    if (!base_url) return reply.status(400).send({ error: 'base_url required' });

    const slug = customSlug ? customSlug.trim().toLowerCase().replace(/\s+/g, '-') : generateSlug();

    const existing = await db.query('SELECT id FROM links WHERE slug = $1', [slug]);
    if (existing.rows.length) return reply.status(409).send({ error: 'Slug already in use' });

    const { rows } = await db.query(
      `INSERT INTO links (campaign_id, slug, base_url, utm_parameters, split_urls)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        campaign_id || null,
        slug,
        base_url.trim(),
        JSON.stringify(utm_parameters || {}),
        JSON.stringify(split_urls || []),
      ]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.put('/links/:id', async (req, reply) => {
    const current = await db.query('SELECT slug FROM links WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return reply.status(404).send({ error: 'Not found' });

    const { campaign_id, base_url, utm_parameters, split_urls, active } = req.body || {};

    const { rows } = await db.query(
      `UPDATE links SET
         campaign_id = COALESCE($1, campaign_id),
         base_url = COALESCE($2, base_url),
         utm_parameters = COALESCE($3::jsonb, utm_parameters),
         split_urls = COALESCE($4::jsonb, split_urls),
         active = COALESCE($5, active),
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [
        campaign_id !== undefined ? campaign_id : null,
        base_url || null,
        utm_parameters !== undefined ? JSON.stringify(utm_parameters) : null,
        split_urls !== undefined ? JSON.stringify(split_urls) : null,
        active !== undefined ? active : null,
        req.params.id,
      ]
    );

    await invalidateCache(current.rows[0].slug);
    return rows[0];
  });

  fastify.delete('/links/:id', async (req, reply) => {
    const { rows } = await db.query('SELECT slug FROM links WHERE id = $1', [req.params.id]);
    if (!rows.length) return reply.status(404).send({ error: 'Not found' });
    await db.query('DELETE FROM links WHERE id = $1', [req.params.id]);
    await invalidateCache(rows[0].slug);
    return reply.status(204).send();
  });
};
