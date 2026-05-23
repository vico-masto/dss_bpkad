const prisma = require('../prismaClient');
const { Prisma } = require('@prisma/client');

/**
 * Get all saved scenarios
 */
const getScenarios = async (req, res) => {
  try {
    const data = await prisma.simulator_scenarios.findMany({
      orderBy: { updated_at: 'desc' }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Save or update a scenario
 */
const saveScenario = async (req, res) => {
  const { id, name, items } = req.body;
  try {
    if (id) {
      const result = await prisma.simulator_scenarios.update({
        where: { id: id },
        data: {
          name,
          items: items, // Prisma handles JSON automatically if defined as Json in schema
          updated_at: new Date()
        }
      });
      return res.json(result);
    } else {
      const result = await prisma.simulator_scenarios.create({
        data: {
          name,
          items: items
        }
      });
      return res.json(result);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Delete a scenario
 */
const deleteScenario = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.simulator_scenarios.delete({
      where: { id: id }
    });
    res.json({ message: 'Scenario deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Get Revenue Projections
 */
const getProjections = async (req, res) => {
  const { tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();
  try {
    const data = await prisma.proyeksi_pendapatan.findMany({
      where: { tahun: targetTahun },
      include: {
        master_sumber_dana: {
          select: { nama: true }
        }
      },
      orderBy: { bulan: 'asc' }
    });

    const formatted = data.map(p => ({
      ...p,
      sumber_dana_nama: p.master_sumber_dana?.nama
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Add or update projection
 */
const upsertProjection = async (req, res) => {
  const { id, bulan, tahun, id_sumber_dana, nilai, keterangan } = req.body;
  try {
    if (id) {
      const result = await prisma.proyeksi_pendapatan.update({
        where: { id: parseInt(id) },
        data: {
          bulan: parseInt(bulan),
          tahun: parseInt(tahun),
          id_sumber_dana,
          nilai: parseFloat(nilai),
          keterangan
        }
      });
      res.json(result);
    } else {
      const result = await prisma.proyeksi_pendapatan.create({
        data: {
          bulan: parseInt(bulan),
          tahun: parseInt(tahun),
          id_sumber_dana,
          nilai: parseFloat(nilai),
          keterangan
        }
      });
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Server-side 12-month cash flow engine
 * Body: { tahun, simulatedItems: [{amount, priority, label}], projections: [{bulan, nilai}] }
 */
const runSimulation = async (req, res) => {
  const { tahun, simulatedItems = [], projections = [] } = req.body;
  const targetYear = parseInt(tahun) || new Date().getFullYear();
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12

  try {
    // 1. Saldo awal tahun
    const saldoRows = await prisma.saldo_awal.findMany({ where: { tahun: targetYear } });
    const saldoAwal = saldoRows.reduce((s, r) => s + Number(r.nilai), 0);

    // 2. Monthly actual inflows (data_pendapatan)
    const inflowRaw = await prisma.$queryRaw(Prisma.sql`
      SELECT EXTRACT(MONTH FROM tanggal)::int AS bulan, SUM(nilai)::float AS total
      FROM data_pendapatan
      WHERE tahun = ${targetYear}
      GROUP BY bulan ORDER BY bulan
    `);
    const inflowByMonth = {};
    inflowRaw.forEach(r => { inflowByMonth[r.bulan] = r.total || 0; });

    // 3. Monthly actual outflows (data_sp2d) — SUDAH_BRUTO uses nilai_bruto, else nilai_neto
    const outflowRaw = await prisma.$queryRaw(Prisma.sql`
      SELECT
        EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int AS bulan,
        SUM(
          CASE WHEN status_dana = 'SUDAH_BRUTO' THEN nilai_bruto
               ELSE COALESCE(nilai_bruto - nilai_potongan, nilai_bruto) END
        )::float AS total
      FROM data_sp2d
      WHERE tahun = ${targetYear}
      GROUP BY bulan ORDER BY bulan
    `);
    const outflowByMonth = {};
    outflowRaw.forEach(r => { outflowByMonth[r.bulan] = r.total || 0; });

    // 4. Projection inflows by month (user-managed)
    const projByMonth = {};
    projections.forEach(p => {
      const b = parseInt(p.bulan);
      projByMonth[b] = (projByMonth[b] || 0) + Number(p.nilai || 0);
    });

    // 5. Simulated outflows (from scenario items) — applied to current month
    const simMandatory = simulatedItems.filter(i => i.priority === 'mandatory').reduce((s, i) => s + Number(i.amount || 0), 0);
    const simDiscretionary = simulatedItems.filter(i => i.priority !== 'mandatory').reduce((s, i) => s + Number(i.amount || 0), 0);
    const simTotal = simMandatory + simDiscretionary;

    // 6. Build 12-month timeline
    const timeline = [];
    let runningBalance = saldoAwal;

    for (let m = 1; m <= 12; m++) {
      const isPast = m < currentMonth;
      const isCurrent = m === currentMonth;

      const actualInflow = inflowByMonth[m] || 0;
      const projectedInflow = projByMonth[m] || 0;
      const inflow = isPast ? actualInflow : (isCurrent ? actualInflow + projectedInflow : projectedInflow);

      const actualOutflow = outflowByMonth[m] || 0;
      const simulatedOutflow = isCurrent ? simTotal : 0;
      const outflow = actualOutflow + simulatedOutflow;

      const netFlow = inflow - outflow;
      runningBalance += netFlow;

      timeline.push({
        bulan: m,
        isPast,
        isCurrent,
        inflow,
        outflow,
        netFlow,
        saldo: runningBalance,
        isDeficit: runningBalance < 0,
        isCritical: runningBalance >= 0 && runningBalance < saldoAwal * 0.1
      });
    }

    // 7. Compute liquidity metrics
    const futureMonths = timeline.filter(t => !t.isPast);
    const avgMonthlyOutflow = futureMonths.reduce((s, t) => s + t.outflow, 0) / Math.max(futureMonths.length, 1);
    const currentSaldo = timeline[currentMonth - 1]?.saldo || 0;
    const dailyBurnRate = avgMonthlyOutflow / 30;
    const daysOfCash = dailyBurnRate > 0 ? Math.floor(currentSaldo / dailyBurnRate) : 999;

    const totalOutflow12m = timeline.reduce((s, t) => s + t.outflow, 0);
    const mandatoryRatio = totalOutflow12m > 0 ? (simMandatory / (simMandatory + simDiscretionary || 1)) * 100 : 0;

    const deficitMonths = timeline.filter(t => t.isDeficit).map(t => t.bulan);
    const criticalMonths = timeline.filter(t => t.isCritical).map(t => t.bulan);

    // Concentration risk: largest single outflow month vs total
    const maxMonthOutflow = Math.max(...timeline.map(t => t.outflow), 0);
    const concentrationRisk = totalOutflow12m > 0 ? (maxMonthOutflow / totalOutflow12m) * 100 : 0;

    res.json({
      tahun: targetYear,
      saldoAwal,
      timeline,
      metrics: {
        daysOfCash,
        dailyBurnRate,
        mandatoryRatio,
        concentrationRisk,
        deficitMonths,
        criticalMonths,
        currentSaldo,
        simMandatory,
        simDiscretionary
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Auto-generate inflow projections from historical pendapatan (3-year monthly avg)
 */
const autoProjectInflow = async (req, res) => {
  const { tahun } = req.query;
  const targetYear = parseInt(tahun) || new Date().getFullYear();

  try {
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT
        EXTRACT(MONTH FROM tanggal)::int AS bulan,
        id_sumber_dana,
        AVG(monthly_total)::float AS avg_nilai
      FROM (
        SELECT
          EXTRACT(MONTH FROM tanggal)::int AS bulan,
          EXTRACT(YEAR FROM tanggal)::int AS tahun_data,
          id_sumber_dana,
          SUM(nilai)::float AS monthly_total
        FROM data_pendapatan
        WHERE tahun BETWEEN ${targetYear - 3} AND ${targetYear - 1}
        GROUP BY bulan, tahun_data, id_sumber_dana
      ) sub
      GROUP BY bulan, id_sumber_dana
      ORDER BY bulan, id_sumber_dana
    `);

    // Fetch sumber dana names
    const sumberDanaList = await prisma.master_sumber_dana.findMany({ select: { id: true, nama: true } });
    const sdMap = {};
    sumberDanaList.forEach(s => { sdMap[s.id] = s.nama; });

    const projections = rows.map(r => ({
      bulan: r.bulan,
      id_sumber_dana: r.id_sumber_dana,
      sumber_dana_nama: r.id_sumber_dana ? (sdMap[r.id_sumber_dana] || r.id_sumber_dana) : 'Tidak Diketahui',
      nilai: Math.round(r.avg_nilai || 0),
      keterangan: `Auto-proyeksi (rata-rata ${targetYear - 3}–${targetYear - 1})`
    }));

    res.json(projections);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  getScenarios,
  saveScenario,
  deleteScenario,
  getProjections,
  upsertProjection,
  runSimulation,
  autoProjectInflow
};
