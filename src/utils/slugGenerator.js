const { nanoid } = require('nanoid');

function generateSlug(length = 7) {
  return nanoid(length);
}

module.exports = { generateSlug };
