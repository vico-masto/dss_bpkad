const prisma = require('../prismaClient');
const auditService = require('../services/auditService');

/**
 * Update atau Insert Saldo Awal
 */
const saveSaldoAwal = async (req, res) => {
  const { tahun, data, id_sumber_dana, nilai } = req.body;

  try {
    const itemsToProcess = [];
    
    if (data && Array.isArray(data)) {
      itemsToProcess.push(...data);
    } else if (id_sumber_dana) {
      itemsToProcess.push({ id_sumber_dana, nilai });
    } else {
      return res.status(400).json({ message: 'Format data tidak valid. Sertakan "data" (array) atau "id_sumber_dana" dan "nilai".' });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of itemsToProcess) {
        const targetSource = item.id_sumber_dana || item.id;
        const targetValue = (item.nilai !== undefined) ? item.nilai : (item.saldo_awal || 0);

        if (!targetSource) continue;

        const id = `SA-${tahun}-${targetSource}`;
        
        await tx.saldo_awal.upsert({
          where: { id },
          update: {
            nilai: parseFloat(targetValue),
            created_at: new Date()
          },
          create: {
            id,
            id_sumber_dana: targetSource,
            tahun: parseInt(tahun),
            nilai: parseFloat(targetValue)
          }
        });
      }
    });

    await auditService.logActivity(req, 'UPDATE', 'SALDO_AWAL', `Update Saldo Awal TA ${tahun} (${itemsToProcess.length} item)`);

    res.json({ message: 'Saldo awal berhasil diperbarui' });
  } catch (err) {
    console.error('ERROR SAVE SALDO AWAL:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const getSaldoAwalList = async (req, res) => {
  const { tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();

  try {
    const result = await prisma.master_sumber_dana.findMany({
      select: {
        id: true,
        nama: true,
        saldo_awal: {
          where: { tahun: targetTahun },
          select: { nilai: true, tahun: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    // Flattening for frontend compatibility
    const flattened = result.map(s => ({
      id: s.id,
      nama: s.nama,
      nilai: s.saldo_awal[0]?.nilai || 0,
      tahun: s.saldo_awal[0]?.tahun || targetTahun
    }));

    res.json(flattened);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  saveSaldoAwal,
  getSaldoAwalList
};
