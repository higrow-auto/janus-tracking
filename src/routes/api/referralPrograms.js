const db = require('../../db');

module.exports = async function (fastify) {

  fastify.get('/referral-programs', async () => {
    const { rows } = await db.query(`
      SELECT
        p.*,
        COUNT(r.id)::int AS total_referrals,
        COUNT(r.id) FILTER (WHERE r.status = 'claimed')::int AS claimed_count,
        COUNT(r.id) FILTER (WHERE r.status = 'pending')::int AS pending_count
      FROM referral_programs p
      LEFT JOIN referrals r ON r.program_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    return rows;
  });

  fastify.get('/referral-programs/:id', async (req, reply) => {
    const { rows } = await db.query('SELECT * FROM referral_programs WHERE id = $1', [req.params.id]);
    if (!rows.length) return reply.status(404).send({ error: 'Not found' });
    return rows[0];
  });

  fastify.post('/referral-programs', async (req, reply) => {
    const { name, slug, group_redirect_url } = req.body || {};
    if (!name || !slug || !group_redirect_url) {
      return reply.status(400).send({ error: 'name, slug e group_redirect_url são obrigatórios' });
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const existing = await db.query('SELECT id FROM referral_programs WHERE slug = $1', [cleanSlug]);
    if (existing.rows.length) return reply.status(409).send({ error: 'Slug já em uso' });

    const { rows } = await db.query(
      `INSERT INTO referral_programs (name, slug, group_redirect_url)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), cleanSlug, group_redirect_url.trim()]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.put('/referral-programs/:id', async (req, reply) => {
    const { name, group_redirect_url, active } = req.body || {};
    const { rows } = await db.query(
      `UPDATE referral_programs SET
         name = COALESCE($1, name),
         group_redirect_url = COALESCE($2, group_redirect_url),
         active = COALESCE($3, active)
       WHERE id = $4 RETURNING *`,
      [name || null, group_redirect_url || null, active !== undefined ? active : null, req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ error: 'Not found' });
    return rows[0];
  });

  fastify.delete('/referral-programs/:id', async (req, reply) => {
    await db.query('DELETE FROM referral_programs WHERE id = $1', [req.params.id]);
    return reply.status(204).send();
  });
};
