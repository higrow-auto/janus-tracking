const crypto = require('crypto');
const settings = require('./settings');

const API_VERSION = 'v19.0';

function hashSha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Send an event to Meta Conversions API.
 * Never throws — errors are logged and swallowed so they never block callers.
 */
async function sendCapiEvent({ eventName, eventSourceUrl, userData = {}, customData = {} }) {
  const all = await settings.getAll();
  const pixelId     = all.meta_pixel_id;
  const accessToken = all.meta_access_token;
  const testCode    = all.meta_test_event_code;

  if (!pixelId || !accessToken) return;

  const eventTime = Math.floor(Date.now() / 1000);

  const user_data = {};
  if (userData.ip)        user_data.client_ip_address = userData.ip;
  if (userData.userAgent) user_data.client_user_agent = userData.userAgent;
  if (userData.email)     user_data.em = hashSha256(userData.email);

  const payload = {
    data: [{
      event_name: eventName,
      event_time: eventTime,
      action_source: 'website',
      event_source_url: eventSourceUrl,
      user_data,
      custom_data: Object.keys(customData).length ? customData : undefined,
    }],
  };

  if (testCode) payload.test_event_code = testCode;

  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${accessToken}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[capi] ${eventName} failed ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error(`[capi] ${eventName} error:`, err.message);
  }
}

module.exports = { sendCapiEvent };
