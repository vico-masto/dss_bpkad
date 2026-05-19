const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addIndexes() {
  try {
    console.log("Adding indexes...");
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_data_pendapatan_tanggal" ON "data_pendapatan"("tanggal");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_data_pendapatan_status_rekon" ON "data_pendapatan"("status_rekon");`);
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_data_sp2d_tanggal" ON "data_sp2d"("tanggal");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_data_sp2d_status_rekon" ON "data_sp2d"("status_rekon");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_data_sp2d_opd" ON "data_sp2d"("opd");`);
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bank_statement_tanggal" ON "bank_statement"("tanggal");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_bank_statement_is_matched" ON "bank_statement"("is_matched");`);
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_data_sp2d_potongan_tanggal" ON "data_sp2d_potongan"("tanggal_pencairan");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_data_sp2d_potongan_status" ON "data_sp2d_potongan"("status_rekon");`);
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_setoran_pajak_tanggal" ON "setoran_pajak"("tanggal");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_setoran_pajak_status" ON "setoran_pajak"("status_rekon");`);
    
    console.log("Indexes added successfully!");
  } catch (error) {
    console.error("Error adding indexes:", error);
  } finally {
    await prisma.$disconnect();
  }
}

addIndexes();
