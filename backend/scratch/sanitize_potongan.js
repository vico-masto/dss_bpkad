const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function sanitizePotongan() {
    console.log("Memulai Audit Integritas Status Potongan...");
    
    try {
        // 1. Ambil semua potongan yang statusnya SUDAH atau ANOMALI
        const potongan = await prisma.data_sp2d_potongan.findMany({
            where: {
                status_rekon: { not: 'BELUM' }
            },
            select: { id: true, status_rekon: true, nomor_sp2d: true }
        });

        console.log(`Mengecek ${potongan.length} data potongan...`);

        // 2. Ambil semua ref_bku_id dari bank_statement
        const bankRefs = await prisma.bank_statement.findMany({
            where: { is_matched: true, ref_bku_id: { not: null } },
            select: { ref_bku_id: true }
        });
        const refSet = new Set(bankRefs.map(b => b.ref_bku_id));

        const toReset = [];
        for (const p of potongan) {
            if (!refSet.has(p.id)) {
                // Ghost Match detected!
                toReset.push(p.id);
            }
        }

        console.log(`Ditemukan ${toReset.length} data potongan 'Ghost Match' (Status SUDAH tapi tidak ada di Bank).`);

        if (toReset.length > 0) {
            console.log("Melakukan reset status ke 'BELUM'...");
            const batchSize = 100;
            for (let i = 0; i < toReset.length; i += batchSize) {
                const batch = toReset.slice(i, i + batchSize);
                await prisma.data_sp2d_potongan.updateMany({
                    where: { id: { in: batch } },
                    data: { 
                        status_rekon: 'BELUM',
                        selisih_rekon: 0,
                        keterangan_rekon: null,
                        tanggal_pencairan: null
                    }
                });
            }
            console.log("Reset selesai.");
        } else {
            console.log("Tidak ada data yang perlu di-reset.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

sanitizePotongan();
