require('dotenv').config();
const path = require('path');
const fs = require('fs');
const fastify = require('fastify')({
  logger: process.env.NODE_ENV !== 'production',
  trustProxy: true,
});
const db = require('./db');
const redis = require('./redis');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

// Auth hook – all /api/* routes require Bearer token
fastify.addHook('onRequest', async (request, reply) => {
  if (!request.routeOptions?.config?.skipAuth && request.url.startsWith('/api/')) {
    const auth = request.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_PASSWORD) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  }
});

// CORS
fastify.register(require('@fastify/cors'), { origin: '*' });

// Static assets
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/assets/',
  decorateReply: false,
});

// Dashboard (serves index.html at root)
fastify.get('/', { config: { skipAuth: true } }, async (req, reply) => {
  return reply.type('text/html').send(
    fs.readFileSync(path.join(__dirname, '../public/index.html'))
  );
});

// Health check
fastify.get('/health', { config: { skipAuth: true } }, async () => ({ ok: true }));

// Public config (pixel ID only — no credentials)
fastify.get('/api/config/public', { config: { skipAuth: true } }, async () => ({
  metaPixelId: process.env.META_PIXEL_ID || null,
}));

// Integration status (authenticated — no credentials exposed)
fastify.get('/api/config/integrations', async () => ({
  metaCapiActive: !!(process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN),
  hotmartActive: !!process.env.HOTMART_SECRET,
}));

// API routes
fastify.register(require('./routes/api/campaigns'), { prefix: '/api' });
fastify.register(require('./routes/api/links'), { prefix: '/api' });
fastify.register(require('./routes/api/analytics'), { prefix: '/api' });
fastify.register(require('./routes/api/settings'), { prefix: '/api' });
fastify.register(require('./routes/api/export'), { prefix: '/api' });
fastify.register(require('./routes/api/referralPrograms'), { prefix: '/api' });
fastify.register(require('./routes/api/referrals'), { prefix: '/api' });

// Webhooks (public, self-authenticated)
fastify.register(require('./routes/webhooks/hotmart'));
fastify.register(require('./routes/webhooks/leads'));

// Páginas públicas do sistema MGM — antes do redirect engine
fastify.get('/indica/:slug', { config: { skipAuth: true } }, async (req, reply) => {
  return reply.type('text/html').send(
    fs.readFileSync(path.join(__dirname, '../public/indica.html'))
  );
});
fastify.get('/convite/:code', { config: { skipAuth: true } }, async (req, reply) => {
  return reply.type('text/html').send(
    fs.readFileSync(path.join(__dirname, '../public/convite.html'))
  );
});

// Redirect engine — registered last so /:slug is the fallback
fastify.register(require('./routes/redirect'));

async function runMigrations() {
  const dir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.query(sql);
    console.log(`Migration OK: ${file}`);
  }
}

async function start() {
  try {
    await redis.connect();
    console.log('Redis connected');
    await runMigrations();
    await fastify.listen({ port: parseInt(process.env.PORT || '3000'), host: '0.0.0.0' });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
