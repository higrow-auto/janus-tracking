function selectUrl(splitUrls) {
  if (!splitUrls || splitUrls.length === 0) return null;
  const total = splitUrls.reduce((sum, u) => sum + (Number(u.weight) || 1), 0);
  let rand = Math.random() * total;
  for (const entry of splitUrls) {
    rand -= (Number(entry.weight) || 1);
    if (rand <= 0) return entry.url;
  }
  return splitUrls[splitUrls.length - 1].url;
}

module.exports = { selectUrl };
