const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAnomalies() {
  const anomalies = await prisma.bank_statement.findMany({
    where: {
      is_matched: true,
      selisih_nilai: { not: 0 }
    }
  });

  let sum = 0;
  anomalies.forEach(a => {
    console.log(`ID: ${a.id} | Diff: ${a.selisih_nilai} | Catatan: ${a.catatan_selisih}`);
    sum += Number(a.selisih_nilai);
  });
  console.log(`TOTAL ANOMALI: ${sum}`);
}

checkAnomalies().finally(() => prisma.$disconnect());
