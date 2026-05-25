const settings = require('./settings');

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return '55' + digits;
}

async function sendWhatsApp(phone, message) {
  try {
    const all = await settings.getAll();
    const baseUrl  = all.evolution_api_url;
    const apiKey   = all.evolution_api_key;
    const instance = all.evolution_instance;

    if (!baseUrl || !apiKey || !instance) {
      console.log('[evolution] settings incompletas — disparo ignorado');
      return false;
    }

    const number = normalizePhone(phone);
    const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${instance}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({ number, text: message }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[evolution] falha no disparo ${res.status}: ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[evolution] erro:', err.message);
    return false;
  }
}

module.exports = { sendWhatsApp };
