const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeSum() {
  const vals = [1046883693, 2969724700, 37142000, 1627000, 1484870221, 9705000, 5560000, 6646200, 45255000, 889400, 16113782, 7645000, 12829000, 21120000, 3750000, 12090000];
  const sum = vals.reduce((a, b) => a + b, 0);
  console.log("Sum of May 13 unmatched SP2Ds:", sum);
  
  // See if there's any bank statement with this sum or close to this sum on May 13
  const bs = await prisma.bank_statement.findMany({
    where: {
      tanggal: {
        gte: new Date('2026-05-13T00:00:00.000Z'),
        lte: new Date('2026-05-14T23:59:59.999Z') // check May 13-14
      }
    }
  });
  
  console.log("Bank statements on May 13-14:");
  bs.forEach(b => {
    if (Number(b.debet) > 1000000000) {
       console.log(`Date: ${b.tanggal}, Debit: ${b.debet}, Desc: ${b.deskripsi}`);
    }
  });
}

analyzeSum().catch(console.error).finally(() => prisma.$disconnect());
