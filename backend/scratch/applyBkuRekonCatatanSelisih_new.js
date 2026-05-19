/**
 * Set status rekon + catatan selisih pada baris BKU yang cocok dengan mutasi bank.
 */
async function applyBkuRekonCatatanSelisih({
  bkuId,
  bankItem,
  bankAmount,
  bkuAmount,
  diff,
  absDiff,
  status_rekon,
  sp2dRow = null,
  keterangan_admin = null
}) {
  const idStr = String(bkuId);
  const finalStatus = status_rekon || 'SUDAH';
  const catatanSistem = absDiff > 0 ? buildCatatanSelisihRekon(bankItem, bankAmount, bkuAmount, diff) : null;
  
  // Gabungkan catatan otomatis sistem dengan catatan manual admin
  let finalCatatan = catatanSistem;
  if (keterangan_admin) {
    finalCatatan = catatanSistem 
      ? `${catatanSistem} | Catatan Admin: ${keterangan_admin}` 
      : `Catatan Admin: ${keterangan_admin}`;
  }

  const updates = [];
  const tanggal_pencairan = bankItem.tanggal ? new Date(bankItem.tanggal) : new Date();

  if (sp2dRow) {
    // 1. Update SP2D Utama
    updates.push(prisma.data_sp2d.update({
      where: { id: idStr },
      data: {
        status_rekon: finalStatus,
        selisih_rekon: absDiff > 0 ? diff : 0,
        keterangan_rekon: finalCatatan,
        tanggal_pencairan
      },
    }));

    // 2. Cascading ke Potongan (Sinkron Tanggal Cair)
    updates.push(prisma.data_sp2d_potongan.updateMany({
      where: { id_sp2d: idStr },
      data: { 
        tanggal_pencairan,
        // Gunakan catatan admin jika ada, jika tidak pakai log standar
        keterangan_rekon: finalCatatan || `[LOG] Induk SP2D ${sp2dRow.nomor} telah cair pada ${tanggal_pencairan.toISOString().split('T')[0]}`
      },
    }));
  } else {
    // Jalankan pengecekan tabel satu per satu secara berurutan jika bukan SP2D
    const pot = await prisma.data_sp2d_potongan.findUnique({ where: { id: idStr } });
    if (pot) {
      updates.push(prisma.data_sp2d_potongan.update({
        where: { id: idStr },
        data: {
          status_rekon: finalStatus,
          selisih_rekon: absDiff > 0 ? diff : 0,
          keterangan_rekon: finalCatatan,
          tanggal_pencairan
        }
      }));
    } else {
      const sjk = await prisma.setoran_pajak.findUnique({ where: { id: idStr } });
      if (sjk) {
        updates.push(prisma.setoran_pajak.update({
          where: { id: idStr },
          data: {
            status_rekon: finalStatus,
            selisih_rekon: absDiff > 0 ? diff : 0,
            keterangan_rekon: finalCatatan,
            tanggal_pencairan
          }
        }));
      } else {
        const pnd = await prisma.data_pendapatan.findUnique({ where: { id: idStr } });
        if (pnd) {
          updates.push(prisma.data_pendapatan.update({
            where: { id: idStr },
            data: {
              status_rekon: finalStatus,
              selisih_rekon: absDiff > 0 ? diff : 0,
              keterangan_rekon: finalCatatan,
              tanggal_pencairan
            }
          }));
        }
      }
    }
  }

  if (updates.length > 0) {
    return prisma.$transaction(updates);
  }
}
