'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Info,
  Calendar,
  Banknote,
  Loader2,
  RefreshCw,
  PieChart,
  Activity,
  ChevronDown,
  Download,
  X,
  Save,
  ArrowUpRight,
  Target,
  Sparkles,
  ListFilter,
  ShieldCheck,
  Search,
  Building2,
  FileSearch
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
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, 
  Title, ChartTooltip, Legend, Filler
);
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from 'sonner';
import { NumericInput } from '@/components/NumericInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from '@/components/patterns/page-header';

export default function CashSimulatorPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sumberDana, setSumberDana] = useState<any[]>([]);
  const [projections, setProjections] = useState<any[]>([]);
  
  // Multi-Scenario State
  const [scenarios, setScenarios] = useState<any[]>([
    { name: 'Skenario Utama', items: [] }
  ]);
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);

  // Input State with Priority
  const [currentSelection, setCurrentSelection] = useState({ 
    id: '', 
    amount: 0, 
    label: '', 
    priority: 'mandatory' // 'mandatory' or 'discretionary'
  });

  // Baseline data (real current state)
  const [baselineKas, setBaselineKas] = useState(0);

  // Smart Injection State
  const [openInjection, setOpenInjection] = useState(false);
  const [sp2dSearch, setSp2dSearch] = useState('');
  const [availableSP2Ds, setAvailableSP2Ds] = useState<any[]>([]);
  const [loadingSP2Ds, setLoadingSP2Ds] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // Fetch both master sources and real-time analytics (Same source as Dashboard)
      const currentYear = new Date().getFullYear();
      const [resDana, resAnalytics, resScenarios, resProjections] = await Promise.all([
        api.get('/dss/sumber-dana'),
        api.get('/reports/dashboard-stats', { params: { tahun: currentYear } }),
        api.get('/dss/simulator/scenarios'),
        api.get('/dss/simulator/projections')
      ]);

      setSumberDana(resDana.data);
      
      // Menggunakan Kas Efektif yang sama persis dengan Dashboard
      const realTimeKas = resAnalytics.data.summary?.kasEfektif || 0;
      setBaselineKas(realTimeKas);

      if (resScenarios.data.length > 0) {
        setScenarios(resScenarios.data);
      }

      setProjections(resProjections.data);

    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data simulator');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveScenario = async () => {
    if (!scenarios[activeScenarioIdx]) {
      toast.error('Tidak ada skenario untuk disimpan');
      return;
    }
    setSaving(true);
    const scenario = scenarios[activeScenarioIdx];
    try {
      const res = await api.post('/dss/simulator/scenarios', {
        id: scenario.id,
        name: scenario.name,
        items: scenario.items || []
      });
      
      const newScenarios = [...scenarios];
      newScenarios[activeScenarioIdx] = res.data;
      setScenarios(newScenarios);
      toast.success('Skenario berhasil disimpan');
    } catch (err) {
      toast.error('Gagal menyimpan skenario');
    } finally {
      setSaving(false);
    }
  };

  const fetchSP2Ds = async (searchStr = '') => {
    setLoadingSP2Ds(true);
    try {
      const res = await api.get(`/sp2d?limit=20&search=${searchStr}`);
      setAvailableSP2Ds(res.data.data || []);
    } catch (err) {
      toast.error('Gagal memuat daftar SP2D');
    } finally {
      setLoadingSP2Ds(false);
    }
  };

  const injectSP2D = (sp2d: any) => {
    const mainDetail = sp2d.details?.[0];
    const sourceId = mainDetail?.id_sumber_dana || '';
    
    const newItem = {
      timestamp: Date.now() + Math.random(),
      id: sourceId,
      amount: sp2d.nilai_bruto,
      label: `[SP2D] ${sp2d.nomor} - ${sp2d.uraian}`,
      sourceName: sourceId ? (sumberDana.find(s => s.id === sourceId)?.nama || 'Sumber Tidak Dikenal') : 'Sumber Tidak Dikenal',
      priority: sp2d.jenis.includes('GAJI') || sp2d.jenis.includes('PEGAWAI') ? 'mandatory' : 'discretionary'
    };

    const newScenarios = [...scenarios];
    const currentItems = newScenarios[activeScenarioIdx].items || [];
    newScenarios[activeScenarioIdx].items = [...currentItems, newItem];
    setScenarios(newScenarios);
    
    toast.success(`Berhasil menyuntikkan data ${sp2d.nomor}`);
    setOpenInjection(false);
  };



  const applyEfficiencySaran = () => {
    if (!scenarios[activeScenarioIdx]) return;
    const newScenarios = [...scenarios];
    const filteredItems = newScenarios[activeScenarioIdx].items.filter((it: any) => it.priority !== 'discretionary');
    newScenarios[activeScenarioIdx].items = filteredItems;
    setScenarios(newScenarios);
    toast.success('Belanja pilihan (discretionary) telah ditunda untuk efisiensi kas');
  };

  const activeScenario = scenarios[activeScenarioIdx] || { name: 'New', items: [] };

  const addSimulation = () => {
    if (!currentSelection.id || !currentSelection.amount || currentSelection.amount <= 0) {
      toast.error('Harap pilih sumber dana dan masukkan nilai nominal valid');
      return;
    }
    if (!scenarios[activeScenarioIdx]) return;

    const source = sumberDana.find(s => s.id === currentSelection.id);
    
    const newScenarios = [...scenarios];
    const currentItems = newScenarios[activeScenarioIdx].items || [];
    
    newScenarios[activeScenarioIdx].items = [...currentItems, { 
      ...currentSelection, 
      sourceName: source?.nama,
      timestamp: new Date().getTime() 
    }];
    setScenarios(newScenarios);
    setCurrentSelection({ id: '', amount: 0, label: '', priority: 'mandatory' });
  };

  const removeSimulation = (timestamp: number) => {
    const newScenarios = [...scenarios];
    newScenarios[activeScenarioIdx].items = newScenarios[activeScenarioIdx].items.filter((i: any) => i.timestamp !== timestamp);
    setScenarios(newScenarios);
  };

  const addNewScenario = () => {
    const name = prompt('Nama Skenario Baru:', `Skenario ${scenarios.length + 1}`);
    if (name) setScenarios([...scenarios, { name, items: [] }]);
  };

  const handleDeleteScenario = async () => {
    if (scenarios.length <= 1) {
      toast.error('Tidak dapat menghapus satu-satunya skenario');
      return;
    }
    
    const scenario = scenarios[activeScenarioIdx];
    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus skenario "${scenario.name}"?`);
    if (!confirmDelete) return;

    if (scenario.id) {
      try {
        await api.delete(`/dss/simulator/scenarios/${scenario.id}`);
        toast.success('Skenario berhasil dihapus');
      } catch (err) {
        toast.error('Gagal menghapus skenario dari database');
        return;
      }
    } else {
      toast.success('Skenario lokal dihapus');
    }
    
    const newScenarios = scenarios.filter((_, i) => i !== activeScenarioIdx);
    setScenarios(newScenarios);
    setActiveScenarioIdx(Math.max(0, activeScenarioIdx - 1));
  };

  // Calculations
  // Calculations with Null Safety
  const items = activeScenario.items || [];
  const totalMandatory = items.filter((i: any) => i.priority === 'mandatory').reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
  const totalDiscretionary = items.filter((i: any) => i.priority === 'discretionary').reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
  const totalSimulatedSpend = totalMandatory + totalDiscretionary;
  
  // BUG FIX: Use parseNumber with Number() guard for robust calculation
  const totalProjections = (projections || []).reduce((sum: number, item: any) => sum + (Number(parseNumber(item.nilai || 0)) || 0), 0);
  
  const totalInflow = baselineKas + totalProjections;
  const finalKas = totalInflow - totalSimulatedSpend;
  const percentageLeft = (finalKas / (totalInflow || 1)) * 100;

  // What-if analysis (If only mandatory)
  const finalKasMandatoryOnly = totalInflow - totalMandatory;
  const percentageLeftMandatoryOnly = (finalKasMandatoryOnly / (totalInflow || 1)) * 100;

  const getRiskStatus = () => {
    if (finalKas < 0) return { label: 'Kritis', color: 'text-[#B42318]', bg: 'bg-[#FEF3F2]', border: 'border-[#FECDCA]', icon: ShieldAlert, msg: 'Pengeluaran ini akan memicu defisit kas dan memerlukan talangan darurat.' };
    if (percentageLeft < 20) return { label: 'Waspada', color: 'text-[#B54708]', bg: 'bg-[#FFFAEB]', border: 'border-[#FEDF89]', icon: AlertTriangle, msg: 'Saldo kas berada di bawah ambang aman (20%). Disarankan menunda belanja non-prioritas.' };
    return { label: 'Aman', color: 'text-[#027A48]', bg: 'bg-[#ECFDF3]', border: 'border-[#ABEFC6]', icon: CheckCircle2, msg: 'Kondisi kas stabil. Rencana pengeluaran masih dalam batas kapasitas likuiditas daerah.' };
  };

  const risk = getRiskStatus();

  if (loading) return (
    <div className="h-[80vh] flex flex-col items-center justify-center gap-4">
       <Loader2 className="animate-spin text-[#2E90FA]" size={48} />
       <p className="text-sm font-medium text-fin-text-muted">Mempersiapkan Engine Simulasi...</p>
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700">
      <style jsx global>{`
        @media print {
          nav, aside, button, .no-print, [role="tablist"] {
            display: none !important;
          }
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .max-w-[1440px] {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
          }
          .grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 20px !important;
          }
          .card {
            border: 1px solid #eee !important;
            box-shadow: none !important;
            break-inside: avoid;
          }
          .print-header {
            display: block !important;
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px double #101828;
            padding-bottom: 15px;
          }
          .print-header h2 { font-size: 18px; font-weight: 900; text-transform: uppercase; }
          .print-header p { font-size: 10px; color: #666; margin-top: 5px; }
        }
        .print-header { display: none; }
      `}</style>

      {/* PRINT HEADER */}
      <div className="print-header">
         <h2>BPKAD KAB. KEPULAUAN ARU</h2>
         <h1 className="text-xl font-black uppercase mt-1">LAPORAN ANALISIS STRATEGIS LIKUIDITAS KAS</h1>
         <p>Skenario: {activeScenario.name} | Tanggal Cetak: {new Date().toLocaleString('id-ID')}</p>
      </div>

      {/* PAGE HEADER */}
      <PageHeader
        title="Simulator Kas Cerdas"
        description="Simulasi prioritas pengeluaran untuk menjaga likuiditas kas daerah"
        icon={<Zap className="size-5" />}
      />

      {/* SCENARIO TABS & CONTROLS */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-6">
        <div className="flex items-center gap-3 overflow-x-auto pb-2 md:pb-0">
           <div className="flex bg-fin-page p-1 rounded-lg border border-fin-border">
              {scenarios.map((s, idx) => (
                <Button 
                  key={idx}
                  variant="ghost"
                  onClick={() => setActiveScenarioIdx(idx)}
                  className={cn(
                     "h-8 px-5 rounded-md text-[11px] font-medium transition-all",
                     activeScenarioIdx === idx 
                       ? "bg-fin-surface text-fin-text-primary shadow-sm" 
                       : "text-fin-text-muted hover:text-fin-text-primary"
                  )}
                >
                   {s.name}
                </Button>
              ))}
           </div>
           <div className="flex gap-2">
             <Button 
               size="icon"
               variant="outline"
               onClick={addNewScenario}
               className="h-10 w-10 border-fin-border text-fin-text-muted rounded-lg hover:bg-fin-page transition-all shrink-0"
               title="Tambah Skenario Baru"
             >
               <Plus size={16} />
             </Button>
             <Button 
               size="icon"
               variant="outline"
               onClick={handleDeleteScenario}
               className="h-10 w-10 border-fin-border text-[#F04438] rounded-lg hover:bg-[#FEF3F2] transition-all shrink-0"
               title="Hapus Skenario Aktif"
             >
               <Trash2 size={16} />
             </Button>
           </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
           <div className="flex items-center gap-2">
              <Button 
                onClick={handleSaveScenario}
                disabled={saving}
                className="h-10 px-4 bg-[#101828] text-white rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-[#1D2939] transition-all shadow-sm active:scale-95"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Simpan
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.print()}
                className="h-10 px-4 border-fin-border text-fin-text-muted rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-fin-page transition-all active:scale-95"
              >
                <Download size={14} />
                Cetak
              </Button>
           </div>
        </div>
      </div>

      {/* STRATEGIC SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         {/* Baseline Kas Card */}
         <Card className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-[#2E90FA] transition-all">
            <div className="w-12 h-12 bg-[#EFF8FF] text-[#175CD3] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <TrendingUp size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Baseline Kas Saat Ini</p>
              <p className="text-xl font-bold text-fin-text-primary mt-0.5 tabular-nums truncate">{formatCurrency(baselineKas)}</p>
            </div>
         </Card>

         {/* Proyeksi Inflow Card */}
         <Card className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-[#12B76A] transition-all">
            <div className="w-12 h-12 bg-[#ECFDF3] text-[#027A48] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <ArrowUpRight size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Proyeksi Inflow</p>
              <p className="text-xl font-bold text-[#12B76A] mt-0.5 tabular-nums truncate">+{formatCurrency(totalProjections)}</p>
            </div>
         </Card>

         {/* Total Outflow Card */}
         <Card className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-[#F04438] transition-all">
            <div className="w-12 h-12 bg-[#FEF3F2] text-[#B42318] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <TrendingDown size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Total Outflow Simulasi</p>
              <p className="text-xl font-bold text-[#F04438] mt-0.5 tabular-nums truncate">-{formatCurrency(totalSimulatedSpend)}</p>
            </div>
         </Card>

         {/* Estimasi Saldo Akhir Card */}
         <Card className={cn(
           "bg-fin-surface p-6 rounded-xl border shadow-sm flex items-center gap-4 group transition-all",
           finalKas < 0 ? "border-[#F04438] hover:border-[#B42318]" : "border-fin-border hover:border-[#F79009]"
         )}>
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0",
              finalKas < 0 ? "bg-[#FEF3F2] text-[#B42318]" : "bg-amber-50 text-amber-600"
            )}>
              <risk.icon size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Estimasi Saldo Akhir</p>
              <div className="flex items-center gap-2 mt-0.5">
                 <p className={cn("text-xl font-bold tabular-nums truncate", finalKas < 0 ? "text-[#B42318]" : "text-fin-text-primary")}>{formatCurrency(finalKas)}</p>
              </div>
            </div>
         </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Panel */}
        <div className="space-y-6">
          <div className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm h-[420px]">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                   <ListFilter size={18} className="text-[#2E90FA]" />
                   Injeksi Rencana Belanja (SP2D)
                </h3>
                <Dialog open={openInjection} onOpenChange={(val) => {
                  setOpenInjection(val);
                  if (val) fetchSP2Ds();
                }}>
                  <DialogTrigger render={
                  <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50 gap-1.5 shadow-sm">
                    <Sparkles size={14} />
                    SMART INJECTION
                  </Button>
                } />
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-black tracking-tight">Smart Injection (Data Riil)</DialogTitle>
                      <DialogDescription className="text-xs font-medium">
                        Pilih data SP2D dari arsip untuk disuntikkan secara otomatis ke dalam simulasi kas.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="relative mt-4 flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted" size={16} />
                        <Input 
                          placeholder="Cari Nomor SP2D / Uraian..." 
                          className="pl-10 h-11 bg-fin-page border-fin-border text-sm font-medium"
                          value={sp2dSearch}
                          onChange={(e) => {
                            setSp2dSearch(e.target.value);
                            fetchSP2Ds(e.target.value);
                          }}
                        />
                      </div>
                      <Select defaultValue="all" onValueChange={(val) => {
                        // Logic Filter (Untuk Demo)
                        fetchSP2Ds(sp2dSearch);
                      }}>
                        <SelectTrigger className="w-[140px] h-11 bg-fin-page border-fin-border text-xs font-semibold">
                          <SelectValue placeholder="Semua OPD" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua OPD</SelectItem>
                          <SelectItem value="pendidikan">Dinas Pendidikan</SelectItem>
                          <SelectItem value="kesehatan">Dinas Kesehatan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
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
                        availableSP2Ds.map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-4 bg-fin-surface border border-fin-border rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-fin-page rounded-lg flex items-center justify-center text-fin-text-muted group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                   <Building2 size={20} />
                                </div>
                                <div>
                                   <p className="text-[11px] font-black text-fin-text-primary uppercase tracking-tight">{s.nomor}</p>
                                   <p className="text-[10px] font-bold text-fin-text-muted line-clamp-1 max-w-[300px]">{s.uraian}</p>
                                   <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-[9px] h-4 px-1 border-fin-border text-fin-text-muted font-bold">{s.jenis}</Badge>
                                      <span className="text-[10px] font-black text-indigo-600">{formatCurrency(s.nilai_bruto)}</span>
                                   </div>
                                </div>
                             </div>
                             <Button 
                               onClick={() => injectSP2D(s)}
                               className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 rounded-lg text-xs font-bold"
                             >
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
                    <div className="relative">
                      <Select value={currentSelection.id} onValueChange={(val) => setCurrentSelection({...currentSelection, id: val})}>
                        <SelectTrigger className="w-full h-10 bg-fin-page border-fin-border rounded-lg text-xs font-medium text-fin-text-primary focus:border-[#2E90FA] transition-all">
                          <SelectValue placeholder="Pilih Sumber Dana" />
                        </SelectTrigger>
                        <SelectContent>
                          {sumberDana.map(s => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-fin-text-muted ml-1">Prioritas Belanja</label>
                    <div className="relative">
                      <Select value={currentSelection.priority} onValueChange={(val) => setCurrentSelection({...currentSelection, priority: val})}>
                        <SelectTrigger className="w-full h-10 bg-fin-page border-fin-border rounded-lg text-xs font-medium text-fin-text-primary focus:border-[#2E90FA] transition-all">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mandatory">MANDATORY (Wajib)</SelectItem>
                          <SelectItem value="discretionary">DISCRETIONARY (Pilihan)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-fin-text-muted ml-1">Uraian Pembayaran SP2D</label>
                  <Input 
                    type="text" 
                    placeholder="Contoh: Gaji Pegawai / Belanja Modal..."
                    className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary transition-all"
                    value={currentSelection.label}
                    onChange={(e) => setCurrentSelection({...currentSelection, label: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-fin-text-muted ml-1">Nilai Nominal (Rp)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-fin-text-muted font-semibold text-lg">Rp</div>
                    <NumericInput 
                      className="pl-12 h-12 bg-fin-page border-fin-border rounded-lg text-2xl font-bold tracking-tight text-fin-text-primary transition-all"
                      value={currentSelection.amount}
                      onValueChange={(val) => setCurrentSelection({...currentSelection, amount: val})}
                    />
                  </div>
                </div>

                <Button 
                  onClick={addSimulation}
                  disabled={!currentSelection.id || currentSelection.amount <= 0}
                  className="w-full h-12 bg-[#101828] text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} />
                  Tambahkan ke Skenario
                </Button>
             </div>
          </div>

          {/* Revenue Projections (INFLOW) */}
          <div className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm h-[250px]">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                  <ArrowUpRight size={18} className="text-[#12B76A]" />
                  Proyeksi Inflow (Pendapatan)
               </h3>
               <Badge className="bg-[#ECFDF3] text-[#027A48] border-none text-[11px]">{projections.length} Item</Badge>
             </div>
             
             <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1 scrollbar-hide">
                {projections.length === 0 ? (
                  <div className="p-4 bg-fin-page rounded-lg border border-dashed border-fin-border text-center">
                    <p className="text-[11px] font-medium text-fin-text-muted">Belum ada proyeksi pendapatan terdaftar</p>
                  </div>
                ) : (
                  projections.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-fin-page rounded-lg border border-fin-border">
                       <div>
                          <p className="text-xs font-semibold text-fin-text-primary">{p.keterangan || 'Pendapatan Proyeksi'}</p>
                          <p className="text-[10px] text-fin-text-muted">Bulan {p.bulan} - {p.sumber_dana_nama}</p>
                       </div>
                       <span className="text-xs font-bold text-[#12B76A]">+{formatCurrency(p.nilai)}</span>
                    </div>
                  ))
                )}
             </div>
          </div>

          {/* Simulated List (OUTFLOW) with Priority Separation */}
          <Card className="bg-[#101828] p-6 rounded-xl text-white overflow-hidden relative border border-[#1D2939] shadow-sm">
            <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 scale-150">
               <Activity size={100} />
            </div>
            <h3 className="text-[11px] font-bold text-fin-text-muted uppercase tracking-widest mb-4 relative z-10">Daftar Pengeluaran Skenario</h3>
            <div className="space-y-2.5 relative z-10">
               <AnimatePresence>
                 {!activeScenario.items || activeScenario.items.length === 0 ? (
                   <div className="flex flex-col items-center justify-center py-10 opacity-40">
                      <Zap size={40} className="mb-2" />
                      <p className="text-[11px] uppercase font-bold tracking-widest">Skenario Kosong</p>
                   </div>
                 ) : (
                   activeScenario.items.map((item: any) => (
                     <motion.div 
                       key={item.timestamp}
                       initial={{ x: -20, opacity: 0 }}
                       animate={{ x: 0, opacity: 1 }}
                       exit={{ x: 20, opacity: 0 }}
                       className={cn(
                         "flex items-center justify-between p-3.5 rounded-xl border transition-all",
                         item.priority === 'mandatory' 
                           ? "bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/10" 
                           : "bg-blue-500/5 border-blue-500/10 hover:bg-blue-500/10"
                       )}
                     >
                       <div className="text-left flex items-center gap-3">
                          <div className={cn("w-2 h-2 rounded-full", item.priority === 'mandatory' ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]")} />
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                               <p className="text-xs font-bold leading-none uppercase tracking-tight">{item.label || 'Belanja Tanpa Nama'}</p>
                               <Badge className={cn("text-[9px] h-4 px-1.5 font-bold border-none", item.priority === 'mandatory' ? "bg-rose-500/20 text-rose-300" : "bg-blue-500/20 text-blue-300")}>
                                  {item.priority === 'mandatory' ? 'WAJIB' : 'PILIHAN'}
                               </Badge>
                            </div>
                            <p className="text-[10px] font-medium text-fin-text-muted">{item.sourceName}</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-4">
                          <span className={cn("text-xs font-black tabular-nums", item.priority === 'mandatory' ? "text-rose-400" : "text-blue-400")}>
                             -{formatCurrency(item.amount)}
                          </span>
                          <Button variant="ghost" size="icon" onClick={() => removeSimulation(item.timestamp)} className="h-8 w-8 text-fin-text-muted hover:text-[#F04438] hover:bg-fin-surface/10 rounded-lg transition-colors"><Trash2 size={14} /></Button>
                       </div>
                     </motion.div>
                   ))
                 )}
               </AnimatePresence>
            </div>
          </Card>
        </div>

        {/* Right: Analysis Panel */}
        <div className="space-y-6">
            <Card className="p-6 md:p-8 rounded-2xl shadow-sm border border-fin-border relative overflow-hidden bg-fin-surface">
              <div className="flex flex-col gap-8">
                 <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
                    {/* Radial Progress */}
                    <div className="relative w-32 h-32 flex items-center justify-center shrink-0 bg-fin-page rounded-full p-2">
                       <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
                          <circle cx="56" cy="56" r="46" fill="transparent" stroke="#E9ECEF" strokeWidth="8" />
                          <motion.circle 
                            cx="56" cy="56" r="46" fill="transparent" 
                            stroke={finalKas < 0 ? '#F04438' : percentageLeft < 20 ? '#F79009' : '#2E90FA'} 
                            strokeWidth="8" 
                            strokeDasharray="289"
                            animate={{ strokeDashoffset: 289 - (289 * Math.max(0, percentageLeft)) / 100 }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            strokeLinecap="round"
                          />
                       </svg>
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-0.5">Sisa Kas</p>
                          <h4 className={cn("text-xl font-black tracking-tight", risk.color)}>{Math.max(0, Math.round(percentageLeft))}%</h4>
                       </div>
                    </div>
   
                    <div className="flex-1 space-y-3 w-full text-center sm:text-left min-w-0">
                       <div>
                          <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-[0.2em] mb-2">Estimasi Saldo Akhir</p>
                          <h2 className={cn("text-xl sm:text-2xl font-black tracking-tighter transition-colors tabular-nums break-words leading-tight", risk.color)}>
                            {formatCurrency(finalKas)}
                          </h2>
                          <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                             <span className={cn("px-4 py-1.5 rounded-xl text-[10px] font-black flex items-center gap-2 uppercase tracking-widest", risk.bg, risk.color, risk.border, "border-2")}>
                                <risk.icon size={14} />
                                {risk.label}
                             </span>
                             <Badge variant="outline" className="text-[10px] py-1 px-3 border-fin-border text-fin-text-muted font-black uppercase tracking-widest">
                                {activeScenario.name}
                             </Badge>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="p-5 bg-fin-page rounded-2xl border border-fin-border relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-fin-border group-hover:bg-indigo-400 transition-colors" />
                    <p className="text-xs text-fin-text-muted leading-relaxed font-medium italic pl-2">
                      "{risk.msg}"
                    </p>
                 </div>
              </div>

              {/* Advanced Comparison (Mandatory vs Discretionary) */}
              <div className="mt-8 pt-8 border-t border-fin-border grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div>
                    <h4 className="text-xs font-bold text-fin-text-primary mb-4 uppercase tracking-wider flex items-center gap-2">
                       <ShieldCheck size={16} className="text-rose-500" />
                       Beban Mandatory (Wajib)
                    </h4>
                    <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                          <span className="text-fin-text-muted">Gaji & Biaya Mengikat</span>
                          <span className="font-bold text-fin-text-primary">{formatCurrency(totalMandatory)}</span>
                       </div>
                       <div className="w-full h-2 bg-fin-page rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500" style={{ width: `${(totalMandatory / (totalInflow || 1)) * 100}%` }} />
                       </div>
                    </div>
                 </div>
                 <div>
                    <h4 className="text-xs font-bold text-fin-text-primary mb-4 uppercase tracking-wider flex items-center gap-2">
                       <Target size={16} className="text-blue-500" />
                       Belanja Discretionary (Pilihan)
                    </h4>
                    <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                          <span className="text-fin-text-muted">Modal & Hibah Fleksibel</span>
                          <span className="font-bold text-fin-text-primary">{formatCurrency(totalDiscretionary)}</span>
                       </div>
                       <div className="w-full h-2 bg-fin-page rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${(totalDiscretionary / (totalInflow || 1)) * 100}%` }} />
                       </div>
                    </div>
                 </div>
              </div>
           </Card>

           {/* STRATEGIC DECISION SUPPORT PANEL */}
            <Card className={cn(
             "p-6 rounded-xl border relative overflow-hidden transition-all shadow-lg h-[250px]",
             finalKas < 0 ? "bg-[#B42318] text-white border-none" : "bg-fin-surface border-fin-border"
           )}>
              <div className="flex items-start gap-4 relative z-10">
                 <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", finalKas < 0 ? "bg-fin-surface/20" : "bg-indigo-50 text-indigo-600")}>
                    <Sparkles size={20} />
                 </div>
                 <div className="flex-1">
                    <h4 className={cn("text-sm font-bold uppercase tracking-wider mb-2", finalKas < 0 ? "text-white" : "text-fin-text-primary")}>
                       Analisis Keputusan Strategis
                    </h4>
                    <p className={cn("text-xs leading-relaxed mb-4", finalKas < 0 ? "text-white/80" : "text-fin-text-muted")}>
                       {finalKas < 0 
                         ? `PERINGATAN: Kas Anda defisit. Namun, jika Anda MENUNDA seluruh belanja DISCRETIONARY (${formatCurrency(totalDiscretionary)}), maka saldo kas Anda akan kembali AMAN di angka ${formatCurrency(finalKasMandatoryOnly)} (${Math.round(percentageLeftMandatoryOnly)}%).` 
                         : percentageLeft < 20 
                           ? `REKOMENDASI: Saldo kritis. Disarankan untuk memprioritaskan belanja Mandatory dan mengevaluasi kembali belanja Discretionary agar sisa kas tetap di atas 20%.`
                           : `KONDISI OPTIMAL: Likuiditas Anda mampu menanggung seluruh rencana belanja Mandatory dan Discretionary dalam skenario ini.`
                       }
                    </p>
                     {finalKas < 0 && (
                       <div className="p-3 bg-fin-surface/10 rounded-lg border border-white/20 mb-4">
                          <p className="text-[11px] font-bold uppercase text-white/60 mb-2 flex items-center gap-2">
                             <AlertTriangle size={14} />
                             Saran Efisiensi:
                          </p>
                          <div className="flex justify-between items-center mb-1">
                             <span className="text-[10px] font-bold">Saldo Jika Belanja Pilihan Ditunda:</span>
                             <span className="text-xs font-black">{formatCurrency(finalKasMandatoryOnly)}</span>
                          </div>
                          <p className="text-[9px] text-white/50">Menghapus {activeScenario.items.filter((it: any) => it.priority === 'discretionary').length} item belanja pilihan.</p>
                       </div>
                     )}
                     <div className="flex gap-3">
                        <Button 
                          onClick={applyEfficiencySaran}
                          className={cn("h-9 px-4 rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center gap-2", finalKas < 0 ? "bg-fin-surface text-rose-700 hover:bg-rose-50 border-none" : "bg-indigo-600 text-white")}
                        >
                           <Sparkles size={14} />
                           Terapkan Efisiensi
                        </Button>
                        <Button variant="ghost" className={cn("h-9 px-4 rounded-lg text-[10px] font-black uppercase tracking-tight", finalKas < 0 ? "text-white/60 hover:bg-fin-surface/10" : "text-fin-text-muted")}>
                           Bantuan AI
                        </Button>
                     </div>
                 </div>
              </div>
             </Card>


         </div>
      </div>

    </div>
  );
}
