const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addIndex() {
  console.log('Starting index creation...');
  try {
    // 1. Index for ref_bku_id in bank_statement
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_bank_ref_bku_id ON bank_statement(ref_bku_id)');
    console.log('Index idx_bank_ref_bku_id created');

    // 2. Index for status_rekon in bank_statement (for performance on filter)
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_bank_is_matched ON bank_statement(is_matched)');
    console.log('Index idx_bank_is_matched verified');

  } catch (e) {
    console.error('Operation failed:', e.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

addIndex();
