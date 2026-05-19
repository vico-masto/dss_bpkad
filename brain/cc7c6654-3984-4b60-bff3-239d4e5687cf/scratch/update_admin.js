const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({
  connectionString: 'postgresql://postgres:v1ckh0Masto04@localhost:5432/dss_bpkad'
});

async function updateAdmin() {
  try {
    await client.connect();
    console.log('Connected to database');

    const newUsername = 'vigit';
    const newPassword = 'vigit1904';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 1. Delete all admin users except the target
    await client.query("DELETE FROM users WHERE role = 'admin' AND username != $1", [newUsername]);
    
    // 2. Check if 'vigit' exists
    const res = await client.query("SELECT id FROM users WHERE username = $1", [newUsername]);
    
    if (res.rows.length > 0) {
      // Update existing
      await client.query(
        "UPDATE users SET password_hash = $1, role = 'admin' WHERE username = $2",
        [hashedPassword, newUsername]
      );
      console.log('User vigit updated successfully');
    } else {
      // Create new
      await client.query(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
        [newUsername, hashedPassword]
      );
      console.log('User vigit created successfully');
    }

    // 3. Ensure NO OTHER admin exists
    await client.query("DELETE FROM users WHERE role = 'admin' AND username != 'vigit'");

    console.log('Admin cleanup complete. Only vigit remains as admin.');
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

updateAdmin();
