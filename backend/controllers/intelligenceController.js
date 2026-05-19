const dssService = require('../services/dssService');
const aiService = require('../services/aiService');
const prisma = require('../prismaClient');

const getIntelligenceReport = async (req, res) => {
  try {
    const [trends, health, audit] = await Promise.all([
      dssService.getTrendAnalysis(),
      dssService.getLiquidityHealthScore(),
      dssService.runAuditCompliance()
    ]);

    res.json({
      trends,
      health,
      audit
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const chatWithAI = async (req, res) => {
  const { message, history } = req.body;
  
  if (!message) {
    return res.status(400).json({ message: 'Message is required' });
  }

  try {
    // 1. Gather Context
    const currentYear = new Date().getFullYear();
    const unmatchedBank = await prisma.bank_statement.count({ where: { is_matched: false } });
    const unmatchedSp2d = await prisma.data_sp2d.count({ where: { status_rekon: 'BELUM' } });
    
    const bankD = await prisma.bank_statement.aggregate({ _sum: { debet: true }, where: { is_matched: false } });
    const bankK = await prisma.bank_statement.aggregate({ _sum: { kredit: true }, where: { is_matched: false } });
    
    // Latest balance
    const latestBank = await prisma.bank_statement.findFirst({ orderBy: [{ tanggal: 'desc' }, { id: 'desc' }] });
    const saldoBank = latestBank ? latestBank.saldo_akhir : 0;

    const systemPrompt = `
Anda adalah "Bro Jenius", asisten AI tingkat lanjut yang dirancang khusus untuk audit keuangan BPKAD. Anda bukan sekadar bot, melainkan Master Architect yang menguasai sistem "Midnight Audit".

Kepribadian:
- Profesional, cerdas, solutif, dan sedikit santai (menggunakan panggilan "Bro" kepada user).
- Sangat menjunjung tinggi integritas data dan estetika visual.

Status Keuangan Real-time BPKAD:
- Tahun Anggaran: ${currentYear}
- Saldo Rekening Koran Terakhir: Rp ${Number(saldoBank).toLocaleString('id-ID')}
- Transaksi Bank Belum Cocok: ${unmatchedBank} item (Debit: Rp ${Number(bankD._sum.debet || 0).toLocaleString('id-ID')}, Kredit: Rp ${Number(bankK._sum.kredit || 0).toLocaleString('id-ID')})
- SP2D Belum Cocok: ${unmatchedSp2d} item

Aturan Audit Utama (Midnight Protocol):
1. Triple-Lock Security: Setiap transaksi dicek melalui 3 lapisan validasi (Status, Referensi Bank, dan NOT EXISTS query) untuk menjamin tidak ada pencocokan ganda atau data korup.
2. Fast-Track Penerimaan (New - 2026-05-17): Khusus untuk data Penerimaan/Pendapatan, jika Tanggal dan Nilai sama persis antara BKU dan Bank, sistem akan langsung mencocokkan secara otomatis tanpa keraguan.
3. Rentang Waktu Rekon: Kita menggunakan jendela waktu 14 hari (H-1 s/d H+14) untuk pengeluaran belanja guna menangani keterlambatan kliring bank.
4. Anomali: Selisih > Rp 100.000 dianggap "High Anomaly" dan harus segera ditindaklanjuti.

Tugas Anda:
- Menjelaskan aturan "Fast-Track Penerimaan" jika user bertanya tentang cara kerja rekon pendapatan.
- Memberikan saran strategis untuk menyelesaikan selisih rekon menggunakan protokol Triple-Lock.
- Menjelaskan aturan audit BPKAD dengan bahasa yang jenius namun mudah dimengerti.
- WAJIB menggunakan format Markdown:
  * Gunakan **tebal** untuk poin penting.
  * Gunakan daftar poin (bullet points) untuk rincian.
  * Gunakan TABEL jika membandingkan data.
`;

    // 2. Execute via AI Service (Primary: DeepSeek, Fallback: Gemini)
    const reply = await aiService.getResponse(message, history || [], systemPrompt, 'deepseek');
    
    res.json({ reply });
  } catch (err) {
    console.error('[AI CHAT ERROR]', err);
    
    if (err.message === 'SALDO_OPENROUTER_HABIS') {
       return res.json({ 
         reply: "Bro, saldo di OpenRouter Bapak sudah habis nih. Tolong di-top up dulu ya di dashboard OpenRouter biar saya bisa mikir lagi pakai DeepSeek!" 
       });
    }

    if (err.message && err.message.includes('OPENROUTER_API_KEY')) {
      return res.json({ reply: 'Halo! Saya Bro Jenius. Kunci OpenRouter belum dipasang nih. Kabari admin ya.' });
    }

    if (err.message && (err.message.includes('429') || err.message.includes('Quota'))) {
      return res.json({ reply: 'Maaf Bro, kuota AI (Gemini/OpenRouter) sudah mentok. Coba lagi nanti atau cek billing ya.' });
    }

    res.json({ 
      reply: `Waduh Bro, sepertinya kedua otak AI saya (OpenRouter & Gemini) lagi mogok barengan nih. 😅 
      
      Penyebab teknis: ${err.message}. 
      
      Coba cek saldo OpenRouter atau API Key-nya lagi ya. Sementara saya standby dulu!` 
    });
  }
};

module.exports = {
  getIntelligenceReport,
  chatWithAI
};
