const BOT_PATTERNS = [
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
  'yandexbot', 'sogou', 'exabot', 'facebot', 'facebookexternalhit',
  'ia_archiver', 'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot',
  'rogerbot', 'screaming frog', 'sitebulb', 'crawler', 'spider',
  'wget/', 'curl/', 'python-requests', 'go-http-client', 'java/',
  'libwww-perl', 'twitterbot', 'linkedinbot', 'whatsapp/', 'telegrambot',
  'applebot', 'petalbot', 'bytespider', 'gptbot', 'claudebot',
  'ccbot', 'dataforseobot', 'pinterestbot', 'discordbot',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(p => ua.includes(p));
}

module.exports = { isBot };
