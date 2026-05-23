'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Play,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Calendar,
  Loader2,
  Activity,
  Download,
  Save,
  ArrowUpRight,
  Target,
  Sparkles,
  ListFilter,
  ShieldCheck,
  Search,
  Building2,
  FileSearch,
  Flame,
  Clock,
  BarChart3,
  Cpu,
  Bot,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement,
  Title, ChartTooltip, Legend, Filler
);

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { NumericInput } from '@/components/NumericInput';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/patterns/page-header';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const BULAN_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

type SimItem = {
  timestamp: number;
  id: string;
  amount: number;
  label: string;
  sourceName?: string;
  priority: 'mandatory' | 'discretionary';
};

type TimelineMonth = {
  bulan: number;
  isPast: boolean;
  isCurrent: boolean;
  inflow: number;
  outflow: number;
  netFlow: number;
  saldo: number;
  isDeficit: boolean;
  isCritical: boolean;
};

type SimResult = {
  tahun: number;
  saldoAwal: number;
  timeline: TimelineMonth[];
  metrics: {
    daysOfCash: number;
    dailyBurnRate: number;
    mandatoryRatio: number;
    concentrationRisk: number;
    deficitMonths: number[];
    criticalMonths: number[];
    currentSaldo: number;
    simMandatory: number;
    simDiscretionary: number;
  };
};

