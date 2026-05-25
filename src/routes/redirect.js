const db = require('../db');
const redis = require('../redis');
const { selectUrl } = require('../services/abTesting');
const { logClick } = require('../services/clickLogger');
const { isBot } = require('../services/botDetector');
const { sendCapiEvent } = require('../services/metaCapi');

const CACHE_TTL = 300; // 5 minutes

async function getLinkBySlug(slug) {
  try {
    const cached = await redis.get(`link:${slug}`);
    if (cached) return JSON.parse(cached);
  } catch {}

  const { rows } = await db.query(
    'SELECT id, slug, base_url, utm_parameters, split_urls FROM links WHERE slug = $1 AND active = true',
    [slug]
  );
  if (rows.length === 0) return null;

  try {
    await redis.setex(`link:${slug}`, CACHE_TTL, JSON.stringify(rows[0]));
  } catch {}

  return rows[0];
}

function buildFinalUrl(link, incomingParams) {
  const splitUrls = link.split_urls;

  if (Array.isArray(splitUrls) && splitUrls.length > 0) {
    const base = selectUrl(splitUrls);
    return appendParams(base, {}, incomingParams);
  }

  return appendParams(link.base_url, link.utm_parameters || {}, incomingParams);
}

function appendParams(baseUrl, utmParams, dynamicParams) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return baseUrl;
  }

  for (const [k, v] of Object.entries(utmParams)) {
    if (v) url.searchParams.set(k, v);
  }
  for (const [k, v] of Object.entries(dynamicParams)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  return url.toString();
}

module.exports = async function (fastify) {
  fastify.get('/:slug', {
    config: { skipAuth: true },
  }, async (request, reply) => {
    const { slug } = request.params;
    const link = await getLinkBySlug(slug);

    if (!link) {
      return reply.status(404).type('text/plain').send('Link not found');
    }

    const finalUrl = buildFinalUrl(link, request.query);
    const botFlag = isBot(request.headers['user-agent'] || '');

    // Fire-and-forget – never awaited
    logClick({
      linkId: link.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      referer: request.headers['referer'],
      dynamicParams: request.query,
      isBot: botFlag,
    });

    if (!botFlag) {
      sendCapiEvent({
        eventName: 'PageView',
        eventSourceUrl: `https://jan.escolatocha.com.br/${slug}`,
        userData: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });
    }

    return reply.redirect(finalUrl, 302);
  });
};
