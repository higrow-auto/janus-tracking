const db = require('../db');
const redis = require('../redis');

const CACHE_KEY = 'jet:settings';
const CACHE_TTL = 60; // 60s so UI changes take effect quickly

const KEYS = [
  'meta_pixel_id', 'meta_access_token', 'meta_test_event_code', 'hotmart_secret',
  'evolution_api_url', 'evolution_api_key', 'evolution_instance',
];

// Env var fallbacks for backwards compatibility
const ENV_MAP = {
  meta_pixel_id:        process.env.META_PIXEL_ID        || null,
  meta_access_token:    process.env.META_ACCESS_TOKEN    || null,
  meta_test_event_code: process.env.META_TEST_EVENT_CODE || null,
  hotmart_secret:       process.env.HOTMART_SECRET       || null,
  evolution_api_url:    process.env.EVOLUTION_API_URL    || null,
  evolution_api_key:    process.env.EVOLUTION_API_KEY    || null,
  evolution_instance:   process.env.EVOLUTION_INSTANCE   || null,
};

async function getAll() {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}

  const { rows } = await db.query('SELECT key, value FROM platform_settings WHERE key = ANY($1)', [KEYS]);
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));

  // DB value takes precedence over env var
  const result = {};
  for (const k of KEYS) {
    result[k] = stored[k] || ENV_MAP[k] || null;
  }

  try {
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result));
  } catch {}

  return result;
}

async function get(key) {
  const all = await getAll();
  return all[key] || null;
}

async function setMultiple(updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (!KEYS.includes(key) || !value || value.trim() === '') continue;
    await db.query(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [key, value.trim()]);
  }
  try { await redis.del(CACHE_KEY); } catch {}
}

module.exports = { get, getAll, setMultiple, KEYS };