export default function CashSimulatorPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sumberDana, setSumberDana] = useState<any[]>([]);
  const [opdList, setOpdList] = useState<{ value: string; label: string }[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projections, setProjections] = useState<any[]>([]);

  // Multi-Scenario State
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scenarios, setScenarios] = useState<any[]>([{ name: 'Skenario Utama', items: [] }]);
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);

  // Input State
  const [currentSelection, setCurrentSelection] = useState({
    id: '',
    amount: 0,
    label: '',
    priority: 'mandatory' as 'mandatory' | 'discretionary',
  });

  // Baseline from dashboard
  const [baselineKas, setBaselineKas] = useState(0);

  // Smart Injection Dialog
  const [openInjection, setOpenInjection] = useState(false);
  const [sp2dSearch, setSp2dSearch] = useState('');
  const [selectedOpd, setSelectedOpd] = useState('all');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [availableSP2Ds, setAvailableSP2Ds] = useState<any[]>([]);
  const [loadingSP2Ds, setLoadingSP2Ds] = useState(false);

  // New Scenario Dialog
  const [openNewScenario, setOpenNewScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');

  // Simulation Result (from backend engine)
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  // Manual Book Dialog
  const [openManual, setOpenManual] = useState(false);

  // AI Chat Dialog
  const [openAI, setOpenAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');

  const fetchInitialData = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const [resDana, resAnalytics, resScenarios, resProjections, resOpd] = await Promise.all([
        api.get('/dss/sumber-dana'),
        api.get('/reports/dashboard-stats', { params: { tahun: currentYear } }),
        api.get('/dss/simulator/scenarios'),
        api.get('/dss/simulator/projections'),
        api.get('/sp2d/opd'),
      ]);

      setSumberDana(resDana.data);
      setBaselineKas(resAnalytics.data.summary?.kasEfektif || 0);

      if (resScenarios.data.length > 0) setScenarios(resScenarios.data);
      setProjections(resProjections.data);

      const opds = (resOpd.data || []).map((o: { id: string; nama: string }) => ({ value: o.id, label: o.nama }));
      setOpdList([{ value: 'all', label: 'Semua OPD' }, ...opds]);
    } catch (e) {
      console.error(e);
      toast.error('Gagal memuat data simulator');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInitialData();
  }, []);

  const handleRunSimulation = async () => {
    setRunning(true);
    setSimResult(null);
    try {
      const currentYear = new Date().getFullYear();
      const items = activeScenario.items || [];
      const res = await api.post('/dss/simulator/run', {
        tahun: currentYear,
        simulatedItems: items,
        projections,
      });
      setSimResult(res.data);
      toast.success('Simulasi berhasil dijalankan');
    } catch {
      toast.error('Gagal menjalankan simulasi');
    } finally {
      setRunning(false);
    }
  };

  const handleAutoProject = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const res = await api.get('/dss/simulator/auto-project', { params: { tahun: currentYear } });
      toast.success(`${res.data.length} proyeksi otomatis berhasil dimuat`);
      const merged = [...projections];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.data.forEach((ap: any) => {
        const exists = merged.some(p => p.bulan === ap.bulan && p.id_sumber_dana === ap.id_sumber_dana);
        if (!exists) merged.push(ap);
      });
      setProjections(merged);
    } catch {
      toast.error('Gagal menghasilkan proyeksi otomatis');
    }
  };

  const handleSaveScenario = async () => {
    if (!scenarios[activeScenarioIdx]) return;
    setSaving(true);
    const scenario = scenarios[activeScenarioIdx];
    try {
      const res = await api.post('/dss/simulator/scenarios', {
        id: scenario.id,
        name: scenario.name,
        items: scenario.items || [],
      });
      const newScenarios = [...scenarios];
      newScenarios[activeScenarioIdx] = res.data;
      setScenarios(newScenarios);
      toast.success('Skenario berhasil disimpan');
    } catch {
      toast.error('Gagal menyimpan skenario');
    } finally {
      setSaving(false);
    }
  };

  const fetchSP2Ds = useCallback(async (search = '', opd = 'all') => {
    setLoadingSP2Ds(true);
    try {
      const params: Record<string, string> = { limit: '20', search };
      if (opd !== 'all') params.opd = opd;
      const res = await api.get('/sp2d', { params });
      setAvailableSP2Ds(res.data.data || []);
    } catch {
      toast.error('Gagal memuat daftar SP2D');
    } finally {
      setLoadingSP2Ds(false);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const injectSP2D = (sp2d: any) => {
    const mainDetail = sp2d.details?.[0];
    const sourceId = mainDetail?.id_sumber_dana || '';
    // eslint-disable-next-line react-hooks/purity
    const ts = Date.now() + Math.random();
    const newItem: SimItem = {
      timestamp: ts,
      id: sourceId,
      amount: Number(sp2d.nilai_bruto),
      label: `[SP2D] ${sp2d.nomor} - ${sp2d.uraian}`,
      sourceName: sourceId ? (sumberDana.find(s => s.id === sourceId)?.nama || 'Sumber Tidak Dikenal') : 'Sumber Tidak Dikenal',
      priority: sp2d.jenis?.includes('GAJI') || sp2d.jenis?.includes('PEGAWAI') ? 'mandatory' : 'discretionary',
    };
    const newScenarios = [...scenarios];
    newScenarios[activeScenarioIdx].items = [...(newScenarios[activeScenarioIdx].items || []), newItem];
    setScenarios(newScenarios);
    toast.success(`Berhasil menyuntikkan ${sp2d.nomor}`);
    setOpenInjection(false);
  };

  const applyEfficiency = () => {
    const newScenarios = [...scenarios];
    newScenarios[activeScenarioIdx].items = (newScenarios[activeScenarioIdx].items || []).filter(
      (it: SimItem) => it.priority !== 'discretionary'
    );
    setScenarios(newScenarios);
    setSimResult(null);
    toast.success('Belanja discretionary ditunda');
  };

  const activeScenario = scenarios[activeScenarioIdx] || { name: 'New', items: [] };

  const addSimulation = () => {
    if (!currentSelection.id || currentSelection.amount <= 0) {
      toast.error('Pilih sumber dana dan masukkan nilai nominal');
      return;
    }
    const source = sumberDana.find(s => s.id === currentSelection.id);
    const addTs = Date.now();
    const newScenarios = [...scenarios];
    newScenarios[activeScenarioIdx].items = [
      ...(newScenarios[activeScenarioIdx].items || []),
      { ...currentSelection, sourceName: source?.nama, timestamp: addTs },
    ];
    setScenarios(newScenarios);
    setCurrentSelection({ id: '', amount: 0, label: '', priority: 'mandatory' });
    setSimResult(null);
  };

  const removeSimulation = (timestamp: number) => {
    const newScenarios = [...scenarios];
    newScenarios[activeScenarioIdx].items = (newScenarios[activeScenarioIdx].items || []).filter(
      (i: SimItem) => i.timestamp !== timestamp
    );
    setScenarios(newScenarios);
    setSimResult(null);
  };

  const addNewScenario = () => {
    if (!newScenarioName.trim()) return;
    setScenarios([...scenarios, { name: newScenarioName.trim(), items: [] }]);
    setActiveScenarioIdx(scenarios.length);
    setNewScenarioName('');
    setOpenNewScenario(false);
  };

  const handleDeleteScenario = async () => {
    if (scenarios.length <= 1) { toast.error('Tidak dapat menghapus satu-satunya skenario'); return; }
    const scenario = scenarios[activeScenarioIdx];
    if (scenario.id) {
      try {
        await api.delete(`/dss/simulator/scenarios/${scenario.id}`);
      } catch { toast.error('Gagal menghapus dari database'); return; }
    }
    const newScenarios = scenarios.filter((_, i) => i !== activeScenarioIdx);
    setScenarios(newScenarios);
    setActiveScenarioIdx(Math.max(0, activeScenarioIdx - 1));
    setSimResult(null);
    toast.success('Skenario dihapus');
  };

  const sendAIMessage = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    const updatedMessages = [...aiMessages, { role: 'user', content: userMsg }];
    setAiMessages(updatedMessages);
    setAiLoading(true);
    try {
      const context = simResult
        ? `Konteks Simulator Kas: Saldo saat ini ${formatCurrency(simResult.metrics.currentSaldo)}, Days of Cash ${simResult.metrics.daysOfCash} hari, Burn Rate harian ${formatCurrency(simResult.metrics.dailyBurnRate)}, Bulan defisit: ${simResult.metrics.deficitMonths.map(b => BULAN_LABELS[b - 1]).join(', ') || 'tidak ada'}.`
        : `Konteks Simulator Kas: Baseline kas ${formatCurrency(baselineKas)}.`;
      const res = await api.post('/dss/intelligence/chat', {
        message: userMsg,
        context,
        history: updatedMessages.slice(-6),
      });
      setAiMessages([...updatedMessages, { role: 'assistant', content: res.data.reply || res.data.message || 'Tidak ada respons' }]);
    } catch {
      toast.error('Gagal menghubungi AI');
    } finally {
      setAiLoading(false);
    }
  };

  // Client-side calculations (kept for backward compat / pre-run display)
  const items: SimItem[] = activeScenario.items || [];
  const totalMandatory = items.filter(i => i.priority === 'mandatory').reduce((s, i) => s + Number(i.amount), 0);
  const totalDiscretionary = items.filter(i => i.priority !== 'mandatory').reduce((s, i) => s + Number(i.amount), 0);
  const totalSimulatedSpend = totalMandatory + totalDiscretionary;
  const totalProjections = projections.reduce((s, p) => s + Number(parseNumber(p.nilai || 0)), 0);
  const totalInflow = baselineKas + totalProjections;
  const finalKas = totalInflow - totalSimulatedSpend;
  const percentageLeft = (finalKas / (totalInflow || 1)) * 100;
  const finalKasMandatoryOnly = totalInflow - totalMandatory;
  const percentageLeftMandatoryOnly = (finalKasMandatoryOnly / (totalInflow || 1)) * 100;

  const getRiskStatus = () => {
    if (finalKas < 0) return { label: 'Kritis', color: 'text-[#B42318]', bg: 'bg-[#FEF3F2]', border: 'border-[#FECDCA]', icon: ShieldAlert, msg: 'Pengeluaran ini akan memicu defisit kas.' };
    if (percentageLeft < 20) return { label: 'Waspada', color: 'text-[#B54708]', bg: 'bg-[#FFFAEB]', border: 'border-[#FEDF89]', icon: AlertTriangle, msg: 'Saldo kas di bawah ambang aman 20%.' };
    return { label: 'Aman', color: 'text-[#027A48]', bg: 'bg-[#ECFDF3]', border: 'border-[#ABEFC6]', icon: CheckCircle2, msg: 'Kondisi kas stabil dalam kapasitas likuiditas daerah.' };
  };
  const risk = getRiskStatus();

  // Chart data from simulation result
  const chartData = simResult ? {
    labels: simResult.timeline.map(t => BULAN_LABELS[t.bulan - 1]),
    datasets: [
      {
        label: 'Saldo Kas',
        data: simResult.timeline.map(t => t.saldo),
        borderColor: '#2E90FA',
        backgroundColor: 'rgba(46,144,250,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: simResult.timeline.map(t => t.isDeficit || t.isCritical ? 6 : 3),
        pointBackgroundColor: simResult.timeline.map(t => t.isDeficit ? '#F04438' : t.isCritical ? '#F79009' : '#2E90FA'),
      },
      {
        label: 'Inflow',
        data: simResult.timeline.map(t => t.inflow),
        borderColor: '#12B76A',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: 'Outflow',
        data: simResult.timeline.map(t => t.outflow),
        borderColor: '#F79009',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 10 } } },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`,
        },
      },
    },
    scales: {
      y: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ticks: { callback: (v: any) => formatNumber(v / 1e9) + 'M', font: { size: 10 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      x: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
  };

  const downloadManualPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 18;
    const contentW = pw - margin * 2;
    let y = 20;

    const addPage = () => { doc.addPage(); y = 20; };
    const checkY = (needed: number) => { if (y + needed > 275) addPage(); };

    // ── Cover ──────────────────────────────────────────────────
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, pw, 60, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH', pw / 2, 18, { align: 'center' });
    doc.text('KABUPATEN KEPULAUAN ARU', pw / 2, 24, { align: 'center' });
    doc.setFontSize(16);
    doc.text('PANDUAN PENGGUNAAN', pw / 2, 38, { align: 'center' });
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.text('Simulator Kas Cerdas — DSS BPKAD', pw / 2, 47, { align: 'center' });
    doc.setTextColor(30, 30, 30);
    y = 72;

    const sectionTitle = (title: string) => {
      checkY(14);
      doc.setFillColor(240, 249, 255);
      doc.roundedRect(margin, y, contentW, 8, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(14, 116, 144);
      doc.text(title, margin + 4, y + 5.5);
      doc.setTextColor(30, 30, 30);
      y += 12;
    };

    const bodyText = (text: string, indent = 0) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);
      const lines = doc.splitTextToSize(text, contentW - indent);
      lines.forEach((line: string) => {
        checkY(6);
        doc.text(line, margin + indent, y);
        y += 5.5;
      });
      y += 1;
    };

    const bullet = (text: string) => {
      checkY(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);
      doc.setFillColor(14, 116, 144);
      doc.circle(margin + 3, y - 1.2, 1, 'F');
      const lines = doc.splitTextToSize(text, contentW - 8);
      doc.text(lines[0], margin + 7, y);
      y += 5.5;
      for (let i = 1; i < lines.length; i++) {
        checkY(6);
        doc.text(lines[i], margin + 7, y);
        y += 5.5;
      }
    };

    const metric = (name: string, desc: string) => {
      checkY(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(17, 24, 39);
      doc.text(`• ${name}`, margin + 3, y);
      y += 5.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(75, 85, 99);
      const lines = doc.splitTextToSize(desc, contentW - 10);
      lines.forEach((line: string) => {
        checkY(6);
        doc.text(line, margin + 9, y);
        y += 5;
      });
      y += 2;
    };

    // ── Sections ──────────────────────────────────────────────
    sectionTitle('1. Gambaran Umum');
    bodyText('Simulator Kas Cerdas adalah modul analisis likuiditas berbasis data riil BKU yang memungkinkan operator keuangan BPKAD untuk memproyeksikan kondisi kas daerah sebelum menerbitkan SP2D. Modul ini menggabungkan data historis (pendapatan, pengeluaran, saldo awal) dengan skenario rencana belanja yang dapat dikustomisasi secara interaktif.');
    bodyText('Engine simulasi berjalan di server dan menghasilkan proyeksi arus kas 12 bulan lengkap dengan peringatan bulan defisit dan metrik likuiditas lanjutan.');

    sectionTitle('2. Mengelola Skenario');
    bodyText('Skenario adalah kumpulan rencana pengeluaran dalam satu konteks analisis. Anda dapat membuat, menyimpan, dan membandingkan beberapa skenario sekaligus.');
    bullet('Klik tombol "+" untuk membuat skenario baru. Masukkan nama skenario pada dialog yang muncul, lalu tekan "Buat Skenario".');
    bullet('Klik tab skenario di bagian atas untuk beralih antar skenario. Setiap skenario memiliki daftar pengeluaran sendiri.');
    bullet('Klik "Simpan" untuk menyimpan skenario aktif ke database sehingga tersedia di sesi berikutnya.');
    bullet('Klik ikon tempat sampah untuk menghapus skenario aktif. Skenario terakhir tidak dapat dihapus.');

    sectionTitle('3. Menambah Rencana Belanja (Outflow)');
    bodyText('Ada dua cara menambahkan rencana pengeluaran ke skenario:');
    bodyText('A. Input Manual:', 3);
    bullet('Pilih Sumber Dana dari dropdown (mis. DAU, DAK, PAD).');
    bullet('Tentukan prioritas: MANDATORY (belanja wajib: gaji, kontrak mengikat) atau DISCRETIONARY (belanja pilihan yang dapat ditunda).');
    bullet('Isi Uraian Pembayaran dan Nilai Nominal, lalu klik "Tambahkan ke Skenario".');
    y += 3;
    bodyText('B. Smart Injection (dari Arsip SP2D):', 3);
    bullet('Klik tombol "SMART INJECTION" untuk membuka dialog pencarian SP2D.');
    bullet('Cari berdasarkan Nomor SP2D atau Uraian. Filter berdasarkan OPD jika diperlukan.');
    bullet('Klik "Suntikkan" pada SP2D yang dipilih. Data nilai dan sumber dana akan terisi otomatis.');
    bullet('SP2D berjenis GAJI/PEGAWAI otomatis dikategorikan MANDATORY.');

    sectionTitle('4. Proyeksi Inflow (Pendapatan)');
    bullet('Proyeksi inflow dapat diinput secara manual melalui modul Proyeksi Pendapatan.');
    bullet('Klik tombol "Auto-Proyeksi" untuk mengisi proyeksi otomatis dari rata-rata historis 3 tahun terakhir per sumber dana per bulan.');
    bullet('Proyeksi otomatis tidak langsung disimpan ke database — hanya ditampilkan untuk keperluan simulasi sesi ini.');

    sectionTitle('5. Menjalankan Simulasi Engine');
    bodyText('Klik tombol "Jalankan Simulasi" (ikon Play) untuk mengirim data ke server. Engine akan:');
    bullet('Mengambil data aktual inflow/outflow bulan-bulan lalu dari database (data riil BKU).');
    bullet('Menggabungkan proyeksi untuk bulan-bulan mendatang.');
    bullet('Menerapkan pengeluaran skenario aktif pada bulan berjalan.');
    bullet('Menghitung saldo berjalan dan metrik likuiditas selama 12 bulan.');
    bodyText('Hasil ditampilkan dalam 4 kartu metrik, grafik timeline, dan tabel detail per bulan.');

    sectionTitle('6. Menginterpretasi Hasil Simulasi');
    bodyText('Empat metrik utama yang ditampilkan setelah simulasi dijalankan:');
    metric('Days of Cash', 'Jumlah hari operasional yang dapat dibiayai dengan posisi kas saat ini tanpa pendapatan baru. Di bawah 30 hari = KRITIS (merah), 30–90 hari = WASPADA (kuning), di atas 90 hari = AMAN (hijau).');
    metric('Burn Rate/Hari', 'Rata-rata pengeluaran kas harian dihitung dari total outflow proyeksi 12 bulan dibagi 360. Gunakan angka ini untuk memperkirakan kebutuhan pencairan atau talangan jangka pendek.');
    metric('Mandatory Ratio', 'Persentase belanja wajib terhadap total belanja skenario. Angka di atas 80% menunjukkan fleksibilitas anggaran sangat terbatas — belanja pilihan sulit ditunda lebih lanjut.');
    metric('Concentration Risk', 'Persentase bulan dengan pengeluaran tertinggi terhadap total tahunan. Di atas 50% mengindikasikan pengeluaran terkonsentrasi — risiko likuiditas meningkat pada bulan tersebut.');
    bodyText('Grafik Timeline menampilkan saldo berjalan (garis biru), inflow (hijau putus-putus), dan outflow (kuning putus-putus) selama 12 bulan. Titik merah = bulan defisit; titik oranye = bulan kritis.');

    sectionTitle('7. Panel Analisis & Rekomendasi AI');
    bullet('Panel "Analisis Keputusan Strategis" secara otomatis menghitung dampak jika belanja discretionary ditunda sepenuhnya.');
    bullet('Klik "Terapkan Efisiensi" untuk menghapus semua item DISCRETIONARY dari skenario aktif sekaligus.');
    bullet('Klik "Bantuan AI" untuk membuka dialog konsultan keuangan AI. Konteks simulasi (saldo, burn rate, bulan defisit) otomatis disertakan dalam prompt AI.');
    bullet('Ketik pertanyaan dalam Bahasa Indonesia tentang kondisi kas, rekomendasi skenario, atau strategi penganggaran. Tekan Enter atau klik "Kirim".');

    sectionTitle('8. Mencetak dan Mengunduh');
    bullet('Klik "Cetak" untuk mencetak laporan analisis ke printer atau simpan sebagai PDF melalui dialog cetak browser.');
    bullet('Klik "Simpan" untuk menyimpan skenario aktif beserta daftar pengeluaran ke database.');
    bullet('Tombol "Panduan" (ikon buku) membuka dokumen ini dan menyediakan opsi Unduh PDF untuk arsip offline.');

    // ── Footer ────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`DSS BPKAD — Simulator Kas Cerdas | Halaman ${i} dari ${totalPages}`, pw / 2, 290, { align: 'center' });
      doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, pw / 2, 294, { align: 'center' });
    }

    doc.save('Panduan_Simulator_Kas_Cerdas.pdf');
  };

  if (loading) return (
    <div className="h-[80vh] flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-[#2E90FA]" size={48} />
      <p className="text-sm font-medium text-fin-text-muted">Mempersiapkan Engine Simulasi...</p>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700">
      <style jsx global>{`
        @media print {
          nav, aside, button, .no-print, [role="tablist"] { display: none !important; }
          body { background: white !important; }
          .print-header { display: block !important; }
        }
        .print-header { display: none; }
      `}</style>

      <div className="print-header text-center mb-8 border-b-2 border-gray-800 pb-4">
        <h2 className="text-lg font-black uppercase">BPKAD KAB. KEPULAUAN ARU</h2>
        <h1 className="text-xl font-black uppercase mt-1">LAPORAN ANALISIS STRATEGIS LIKUIDITAS KAS</h1>
        <p className="text-xs text-gray-500">Skenario: {activeScenario.name} | Cetak: {new Date().toLocaleString('id-ID')}</p>
      </div>

      <PageHeader
        title="Simulator Kas Cerdas"
        description="Engine simulasi arus kas 12-bulan berbasis data riil BPKAD"
        icon={<Zap className="size-5" />}
      />

      {/* SCENARIO TABS */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <div className="flex bg-fin-page p-1 rounded-lg border border-fin-border">
            {scenarios.map((s, idx) => (
              <Button
                key={idx}
                variant="ghost"
                onClick={() => { setActiveScenarioIdx(idx); setSimResult(null); }}
                className={cn(
                  'h-8 px-5 rounded-lg text-[11px] font-medium transition-all',
                  activeScenarioIdx === idx ? 'bg-fin-surface text-fin-text-primary shadow-sm' : 'text-fin-text-muted hover:text-fin-text-primary'
                )}
              >
                {s.name}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            {/* New Scenario Dialog */}
            <Dialog open={openNewScenario} onOpenChange={setOpenNewScenario}>
              <DialogTrigger render={
                <Button size="icon" variant="outline" className="h-10 w-10 border-fin-border text-fin-text-muted rounded-lg hover:bg-fin-page shrink-0" title="Tambah Skenario">
                  <Plus size={16} />
                </Button>
              } />
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Skenario Baru</DialogTitle>
                  <DialogDescription className="text-xs">Beri nama untuk skenario simulasi baru.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <Input
                    placeholder={`Skenario ${scenarios.length + 1}`}
                    value={newScenarioName}
                    onChange={e => setNewScenarioName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addNewScenario()}
                    className="h-10 border-fin-border"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button onClick={addNewScenario} className="flex-1 bg-ds-primary text-white h-10 rounded-lg text-xs font-bold">Buat Skenario</Button>
                    <Button variant="outline" onClick={() => setOpenNewScenario(false)} className="flex-1 h-10 rounded-lg text-xs border-fin-border">Batal</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="icon" variant="outline" onClick={handleDeleteScenario} className="h-10 w-10 border-fin-border text-[#F04438] rounded-lg hover:bg-[#FEF3F2] shrink-0" title="Hapus Skenario">
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleRunSimulation} disabled={running} className="h-10 px-5 bg-ds-primary text-white rounded-lg font-bold text-xs flex items-center gap-2 shadow-sm">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Jalankan Simulasi
          </Button>
          <Button onClick={handleSaveScenario} disabled={saving} variant="outline" className="h-10 px-4 border-fin-border text-fin-text-muted rounded-lg font-bold text-xs flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="h-10 px-4 border-fin-border text-fin-text-muted rounded-lg font-bold text-xs flex items-center gap-2">
            <Download size={14} />
            Cetak
          </Button>
          <Button variant="outline" onClick={() => setOpenManual(true)} className="h-10 px-4 border-indigo-200 text-indigo-600 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-indigo-50">
            <BookOpen size={14} />
            Panduan
          </Button>
        </div>
      </div>

      {/* TOP SUMMARY CARDS — 4 static + 4 dynamic metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Static card: Baseline */}
        <div className="lux-stat lux-stat-navy p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-blue-200/70 uppercase tracking-wider">Baseline Kas</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 cursor-help">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-200" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-center leading-relaxed">
                Posisi kas efektif saat ini dari BKU riil (SP2D + Pendapatan). Titik awal semua perhitungan simulasi.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xl font-bold text-white tabular-nums truncate">{formatCurrency(baselineKas)}</p>
        </div>

        {/* Static card: Proyeksi Inflow */}
        <div className="lux-stat lux-stat-emerald p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-emerald-200/70 uppercase tracking-wider">Proyeksi Inflow</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 cursor-help">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-200" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-center leading-relaxed">
                Total pendapatan yang diproyeksikan (manual + auto-proyeksi historis). Ditambahkan ke Baseline sebagai kapasitas inflow total.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xl font-bold text-white tabular-nums truncate">+{formatCurrency(totalProjections)}</p>
        </div>

        {/* Static card: Total Outflow */}
        <div className="lux-stat lux-stat-rose p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-red-200/70 uppercase tracking-wider">Total Outflow Sim.</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 cursor-help">
                  <TrendingDown className="w-3.5 h-3.5 text-red-200" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-center leading-relaxed">
                Total rencana pengeluaran skenario aktif. Mencakup belanja Mandatory (wajib) dan Discretionary (pilihan yang dapat ditunda).
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xl font-bold text-white tabular-nums truncate">-{formatCurrency(totalSimulatedSpend)}</p>
        </div>

        {/* Dynamic: Estimasi Saldo / Days of Cash */}
        <div className={cn('lux-stat p-4 rounded-xl flex flex-col group transition-all', finalKas < 0 ? 'lux-stat-rose' : 'lux-stat-amber')}>
          <div className="flex items-center justify-between mb-2">
            <span className={cn('text-[9px] font-bold uppercase tracking-wider', finalKas < 0 ? 'text-red-200/70' : 'text-amber-200/70')}>
              {simResult ? 'Days of Cash' : 'Estimasi Saldo'}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 cursor-help">
                  {simResult ? <Clock className="w-3.5 h-3.5 text-amber-200" /> : <risk.icon className={cn('w-3.5 h-3.5', finalKas < 0 ? 'text-red-200' : 'text-amber-200')} />}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-center leading-relaxed">
                {simResult
                  ? 'Jumlah hari kas dapat menutup pengeluaran rata-rata tanpa pemasukan baru. < 30 hari = KRITIS.'
                  : 'Estimasi saldo kas setelah semua outflow skenario dieksekusi. Negatif berarti defisit — diperlukan talangan.'}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xl font-bold tabular-nums truncate text-white">
            {simResult ? `${Math.min(simResult.metrics.daysOfCash, 999)} hari` : formatCurrency(finalKas)}
          </p>
        </div>
      </div>

      {/* LIQUIDITY METRIC CARDS — only shown after simulation runs */}
      <AnimatePresence>
        {simResult && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Days of Cash */}
            <div className={cn('p-4 rounded-xl border flex flex-col gap-1', simResult.metrics.daysOfCash < 30 ? 'bg-[#FEF3F2] border-[#FECDCA]' : simResult.metrics.daysOfCash < 90 ? 'bg-[#FFFAEB] border-[#FEDF89]' : 'bg-[#ECFDF3] border-[#ABEFC6]')}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider">Days of Cash</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="cursor-help">
                      <Clock size={14} className={simResult.metrics.daysOfCash < 30 ? 'text-[#B42318]' : simResult.metrics.daysOfCash < 90 ? 'text-[#B54708]' : 'text-[#027A48]'} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] leading-relaxed">
                    Jumlah hari kas dapat membiayai operasional tanpa pendapatan baru. <strong>&lt; 30 hari = KRITIS</strong> | 30–90 hari = WASPADA | &gt; 90 hari = AMAN.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={cn('text-2xl font-black tabular-nums', simResult.metrics.daysOfCash < 30 ? 'text-[#B42318]' : simResult.metrics.daysOfCash < 90 ? 'text-[#B54708]' : 'text-[#027A48]')}>
                {Math.min(simResult.metrics.daysOfCash, 999)}
              </p>
              <span className="text-[9px] text-fin-text-muted font-medium">Hari likuiditas tersisa</span>
            </div>

            {/* Daily Burn Rate */}
            <div className="p-4 rounded-xl border border-fin-border bg-fin-surface flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider">Burn Rate/Hari</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="cursor-help">
                      <Flame size={14} className="text-orange-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] leading-relaxed">
                    Rata-rata pengeluaran kas per hari (total outflow 12 bulan ÷ 360). Gunakan untuk memperkirakan kebutuhan pencairan jangka pendek.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-lg font-black tabular-nums text-fin-text-primary truncate">{formatCurrency(simResult.metrics.dailyBurnRate)}</p>
              <span className="text-[9px] text-fin-text-muted font-medium">Rata-rata pengeluaran harian</span>
            </div>

            {/* Mandatory Ratio */}
            <div className="p-4 rounded-xl border border-fin-border bg-fin-surface flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider">Mandatory Ratio</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="cursor-help">
                      <ShieldCheck size={14} className="text-rose-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] leading-relaxed">
                    Persentase belanja wajib (gaji, kontrak mengikat) terhadap total skenario. Di atas 80% berarti fleksibilitas anggaran sangat terbatas.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-black tabular-nums text-fin-text-primary">{Math.round(simResult.metrics.mandatoryRatio)}%</p>
              <span className="text-[9px] text-fin-text-muted font-medium">Porsi belanja wajib</span>
            </div>

            {/* Concentration Risk */}
            <div className={cn('p-4 rounded-xl border flex flex-col gap-1', simResult.metrics.concentrationRisk > 50 ? 'bg-[#FFFAEB] border-[#FEDF89]' : 'border-fin-border bg-fin-surface')}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider">Concentration Risk</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="cursor-help">
                      <BarChart3 size={14} className={simResult.metrics.concentrationRisk > 50 ? 'text-[#B54708]' : 'text-fin-text-muted'} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] leading-relaxed">
                    Persentase bulan dengan outflow tertinggi terhadap total tahunan. Di atas 50% menunjukkan pengeluaran terkonsentrasi — risiko likuiditas meningkat.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={cn('text-2xl font-black tabular-nums', simResult.metrics.concentrationRisk > 50 ? 'text-[#B54708]' : 'text-fin-text-primary')}>
                {Math.round(simResult.metrics.concentrationRisk)}%
              </p>
              <span className="text-[9px] text-fin-text-muted font-medium">Konsentrasi outflow tertinggi</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CASH FLOW TIMELINE CHART — only shown after simulation */}
      <AnimatePresence>
        {simResult && chartData && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="p-6 rounded-xl border border-fin-border bg-fin-surface shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                  <Activity size={16} className="text-[#2E90FA]" />
                  Timeline Arus Kas 12 Bulan — {simResult.tahun}
                </h3>
                <div className="flex items-center gap-2">
                  {simResult.metrics.deficitMonths.length > 0 && (
                    <Badge className="bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] text-[9px] font-bold">
                      {simResult.metrics.deficitMonths.length} bulan defisit
                    </Badge>
                  )}
                  {simResult.metrics.criticalMonths.length > 0 && (
                    <Badge className="bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] text-[9px] font-bold">
                      {simResult.metrics.criticalMonths.length} bulan kritis
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-64">
                <Line data={chartData} options={chartOptions} />
              </div>
              {(simResult.metrics.deficitMonths.length > 0 || simResult.metrics.criticalMonths.length > 0) && (
                <div className="mt-3 p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-lg flex items-start gap-2">
                  <AlertCircle size={14} className="text-[#B42318] shrink-0 mt-0.5" />
                  <p className="text-[10px] text-[#B42318] font-medium">
                    {simResult.metrics.deficitMonths.length > 0
                      ? `Proyeksi defisit pada: ${simResult.metrics.deficitMonths.map(b => BULAN_LABELS[b - 1]).join(', ')}. Pertimbangkan penjadwalan ulang pengeluaran atau pengajuan talangan.`
                      : `Saldo kritis (< 10% saldo awal) pada: ${simResult.metrics.criticalMonths.map(b => BULAN_LABELS[b - 1]).join(', ')}.`}
                  </p>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN 2-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Input Panel */}
        <div className="space-y-6">
          {/* Belanja Input */}
          <div className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                <ListFilter size={16} className="text-[#2E90FA]" />
                Injeksi Rencana Belanja (SP2D)
              </h3>
              {/* Smart Injection Dialog */}
              <Dialog open={openInjection} onOpenChange={val => { setOpenInjection(val); if (val) fetchSP2Ds(); }}>
                <DialogTrigger render={
                  <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] font-bold border-indigo-200 text-fin-info-text hover:bg-indigo-50 gap-1.5 shadow-sm">
                    <Sparkles size={14} />
                    SMART INJECTION
                  </Button>
                } />
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-black tracking-tight">Smart Injection — Arsip SP2D</DialogTitle>
                    <DialogDescription className="text-xs font-medium">Pilih SP2D dari arsip untuk disuntikkan ke skenario.</DialogDescription>
                  </DialogHeader>
                  <div className="relative mt-4 flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted" size={16} />
                      <Input
                        placeholder="Cari Nomor SP2D / Uraian..."
                        className="pl-10 h-11 bg-fin-page border-fin-border text-sm font-medium"
                        value={sp2dSearch}
                        onChange={e => { setSp2dSearch(e.target.value); fetchSP2Ds(e.target.value, selectedOpd); }}
                      />
                    </div>
                    <Combobox
                      value={selectedOpd}
                      onValueChange={val => { setSelectedOpd(val || 'all'); fetchSP2Ds(sp2dSearch, val || 'all'); }}
                      placeholder="Semua OPD"
                      className="w-[160px] h-11"
                      options={opdList}
                    />
                  </div>
                  <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto pr-1 scrollbar-hide">
                    {loadingSP2Ds ? (
                      <div className="flex flex-col items-center justify-center py-12 text-fin-text-muted">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <p className="text-[11px] font-bold uppercase tracking-widest">Menghubungkan ke Arsip...</p>
                      </div>
                    ) : availableSP2Ds.length === 0 ? (
                      <div className="text-center py-12 bg-fin-page rounded-xl border border-dashed border-fin-border">
                        <FileSearch className="mx-auto text-fin-text-muted/40 mb-2" size={32} />
                        <p className="text-xs font-bold text-fin-text-muted uppercase">Data SP2D tidak ditemukan</p>
                      </div>
                    ) : (
                      availableSP2Ds.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-4 bg-fin-surface border border-fin-border rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-fin-page rounded-lg flex items-center justify-center text-fin-text-muted group-hover:bg-indigo-100 group-hover:text-fin-info-text transition-colors shrink-0">
                              <Building2 size={20} />
                            </div>
                            <div>
                              <p className="text-[11px] font-black text-fin-text-primary uppercase tracking-tight">{s.nomor}</p>
                              <p className="text-[10px] font-bold text-fin-text-muted line-clamp-1 max-w-[280px]">{s.uraian}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-fin-border text-fin-text-muted font-bold">{s.jenis}</Badge>
                                <span className="text-[10px] font-black text-fin-info-text">{formatCurrency(s.nilai_bruto)}</span>
                              </div>
                            </div>
                          </div>
                          <Button onClick={() => injectSP2D(s)} className="bg-ds-primary hover:bg-ds-primary-hover text-white h-9 px-4 rounded-lg text-xs font-bold shrink-0">
                            Suntikkan
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-fin-text-muted ml-1">Sumber Dana</label>
                  <Combobox
                    value={currentSelection.id}
                    onValueChange={val => setCurrentSelection({ ...currentSelection, id: val || '' })}
                    placeholder="Pilih Sumber Dana"
                    className="w-full h-10"
                    options={sumberDana.map(s => ({ value: s.id, label: s.nama }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-fin-text-muted ml-1">Prioritas</label>
                  <select
                    value={currentSelection.priority}
                    onChange={e => setCurrentSelection({ ...currentSelection, priority: e.target.value as 'mandatory' | 'discretionary' })}
                    className="w-full h-10 px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="mandatory">MANDATORY (Wajib)</option>
                    <option value="discretionary">DISCRETIONARY (Pilihan)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-fin-text-muted ml-1">Uraian Pembayaran</label>
                <Input
                  placeholder="Contoh: Gaji Pegawai / Belanja Modal..."
                  className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium"
                  value={currentSelection.label}
                  onChange={e => setCurrentSelection({ ...currentSelection, label: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-fin-text-muted ml-1">Nilai Nominal (Rp)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-fin-text-muted font-semibold text-lg">Rp</div>
                  <NumericInput
                    className="pl-12 h-12 bg-fin-page border-fin-border rounded-lg text-2xl font-bold tracking-tight text-fin-text-primary"
                    value={currentSelection.amount}
                    onValueChange={val => setCurrentSelection({ ...currentSelection, amount: val })}
                  />
                </div>
              </div>

              <Button
                onClick={addSimulation}
                disabled={!currentSelection.id || currentSelection.amount <= 0}
                className="w-full h-11 bg-ds-primary text-white rounded-lg font-semibold flex items-center justify-center gap-2 text-sm"
              >
                <Plus size={16} />
                Tambahkan ke Skenario
              </Button>
            </div>
          </div>

          {/* Proyeksi Inflow Panel */}
          <div className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                <ArrowUpRight size={16} className="text-[#12B76A]" />
                Proyeksi Inflow
              </h3>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#ECFDF3] text-[#027A48] border-none text-[11px]">{projections.length} Item</Badge>
                <Button variant="outline" size="sm" onClick={handleAutoProject} className="h-7 px-2 text-[10px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1">
                  <Cpu size={12} />
                  Auto-Proyeksi
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-hide">
              {projections.length === 0 ? (
                <div className="p-4 bg-fin-page rounded-lg border border-dashed border-fin-border text-center">
                  <p className="text-[11px] font-medium text-fin-text-muted">Klik Auto-Proyeksi untuk mengisi dari data historis</p>
                </div>
              ) : (
                projections.slice(0, 20).map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-fin-page rounded-lg border border-fin-border">
                    <div>
                      <p className="text-xs font-semibold text-fin-text-primary">{p.keterangan || 'Pendapatan Proyeksi'}</p>
                      <p className="text-[10px] text-fin-text-muted">Bulan {p.bulan} — {p.sumber_dana_nama}</p>
                    </div>
                    <span className="text-xs font-bold text-[#12B76A]">+{formatCurrency(p.nilai)}</span>
                  </div>
                ))
              )}
              {projections.length > 20 && (
                <p className="text-[10px] text-center text-fin-text-muted py-1">+{projections.length - 20} item lainnya</p>
              )}
            </div>
          </div>

          {/* Simulated Outflow List */}
          <Card className="bg-ds-primary p-6 rounded-xl text-white overflow-hidden relative border border-[#1D2939] shadow-sm">
            <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 scale-150">
              <Activity size={100} />
            </div>
            <h3 className="text-[11px] font-bold text-fin-text-muted uppercase tracking-widest mb-4 relative z-10">Daftar Pengeluaran Skenario</h3>
            <div className="space-y-2.5 relative z-10 max-h-[320px] overflow-y-auto scrollbar-hide">
              <AnimatePresence>
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 opacity-40">
                    <Zap size={40} className="mb-2" />
                    <p className="text-[11px] uppercase font-bold tracking-widest">Skenario Kosong</p>
                  </div>
                ) : (
                  items.map((item: SimItem) => (
                    <motion.div
                      key={item.timestamp}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 20, opacity: 0 }}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-xl border transition-all',
                        item.priority === 'mandatory' ? 'bg-rose-500/5 border-rose-500/10' : 'bg-blue-500/5 border-blue-500/10'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('w-2 h-2 rounded-full shrink-0', item.priority === 'mandatory' ? 'bg-rose-500' : 'bg-blue-500')} />
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-xs font-bold leading-none uppercase tracking-tight">{item.label || 'Belanja Tanpa Nama'}</p>
                            <Badge className={cn('text-[9px] h-4 px-1.5 font-bold border-none', item.priority === 'mandatory' ? 'bg-rose-500/20 text-rose-300' : 'bg-blue-500/20 text-blue-300')}>
                              {item.priority === 'mandatory' ? 'WAJIB' : 'PILIHAN'}
                            </Badge>
                          </div>
                          <p className="text-[10px] font-medium text-fin-text-muted">{item.sourceName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn('text-xs font-black tabular-nums', item.priority === 'mandatory' ? 'text-rose-400' : 'text-blue-400')}>
                          -{formatCurrency(item.amount)}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => removeSimulation(item.timestamp)} className="h-7 w-7 text-fin-text-muted hover:text-[#F04438] hover:bg-fin-surface/10 rounded-lg">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </Card>
        </div>

        {/* RIGHT: Analysis Panel */}
        <div className="space-y-6">
          {/* Radial Gauge + Risk */}
          <Card className="p-6 rounded-xl shadow-sm border border-fin-border bg-fin-surface">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Radial Progress */}
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0 bg-fin-page rounded-full p-2">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
                    <circle cx="56" cy="56" r="46" fill="transparent" stroke="#E9ECEF" strokeWidth="8" />
                    <motion.circle
                      cx="56" cy="56" r="46" fill="transparent"
                      stroke={finalKas < 0 ? '#F04438' : percentageLeft < 20 ? '#F79009' : '#2E90FA'}
                      strokeWidth="8"
                      strokeDasharray="289"
                      animate={{ strokeDashoffset: 289 - (289 * Math.max(0, Math.min(percentageLeft, 100))) / 100 }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-[9px] font-black text-fin-text-muted uppercase tracking-widest mb-0.5">Sisa Kas</p>
                    <h4 className={cn('text-xl font-black tracking-tight', risk.color)}>{Math.max(0, Math.round(percentageLeft))}%</h4>
                  </div>
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-[0.2em] mb-1">Estimasi Saldo Akhir</p>
                    <h2 className={cn('text-2xl font-black tracking-tighter tabular-nums break-words leading-tight', risk.color)}>
                      {formatCurrency(finalKas)}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={cn('px-3 py-1 rounded-xl text-[10px] font-black flex items-center gap-1.5 uppercase tracking-widest border-2', risk.bg, risk.color, risk.border)}>
                        <risk.icon size={12} />
                        {risk.label}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-1 px-3 border-fin-border text-fin-text-muted font-black uppercase tracking-widest">
                        {activeScenario.name}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-fin-page rounded-xl border border-fin-border">
                <p className="text-xs text-fin-text-muted leading-relaxed font-medium italic">&ldquo;{risk.msg}&rdquo;</p>
              </div>

              {/* Mandatory vs Discretionary breakdown */}
              <div className="pt-4 border-t border-fin-border grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-bold text-fin-text-primary mb-3 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck size={14} className="text-rose-500" /> Mandatory
                  </h4>
                  <p className="text-sm font-bold text-fin-text-primary tabular-nums">{formatCurrency(totalMandatory)}</p>
                  <div className="w-full h-1.5 bg-fin-page rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min((totalMandatory / (totalInflow || 1)) * 100, 100)}%` }} />
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-fin-text-primary mb-3 uppercase tracking-wider flex items-center gap-2">
                    <Target size={14} className="text-blue-500" /> Discretionary
                  </h4>
                  <p className="text-sm font-bold text-fin-text-primary tabular-nums">{formatCurrency(totalDiscretionary)}</p>
                  <div className="w-full h-1.5 bg-fin-page rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((totalDiscretionary / (totalInflow || 1)) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Strategic Decision Support + AI */}
          <Card className={cn(
            'p-6 rounded-xl border relative overflow-hidden shadow-sm',
            finalKas < 0 ? 'bg-[#B42318] text-white border-none' : 'bg-fin-surface border-fin-border'
          )}>
            <div className="flex items-start gap-4">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', finalKas < 0 ? 'bg-white/20' : 'bg-indigo-50 text-fin-info-text')}>
                <Sparkles size={20} />
              </div>
              <div className="flex-1">
                <h4 className={cn('text-sm font-bold uppercase tracking-wider mb-2', finalKas < 0 ? 'text-white' : 'text-fin-text-primary')}>
                  Analisis Keputusan Strategis
                </h4>
                <p className={cn('text-xs leading-relaxed mb-4', finalKas < 0 ? 'text-white/80' : 'text-fin-text-muted')}>
                  {finalKas < 0
                    ? `PERINGATAN: Kas defisit. Menunda seluruh belanja DISCRETIONARY (${formatCurrency(totalDiscretionary)}) akan memulihkan saldo ke ${formatCurrency(finalKasMandatoryOnly)} (${Math.round(percentageLeftMandatoryOnly)}%).`
                    : percentageLeft < 20
                    ? `REKOMENDASI: Saldo kritis (<20%). Prioritaskan Mandatory dan evaluasi Discretionary.`
                    : `KONDISI OPTIMAL: Likuiditas mampu menanggung seluruh rencana belanja dalam skenario ini.`}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={applyEfficiency}
                    className={cn('h-9 px-4 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center gap-2', finalKas < 0 ? 'bg-white text-rose-700 hover:bg-rose-50' : 'bg-ds-primary text-white')}
                  >
                    <Sparkles size={13} />
                    Terapkan Efisiensi
                  </Button>
                  <Button
                    onClick={handleRunSimulation}
                    disabled={running}
                    variant="outline"
                    className={cn('h-9 px-4 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center gap-2', finalKas < 0 ? 'border-white/30 text-white hover:bg-white/10' : 'border-fin-border text-fin-text-muted')}
                  >
                    {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Run Engine
                  </Button>
                  {/* AI Dialog */}
                  <Dialog open={openAI} onOpenChange={setOpenAI}>
                    <DialogTrigger render={
                      <Button variant="ghost" className={cn('h-9 px-4 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center gap-2', finalKas < 0 ? 'text-white/70 hover:bg-white/10' : 'text-fin-text-muted')}>
                        <Bot size={13} />
                        Bantuan AI
                      </Button>
                    } />
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-sm font-black">
                          <Bot size={16} className="text-indigo-500" />
                          Konsultan Keuangan AI
                        </DialogTitle>
                        <DialogDescription className="text-xs">Tanyakan analisis likuiditas, rekomendasi, atau simulasi skenario.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 mt-2">
                        <div className="h-64 overflow-y-auto space-y-3 p-3 bg-fin-page rounded-xl border border-fin-border scrollbar-hide">
                          {aiMessages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-fin-text-muted">
                              <Bot size={32} className="mb-2 opacity-30" />
                              <p className="text-[11px] font-medium">Tanyakan tentang kondisi kas Anda...</p>
                            </div>
                          )}
                          {aiMessages.map((m, idx) => (
                            <div key={idx} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                              <div className={cn('max-w-[85%] p-3 rounded-xl text-xs leading-relaxed', m.role === 'user' ? 'bg-ds-primary text-white rounded-br-none' : 'bg-fin-surface border border-fin-border text-fin-text-primary rounded-bl-none')}>
                                {m.content}
                              </div>
                            </div>
                          ))}
                          {aiLoading && (
                            <div className="flex justify-start">
                              <div className="bg-fin-surface border border-fin-border p-3 rounded-xl rounded-bl-none">
                                <Loader2 size={14} className="animate-spin text-fin-text-muted" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Tulis pertanyaan..."
                            value={aiInput}
                            onChange={e => setAiInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !aiLoading && sendAIMessage()}
                            className="flex-1 h-10 border-fin-border text-sm"
                          />
                          <Button onClick={sendAIMessage} disabled={aiLoading || !aiInput.trim()} className="h-10 px-4 bg-ds-primary text-white rounded-lg text-xs font-bold">
                            Kirim
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </Card>

          {/* Simulation Detail Table — shown after run */}
          <AnimatePresence>
            {simResult && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="rounded-xl border border-fin-border bg-fin-surface shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-fin-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                      <Calendar size={14} className="text-[#2E90FA]" />
                      Detail Per Bulan
                    </h3>
                    <Badge className="bg-fin-page text-fin-text-muted border border-fin-border text-[10px] font-bold">{simResult.tahun}</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-fin-border bg-fin-page">
                          <th className="text-left px-3 py-2 font-bold text-fin-text-muted uppercase">Bulan</th>
                          <th className="text-right px-3 py-2 font-bold text-fin-text-muted uppercase">Inflow</th>
                          <th className="text-right px-3 py-2 font-bold text-fin-text-muted uppercase">Outflow</th>
                          <th className="text-right px-3 py-2 font-bold text-fin-text-muted uppercase">Saldo</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {simResult.timeline.map(t => (
                          <tr key={t.bulan} className={cn(
                            'border-b border-fin-border/50 transition-colors',
                            t.isDeficit ? 'bg-[#FEF3F2]' : t.isCritical ? 'bg-[#FFFAEB]' : t.isCurrent ? 'bg-indigo-50/40' : ''
                          )}>
                            <td className="px-3 py-2 font-semibold text-fin-text-primary">
                              {BULAN_LABELS[t.bulan - 1]}
                              {t.isCurrent && <span className="ml-1 text-[8px] font-black text-indigo-500 uppercase">Now</span>}
                              {t.isPast && <span className="ml-1 text-[8px] font-black text-fin-text-muted uppercase">Aktual</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-[#12B76A] tabular-nums">{t.inflow > 0 ? '+' + formatCurrency(t.inflow) : '—'}</td>
                            <td className="px-3 py-2 text-right font-medium text-rose-500 tabular-nums">{t.outflow > 0 ? '-' + formatCurrency(t.outflow) : '—'}</td>
                            <td className={cn('px-3 py-2 text-right font-black tabular-nums', t.isDeficit ? 'text-[#B42318]' : t.isCritical ? 'text-[#B54708]' : 'text-fin-text-primary')}>
                              {formatCurrency(t.saldo)}
                            </td>
                            <td className="px-3 py-2">
                              {t.isDeficit && <AlertTriangle size={11} className="text-[#B42318]" />}
                              {t.isCritical && !t.isDeficit && <AlertCircle size={11} className="text-[#B54708]" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── MANUAL BOOK DIALOG ──────────────────────────────── */}
      <Dialog open={openManual} onOpenChange={setOpenManual}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          {/* Header */}
          <div className="bg-[#111827] px-6 py-5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
                <BookOpen className="w-4.5 h-4.5 text-white" size={18} />
              </div>
              <div>
                <DialogTitle className="text-white text-base font-black tracking-tight">Panduan Penggunaan</DialogTitle>
                <DialogDescription className="text-white/50 text-[11px] mt-0.5">
                  Simulator Kas Cerdas — DSS BPKAD Kab. Kepulauan Aru
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 scrollbar-hide">

            {/* Section helper */}
            {([
              {
                no: '01', title: 'Gambaran Umum', color: 'bg-blue-50 border-blue-200 text-blue-800',
                content: (
                  <p className="text-xs text-fin-text-muted leading-relaxed">
                    Simulator Kas Cerdas adalah modul analisis likuiditas yang memungkinkan operator BPKAD memproyeksikan kondisi kas daerah sebelum menerbitkan SP2D. Engine simulasi berjalan di server, mengambil data riil BKU (SP2D, Pendapatan, Saldo Awal), dan menghasilkan proyeksi arus kas 12 bulan lengkap dengan peringatan bulan defisit dan empat metrik likuiditas lanjutan.
                  </p>
                )
              },
              {
                no: '02', title: 'Mengelola Skenario', color: 'bg-indigo-50 border-indigo-200 text-indigo-800',
                content: (
                  <ul className="space-y-2">
                    {[
                      ['Tambah Skenario', 'Klik "+" → isi nama → klik "Buat Skenario". Setiap skenario menyimpan daftar pengeluaran sendiri.'],
                      ['Beralih Skenario', 'Klik tab nama skenario di bagian atas. Grafik dan metrik langsung menyesuaikan.'],
                      ['Simpan', 'Klik "Simpan" agar skenario tersimpan ke database dan tersedia di sesi berikutnya.'],
                      ['Hapus', 'Klik ikon tempat sampah. Skenario terakhir tidak dapat dihapus.'],
                    ].map(([k, v]) => (
                      <li key={k} className="flex gap-2 text-xs">
                        <span className="font-bold text-indigo-600 shrink-0 w-28">{k}</span>
                        <span className="text-fin-text-muted leading-relaxed">{v}</span>
                      </li>
                    ))}
                  </ul>
                )
              },
              {
                no: '03', title: 'Menambah Rencana Belanja (Outflow)', color: 'bg-rose-50 border-rose-200 text-rose-800',
                content: (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-bold text-fin-text-primary mb-1.5">A. Input Manual</p>
                      <ul className="space-y-1.5">
                        {[
                          'Pilih Sumber Dana (DAU, DAK, PAD, dll).',
                          'Tentukan prioritas: MANDATORY (gaji, kontrak) atau DISCRETIONARY (belanja yang bisa ditunda).',
                          'Isi Uraian dan Nilai Nominal → klik "Tambahkan ke Skenario".',
                        ].map((t, i) => <li key={i} className="flex gap-2 text-xs text-fin-text-muted"><span className="text-rose-400 font-black shrink-0">{i + 1}.</span>{t}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-fin-text-primary mb-1.5">B. Smart Injection (Arsip SP2D)</p>
                      <ul className="space-y-1.5">
                        {[
                          'Klik "SMART INJECTION" → cari Nomor SP2D atau Uraian.',
                          'Filter berdasarkan OPD menggunakan dropdown di sebelah kanan.',
                          'Klik "Suntikkan" — nilai, sumber dana, dan prioritas terisi otomatis.',
                          'SP2D berjenis GAJI/PEGAWAI otomatis dikategorikan MANDATORY.',
                        ].map((t, i) => <li key={i} className="flex gap-2 text-xs text-fin-text-muted"><span className="text-rose-400 font-black shrink-0">{i + 1}.</span>{t}</li>)}
                      </ul>
                    </div>
                  </div>
                )
              },
              {
                no: '04', title: 'Proyeksi Inflow (Pendapatan)', color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                content: (
                  <ul className="space-y-1.5">
                    {[
                      'Proyeksi diinput manual melalui modul Proyeksi Pendapatan (halaman terpisah).',
                      'Klik "Auto-Proyeksi" untuk mengisi proyeksi dari rata-rata historis 3 tahun terakhir per sumber dana per bulan.',
                      'Proyeksi otomatis hanya aktif untuk sesi ini — simpan secara manual jika ingin permanen.',
                    ].map((t, i) => <li key={i} className="flex gap-2 text-xs text-fin-text-muted"><span className="text-emerald-500 font-black shrink-0">{i + 1}.</span>{t}</li>)}
                  </ul>
                )
              },
              {
                no: '05', title: 'Menjalankan Engine Simulasi', color: 'bg-sky-50 border-sky-200 text-sky-800',
                content: (
                  <div className="space-y-2 text-xs text-fin-text-muted leading-relaxed">
                    <p>Klik <strong className="text-fin-text-primary">&ldquo;Jalankan Simulasi&rdquo;</strong> (ikon Play). Engine server akan:</p>
                    <ul className="space-y-1.5">
                      {[
                        'Mengambil inflow/outflow aktual bulan-bulan lalu dari BKU riil.',
                        'Menggabungkan proyeksi untuk bulan-bulan mendatang.',
                        'Menerapkan pengeluaran skenario aktif ke bulan berjalan.',
                        'Menghitung saldo berjalan dan 4 metrik likuiditas selama 12 bulan.',
                      ].map((t, i) => <li key={i} className="flex gap-2"><span className="text-sky-500 font-black shrink-0">→</span>{t}</li>)}
                    </ul>
                  </div>
                )
              },
              {
                no: '06', title: 'Menginterpretasi Hasil', color: 'bg-amber-50 border-amber-200 text-amber-800',
                content: (
                  <div className="space-y-2.5">
                    {[
                      { name: 'Days of Cash', icon: '🕐', desc: 'Hari operasional yang dapat dibiayai tanpa pemasukan baru. < 30 hari = KRITIS (merah), 30–90 = WASPADA (kuning), > 90 = AMAN (hijau).' },
                      { name: 'Burn Rate/Hari', icon: '🔥', desc: 'Pengeluaran kas rata-rata per hari. Dasar perhitungan kebutuhan pencairan jangka pendek.' },
                      { name: 'Mandatory Ratio', icon: '🛡', desc: 'Porsi belanja wajib terhadap total. Di atas 80% berarti fleksibilitas anggaran sangat terbatas.' },
                      { name: 'Concentration Risk', icon: '📊', desc: 'Konsentrasi outflow pada satu bulan. Di atas 50% = risiko likuiditas terkonsentrasi.' },
                    ].map(m => (
                      <div key={m.name} className="flex gap-3 p-2.5 bg-fin-page rounded-lg border border-fin-border">
                        <span className="text-base shrink-0">{m.icon}</span>
                        <div>
                          <p className="text-[11px] font-bold text-fin-text-primary">{m.name}</p>
                          <p className="text-[10px] text-fin-text-muted leading-relaxed">{m.desc}</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-fin-text-muted leading-relaxed pt-1">Grafik Timeline: garis biru = saldo berjalan, hijau putus = inflow, kuning putus = outflow. Titik merah = defisit, oranye = kritis.</p>
                  </div>
                )
              },
              {
                no: '07', title: 'Bantuan AI & Rekomendasi', color: 'bg-violet-50 border-violet-200 text-violet-800',
                content: (
                  <ul className="space-y-1.5">
                    {[
                      '"Terapkan Efisiensi" menghapus semua item DISCRETIONARY dari skenario aktif sekaligus.',
                      '"Bantuan AI" membuka konsultan keuangan AI. Konteks simulasi (saldo, burn rate, bulan defisit) otomatis disertakan.',
                      'Ketik pertanyaan dalam Bahasa Indonesia — tekan Enter atau klik "Kirim".',
                      'Riwayat 6 pesan terakhir dikirim sebagai konteks agar AI dapat memberikan analisis berkelanjutan.',
                    ].map((t, i) => <li key={i} className="flex gap-2 text-xs text-fin-text-muted"><span className="text-violet-400 font-black shrink-0">{i + 1}.</span>{t}</li>)}
                  </ul>
                )
              },
              {
                no: '08', title: 'Cetak & Ekspor', color: 'bg-gray-50 border-gray-200 text-gray-700',
                content: (
                  <ul className="space-y-1.5">
                    {[
                      '"Cetak" mencetak laporan analisis — gunakan "Simpan sebagai PDF" pada dialog cetak browser.',
                      '"Simpan" menyimpan skenario aktif beserta daftar pengeluaran ke database.',
                      '"Panduan" (tombol ini) membuka dokumen panduan dan menyediakan opsi Unduh PDF untuk arsip offline.',
                    ].map((t, i) => <li key={i} className="flex gap-2 text-xs text-fin-text-muted"><span className="text-gray-400 font-black shrink-0">{i + 1}.</span>{t}</li>)}
                  </ul>
                )
              },
            ] as { no: string; title: string; color: string; content: React.ReactNode }[]).map(sec => (
              <div key={sec.no} className={`rounded-xl border p-4 ${sec.color.split(' ')[0]} ${sec.color.split(' ')[1]}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-black tabular-nums ${sec.color.split(' ')[2]}`}>{sec.no}</span>
                  <h3 className={`text-[11px] font-black uppercase tracking-wide ${sec.color.split(' ')[2]}`}>{sec.title}</h3>
                </div>
                {sec.content}
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-fin-border bg-fin-page flex items-center justify-between shrink-0 gap-3">
            <p className="text-[10px] text-fin-text-muted">Versi panduan: Mei 2026 &mdash; DSS BPKAD v2</p>
            <div className="flex gap-2">
              <Button onClick={downloadManualPDF} className="h-9 px-4 bg-ds-primary text-white rounded-lg text-xs font-bold flex items-center gap-2">
                <Download size={13} />
                Unduh PDF
              </Button>
              <Button variant="outline" onClick={() => setOpenManual(false)} className="h-9 px-4 border-fin-border text-fin-text-muted rounded-lg text-xs font-bold">
                Tutup
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </TooltipProvider>
  );
}
