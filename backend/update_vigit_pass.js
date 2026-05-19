const db = require('./config/db');
const bcrypt = require('bcrypt');

async function updatePassword() {
    try {
        const hash = await bcrypt.hash('vigit190487', 10);
        const res = await db.query(
            "UPDATE users SET password_hash = $1 WHERE username = $2",
            [hash, 'vigit']
        );
        
        if (res.rowCount > 0) {
            console.log("✅ Berhasil! Password untuk user 'vigit' telah diperbarui.");
        } else {
            console.log("❌ Gagal! User 'vigit' tidak ditemukan.");
        }
    } catch (e) {
        console.error("❌ Terjadi kesalahan:", e.message);
    } finally {
        process.exit();
    }
}

updatePassword();
