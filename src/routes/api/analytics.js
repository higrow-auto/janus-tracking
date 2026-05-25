const db = require('../../db');

module.exports = async function (fastify) {
  fastify.get('/analytics/overview', async (req, reply) => {
    const [main, today, topLinks] = await Promise.all([
      db.query(`
        SELECT
          COUNT(DISTINCT l.id)::int AS total_links,
          COUNT(DISTINCT l.campaign_id)::int AS total_campaigns,
          COUNT(cl.id)::int AS total_clicks,
          COUNT(cl.id) FILTER (WHERE cl.is_bot = false)::int AS real_clicks
        FROM links l
        LEFT JOIN click_logs cl ON cl.link_id = l.id
      `),
      db.query(`
        SELECT COUNT(*)::int AS clicks_today
        FROM click_logs
        WHERE clicked_at >= CURRENT_DATE AND is_bot = false
      `),
      db.query(`
        SELECT l.slug, l.id,
               COUNT(cl.id) FILTER (WHERE cl.is_bot = false)::int AS real_clicks
        FROM links l
        LEFT JOIN click_logs cl ON cl.link_id = l.id
        WHERE l.active = true
        GROUP BY l.id
        ORDER BY real_clicks DESC
        LIMIT 5
      `),
    ]);

    return {
      ...main.rows[0],
      ...today.rows[0],
      top_links: topLinks.rows,
    };
  });

  fastify.get('/analytics/links/:id', async (req, reply) => {
    const days = Math.min(parseInt(req.query.period || '7'), 90);

    const [series, totals, referrers] = await Promise.all([
      db.query(`
        SELECT
          DATE_TRUNC('day', clicked_at)::date AS date,
          COUNT(*) FILTER (WHERE is_bot = false)::int AS real,
          COUNT(*) FILTER (WHERE is_bot = true)::int AS bots
        FROM click_logs
        WHERE link_id = $1 AND clicked_at >= NOW() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY 1 ASC
      `, [req.params.id, days]),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_bot = false)::int AS real_clicks,
          COUNT(*) FILTER (WHERE is_bot = true)::int AS bot_clicks,
          COUNT(*)::int AS total_clicks
        FROM click_logs WHERE link_id = $1
      `, [req.params.id]),
      db.query(`
        SELECT referer, COUNT(*)::int AS count
        FROM click_logs
        WHERE link_id = $1 AND is_bot = false AND referer IS NOT NULL
        GROUP BY referer ORDER BY count DESC LIMIT 10
      `, [req.params.id]),
    ]);

    return { series: series.rows, totals: totals.rows[0], referrers: referrers.rows };
  });

  fastify.get('/analytics/recent', async (req, reply) => {
    const { rows } = await db.query(`
      SELECT cl.clicked_at, cl.ip_address, cl.user_agent, cl.referer,
             cl.dynamic_params, cl.is_bot, l.slug
      FROM click_logs cl
      JOIN links l ON cl.link_id = l.id
      ORDER BY cl.clicked_at DESC
      LIMIT 30
    `);
    return rows;
  });

  fastify.get('/analytics/debug', async (req, reply) => {
    const [total, breakdown, recent] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total FROM click_logs`),
      db.query(`SELECT is_bot, COUNT(*)::int AS count FROM click_logs GROUP BY is_bot`),
      db.query(`SELECT clicked_at, ip_address, is_bot, user_agent FROM click_logs ORDER BY clicked_at DESC LIMIT 5`),
    ]);
    return { total: total.rows[0].total, breakdown: breakdown.rows, recent: recent.rows };
  });
};
