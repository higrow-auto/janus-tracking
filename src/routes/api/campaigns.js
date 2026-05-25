const db = require('../../db');

module.exports = async function (fastify) {
  fastify.get('/campaigns', async (req, reply) => {
    const { rows } = await db.query(`
      SELECT c.*, COUNT(l.id) as link_count
      FROM campaigns c
      LEFT JOIN links l ON l.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    return rows;
  });

  fastify.post('/campaigns', async (req, reply) => {
    const { name, description } = req.body || {};
    if (!name) return reply.status(400).send({ error: 'name required' });

    const { rows } = await db.query(
      'INSERT INTO campaigns (name, description) VALUES ($1, $2) RETURNING *',
      [name.trim(), description || null]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.put('/campaigns/:id', async (req, reply) => {
    const { name, description } = req.body || {};
    const { rows } = await db.query(
      `UPDATE campaigns SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name || null, description !== undefined ? description : null, req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ error: 'Not found' });
    return rows[0];
  });

  fastify.delete('/campaigns/:id', async (req, reply) => {
    await db.query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
    return reply.status(204).send();
  });
};
