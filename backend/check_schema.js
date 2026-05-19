const prisma = require('./prismaClient');

async function checkSchema() {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'data_sp2d'
    `;
    console.log('Columns in data_sp2d:', JSON.stringify(columns, null, 2));
  } catch (err) {
    console.error('FAILED:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
