const db = require('../../db');
const { customAlphabet } = require('nanoid');
const { sendWhatsApp } = require('../../services/evolutionApi');

const nanoidInvite = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits.length >= 12 && digits.length <= 13;
  return digits.length >= 10 && digits.length <= 11;
}

function buildWhatsAppMessage({ invitedName, referrerName, baseUrl, inviteCode }) {
  return (
    `Olá, ${invitedName}! 🎉\n\n` +
    `*${referrerName}* te convidou para a *Frequência Ativa*!\n\n` +
    `Para garantir sua vaga, acesse o link abaixo:\n` +
    `${baseUrl}/convite/${inviteCode}\n\n` +
    `Seu código exclusivo: *${inviteCode}*\n\n` +
    `⚠️ Este código é de uso único e exclusivo para você.`
  );
}

module.exports = async function (fastify) {

  // ── Público: processar indicação ──────────────────────────────────────────

  fastify.post('/referrals/indicate', {
    config: { skipAuth: true },
  }, async (req, reply) => {
    const {
      program_slug,
      referrer_name, referrer_phone, referrer_email,
      invited_name, invited_phone,
      utm_data,
    } = req.body || {};

    if (!program_slug || !referrer_name || !referrer_phone || !invited_name || !invited_phone) {
      return reply.status(400).send({ error: 'Campos obrigatórios: program_slug, referrer_name, referrer_phone, invited_name, invited_phone' });
    }
    if (!isValidPhone(referrer_phone)) {
      return reply.status(400).send({ error: 'Número de WhatsApp do indicador inválido. Verifique o DDD e os dígitos.' });
    }
    if (!isValidPhone(invited_phone)) {
      return reply.status(400).send({ error: 'Número de WhatsApp do convidado inválido. Verifique o DDD e os dígitos.' });
    }

    const progResult = await db.query(
      'SELECT id, name, group_redirect_url, utm_parameters, max_referrals_per_referrer FROM referral_programs WHERE slug = $1 AND active = true',
      [program_slug]
    );
    if (!progResult.rows.length) {
      return reply.status(404).send({ error: 'Programa de indicação não encontrado ou inativo' });
    }
    const program = progResult.rows[0];

    // Verifica limite de indicações por indicador (por telefone)
    if (program.max_referrals_per_referrer) {
      const countRes = await db.query(
        'SELECT COUNT(*) FROM referrals WHERE program_id = $1 AND referrer_phone = $2',
        [program.id, referrer_phone.trim()]
      );
      if (parseInt(countRes.rows[0].count) >= program.max_referrals_per_referrer) {
        return reply.status(429).send({
          error: `Você já atingiu o limite de ${program.max_referrals_per_referrer} indicação(ões) para este programa`,
        });
      }
    }

    // Mescla UTMs do programa (padrão) com UTMs da requisição (prevalecem)
    const mergedUtm = { ...(program.utm_parameters || {}), ...(utm_data || {}) };

    // Gera código único com retry em caso de colisão (improvável)
    let inviteCode;
    for (let i = 0; i < 5; i++) {
      const candidate = nanoidInvite();
      const exists = await db.query('SELECT id FROM referrals WHERE invite_code = $1', [candidate]);
      if (!exists.rows.length) { inviteCode = candidate; break; }
    }
    if (!inviteCode) return reply.status(500).send({ error: 'Erro ao gerar código' });

    const { rows } = await db.query(
      `INSERT INTO referrals
         (program_id, referrer_name, referrer_phone, referrer_email,
          invited_name, invited_phone, invite_code, utm_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, invite_code, invited_name, invited_phone`,
      [
        program.id,
        referrer_name.trim(),
        referrer_phone.trim(),
        referrer_email ? referrer_email.trim() : null,
        invited_name.trim(),
        invited_phone.trim(),
        inviteCode,
        JSON.stringify(mergedUtm),
      ]
    );

    const referral = rows[0];
    const baseUrl = `${req.protocol}://${req.hostname}`;
    const message = buildWhatsAppMessage({
      invitedName: referral.invited_name,
      referrerName: referrer_name.trim(),
      baseUrl,
      inviteCode: referral.invite_code,
    });

    // Fire-and-forget — nunca bloqueia a resposta
    sendWhatsApp(referral.invited_phone, message).then(async (sent) => {
      if (sent) {
        await db.query('UPDATE referrals SET whatsapp_sent = true WHERE id = $1', [referral.id]);
      }
    }).catch(() => {});

    return reply.status(201).send({
      invite_code: referral.invite_code,
      invited_name: referral.invited_name,
      invited_phone: referral.invited_phone,
      message_preview: message,
      claim_url: `${baseUrl}/convite/${referral.invite_code}`,
    });
  });

  // ── Público: reivindicar vaga ─────────────────────────────────────────────

  fastify.post('/referrals/claim', {
    config: { skipAuth: true },
  }, async (req, reply) => {
    const { invite_code, claimed_name, claimed_email, claimed_phone } = req.body || {};

    if (!invite_code || !claimed_name || !claimed_email || !claimed_phone) {
      return reply.status(400).send({ error: 'Campos obrigatórios: invite_code, claimed_name, claimed_email, claimed_phone' });
    }

    const { rows } = await db.query(
      `SELECT r.id, r.status, r.referrer_name, r.referrer_phone,
              r.invited_name, r.invited_phone, r.invite_code,
              p.group_redirect_url, p.webhook_url, p.name AS program_name,
              p.utm_parameters
       FROM referrals r
       JOIN referral_programs p ON p.id = r.program_id
       WHERE r.invite_code = $1`,
      [invite_code.trim().toUpperCase()]
    );

    if (!rows.length) {
      return reply.status(404).send({ error: 'Código inválido' });
    }

    const referral = rows[0];

    if (referral.status === 'claimed') {
      return reply.status(409).send({ error: 'Este código já foi utilizado' });
    }

    const name  = claimed_name.trim();
    const email = claimed_email.trim();
    const phone = claimed_phone.trim();

    await db.query(
      `UPDATE referrals SET
         status = 'claimed',
         claimed_name = $1,
         claimed_email = $2,
         claimed_phone = $3,
         claimed_at = NOW()
       WHERE id = $4`,
      [name, email, phone, referral.id]
    );

    // Disparo de webhook externo — fire-and-forget
    if (referral.webhook_url) {
      fetch(referral.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'referral_claimed',
          program: referral.program_name,
          claimed: { name, email, phone },
          referrer: { name: referral.referrer_name, phone: referral.referrer_phone },
          invite_code: referral.invite_code,
          claimed_at: new Date().toISOString(),
        }),
      }).catch(err => console.error('[referral webhook]', err.message));
    }

    // Appenda UTMs do programa ao link de redirect
    let redirectUrl = referral.group_redirect_url || null;
    if (redirectUrl) {
      const utmEntries = Object.entries(referral.utm_parameters || {}).filter(([, v]) => v);
      if (utmEntries.length) {
        const qs = utmEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + qs;
      }
    }

    return reply.send({ group_redirect_url: redirectUrl });
  });

  // ── Público: config de branding do programa ──────────────────────────────

  fastify.get('/referrals/brand/:slug', {
    config: { skipAuth: true },
  }, async (req, reply) => {
    const { rows } = await db.query(
      `SELECT slug, form_title, form_subtitle,
              brand_logo_url, brand_primary_color, brand_secondary_color,
              utm_parameters, active
       FROM referral_programs WHERE slug = $1`,
      [req.params.slug]
    );
    if (!rows.length || !rows[0].active) {
      return reply.status(404).send({ error: 'Programa não encontrado' });
    }
    return rows[0];
  });

  // ── Admin: listar indicações ──────────────────────────────────────────────

  fastify.get('/referrals', async (req) => {
    const { program_id, limit = 100 } = req.query;
    const params = [Math.min(parseInt(limit), 500)];
    let filter = '';

    if (program_id) {
      params.push(program_id);
      filter = `WHERE r.program_id = $${params.length}`;
    }

    const { rows } = await db.query(`
      SELECT
        r.id, r.invite_code, r.status,
        r.referrer_name, r.referrer_phone, r.referrer_email,
        r.invited_name, r.invited_phone,
        r.claimed_name, r.claimed_email, r.claimed_phone, r.claimed_at,
        r.whatsapp_sent, r.utm_data, r.created_at,
        p.name AS program_name, p.slug AS program_slug
      FROM referrals r
      JOIN referral_programs p ON p.id = r.program_id
      ${filter}
      ORDER BY r.created_at DESC
      LIMIT $1
    `, params);

    return rows;
  });
};
