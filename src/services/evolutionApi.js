const db = require('../db');
const settings = require('./settings');

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return '55' + digits;
}

async function getActiveInstance() {
  // Tenta instância conectada da tabela evolution_instances
  try {
    const { rows } = await db.query(
      'SELECT * FROM evolution_instances WHERE is_connected = true ORDER BY created_at ASC LIMIT 1'
    );
    if (rows.length) return { baseUrl: rows[0].api_url, apiKey: rows[0].api_key, instance: rows[0].instance_name };
    // Fallback: qualquer instância cadastrada
    const { rows: any } = await db.query(
      'SELECT * FROM evolution_instances ORDER BY created_at ASC LIMIT 1'
    );
    if (any.length) return { baseUrl: any[0].api_url, apiKey: any[0].api_key, instance: any[0].instance_name };
  } catch {}

  // Fallback final: platform_settings (legado)
  const all = await settings.getAll();
  if (all.evolution_api_url && all.evolution_api_key && all.evolution_instance) {
    return { baseUrl: all.evolution_api_url, apiKey: all.evolution_api_key, instance: all.evolution_instance };
  }
  return null;
}

async function sendWhatsApp(phone, message) {
  try {
    const inst = await getActiveInstance();
    if (!inst) {
      console.log('[evolution] nenhuma instância configurada — disparo ignorado');
      return false;
    }

    const number = normalizePhone(phone);
    const url = `${inst.baseUrl.replace(/\/$/, '')}/message/sendText/${inst.instance}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: inst.apiKey },
      body: JSON.stringify({ number, text: message }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[evolution] falha ${res.status}: ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[evolution] erro:', err.message);
    return false;
  }
}

module.exports = { sendWhatsApp };
