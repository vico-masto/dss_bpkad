/**
 * BullMQ setup untuk modul Verifikasi Masal.
 * Queue terpisah + koneksi Redis terdedikasi; nilai kartu utama:
 *  - persistence job (crash-safe),
 *  - retry/backoff job bawaan,
 *  - worker berjalan sebagai proses terpisah (service docker).
 * Redis hanya dipakai modul ini - tidak mengganggu proses rekon/API.
 */
'use strict';

const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const QUEUE_NAME = 'verification-batches';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const createConnection = () => new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const queue = new Queue(QUEUE_NAME, { connection: createConnection() });

// Job options default: retry hingga 4x, backoff eksponensial dari 5 detik.
const QUEUE_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

module.exports = { queue, QUEUE_NAME, REDIS_URL, createConnection, QUEUE_JOB_OPTIONS };