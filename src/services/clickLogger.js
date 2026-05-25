const db = require('../db');

function anonymizeIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) {
    // IPv6: zero last 80 bits (keep first 48)
    return ip.replace(/(:[^:]+){5}$/, ':0:0:0:0:0');
  }
  // IPv4: zero last octet
  return ip.replace(/\.\d+$/, '.0');
}

async function logClick({ linkId, ip, userAgent, referer, dynamicParams, isBot }) {
  try {
    await db.query(
      `INSERT INTO click_logs (link_id, ip_address, user_agent, referer, dynamic_params, is_bot)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        linkId,
        anonymizeIp(ip),
        userAgent || null,
        referer || null,
        JSON.stringify(dynamicParams || {}),
        Boolean(isBot),
      ]
    );
  } catch (err) {
    // Never block redirect on logging failure
    console.error('click log error:', err.message);
  }
}

module.exports = { logClick };
