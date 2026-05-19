const db = require('../config/db');

/**
 * Mencatat aktivitas pengguna ke dalam audit trail
 * @param {object|string} actor - Object request (req) atau string username
 * @param {string} aksi - Jenis tindakan (TAMBAH, UBAH, HAPUS, REKON, dll)
 * @param {string} entitas - Nama tabel atau modul (SP2D, PENDAPATAN, dll)
 * @param {string} detail - Deskripsi detail aktivitas
 */
const logActivity = async (actor, aksi, entitas, detail) => {
  try {
    let username = 'SYSTEM';
    if (typeof actor === 'object' && actor?.user?.username) {
      username = actor.user.username;
    } else if (typeof actor === 'string') {
      username = actor;
    }

    const query = `
      INSERT INTO log_aktivitas (user_pelaksana, aksi, detail, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `;
    const finalDetail = `[${entitas}] ${detail}`;
    await db.query(query, [username, aksi, finalDetail]);
  } catch (err) {
    console.error('FAILED TO LOG ACTIVITY:', err.message);
  }
};

module.exports = {
  logActivity
};
