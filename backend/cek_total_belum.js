const {PrismaClient} = require('./node_modules/@prisma/client');
const p = new PrismaClient();
function fmtIDR(n) { return Number(n||0).toLocaleString('id-ID',{minimumFractionDigits:2}); }
p.$queryRaw`
  SELECT TO_CHAR(tgl,'YYYY-MM') AS bulan, SUM(nilai)::DECIMAL AS unmatched_keluar
  FROM (
    SELECT COALESCE(tanggal_pencairan,tanggal) AS tgl,
           (CAST(nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)) AS nilai
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id=pot.id_sp2d
    WHERE (status_rekon IS NULL OR status_rekon='' OR status_rekon='BELUM')
      AND COALESCE(tanggal_pencairan,tanggal)::DATE BETWEEN '2026-02-01' AND '2026-04-30'
    UNION ALL
    SELECT COALESCE(pt.tanggal_pencairan,sp.tanggal_pencairan,sp.tanggal) AS tgl, CAST(pt.nilai AS DECIMAL)
    FROM data_sp2d_potongan pt
    LEFT JOIN data_sp2d sp ON pt.id_sp2d=sp.id
    WHERE (pt.status_rekon IS NULL OR pt.status_rekon='' OR pt.status_rekon='BELUM')
      AND COALESCE(pt.tanggal_pencairan,sp.tanggal_pencairan,sp.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-04-30'
  ) x GROUP BY TO_CHAR(tgl,'YYYY-MM') ORDER BY bulan
`.then(rows=>{
  let total=0;
  rows.forEach(r=>{ total+=Number(r.unmatched_keluar||0); console.log(r.bulan+': Rp '+fmtIDR(r.unmatched_keluar)); });
  console.log('TOTAL: Rp '+fmtIDR(total));
  return p.$disconnect();
}).catch(e=>{ console.error(e.message); return p.$disconnect(); });
