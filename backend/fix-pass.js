const db = require('./config/db');
const bcrypt = require('bcrypt');

const updatePassword = async () => {
    const hash = await bcrypt.hash('admin123', 10);
    try {
        await db.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, 'admin']);
        console.log('✅ Password for admin updated successfully with hash:', hash);
    } catch (err) {
        console.error('❌ Error updating password:', err.message);
    } finally {
        process.exit();
    }
};

updatePassword();
