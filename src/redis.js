const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('Redis error:', err.message);
  }
});

module.exports = redis;
