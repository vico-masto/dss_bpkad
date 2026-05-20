'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, 
  Users, 
  Database, 
  Plus, 
  Trash2, 
  Save, 
  Loader2, 
  ShieldCheck, 
  Building2, 
  Banknote, 
  Tags,
  Search,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  UserPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'referensi' | 'users' | 'data'>('referensi');
  const [activeRefTab, setActiveRefTab] = useState<'sd' | 'opd' | 'jenis'>('sd');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>([]);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setUserRole(user.role);
    if (activeTab === 'referensi') fetchRef();
  }, [activeTab, activeRefTab]);

  const fetchRef = async () => {
    setLoading(true);
    try {
      const endpoint = activeRefTab === 'sd' ? '/admin/sumber-dana' : activeRefTab === 'opd' ? '/admin/opd' : '/admin/jenis';
      const res = await api.get(endpoint);
      setData(res.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus referensi ini?')) return;
    try {
      const endpoint = activeRefTab === 'sd' ? `/admin/sumber-dana/${id}` : activeRefTab === 'opd' ? `/admin/opd/${id}` : `/admin/jenis/${id}`;
      await api.delete(endpoint);
      fetchRef();
    } catch (err) { toast.error('Gagal menghapus'); }
  };

  if (userRole && userRole !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertCircle size={48} className="text-rose-500" />
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Akses terbatas</h2>
        <p className="text-slate-500 font-semibold text-[11px]">Maaf, halaman ini hanya dapat diakses oleh Administrator.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-ds-primary rounded-xl flex items-center justify-center text-white shadow-lg">
            <Settings size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-fin-text-primary tracking-tight leading-none">Pengaturan Sistem</h1>
            <p className="text-[#667085] font-semibold text-[11px] mt-1.5 uppercase tracking-wider">Konfigurasi & manajemen administrasi</p>
          </div>
        </div>

        <div className="flex bg-fin-page p-1 rounded-xl border border-fin-border">
           <TabBtn active={activeTab === 'referensi'} onClick={() => setActiveTab('referensi')} label="Referensi" icon={<Tags size={14} />} />
           <TabBtn active={activeTab === 'users'} onClick={() => setActiveTab('users')} label="Pengguna" icon={<Users size={14} />} />
           <TabBtn active={activeTab === 'data'} onClick={() => setActiveTab('data')} label="Pusat Data" icon={<Database size={14} />} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'referensi' && (
          <motion.div key="ref" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
             <div className="flex gap-2">
                <RefTabBtn active={activeRefTab === 'sd'} onClick={() => setActiveRefTab('sd')} label="Sumber Dana" />
                <RefTabBtn active={activeRefTab === 'opd'} onClick={() => setActiveRefTab('opd')} label="Organisasi (OPD)" />
                <RefTabBtn active={activeRefTab === 'jenis'} onClick={() => setActiveRefTab('jenis')} label="Jenis Belanja" />
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4">
                   <RefForm type={activeRefTab} onSuccess={fetchRef} />
                </div>
                <div className="lg:col-span-8">
                   <Card className="rounded-xl border border-fin-border shadow-sm bg-white overflow-hidden">
                      <div className="overflow-x-auto">
                         <Table>
                            <TableHeader className="bg-fin-page">
                               <TableRow className="border-b border-fin-border hover:bg-transparent">
                                  <TableHead className="px-8 py-5 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">ID / Kode</TableHead>
                                  <TableHead className="px-8 py-5 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Nama Referensi</TableHead>
                                  {activeRefTab === 'sd' && <TableHead className="px-8 py-5 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Kategori</TableHead>}
                                  <TableHead className="px-8 py-5 text-center text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Aksi</TableHead>
                               </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-[#F2F4F7]">
                               {loading ? (
                                 <TableRow><TableCell colSpan={4} className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-fin-text-muted" size={32} /></TableCell></TableRow>
                               ) : data.map((item: any) => (
                                 <TableRow key={item.id} className="hover:bg-fin-page transition-colors group">
                                    <TableCell className="px-8 py-5 font-bold text-fin-text-primary text-xs uppercase">{item.id}</TableCell>
                                    <TableCell className="px-8 py-5 font-semibold text-fin-text-secondary text-xs uppercase">{item.nama}</TableCell>
                                    {activeRefTab === 'sd' && (
                                       <TableCell className="px-8 py-5">
                                          <Badge variant="outline" className={cn("px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider", item.kategori === 'BEBAS' ? "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]" : "bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]")}>
                                            {item.kategori}
                                          </Badge>
                                       </TableCell>
                                    )}
                                    <TableCell className="px-8 py-5 text-center">
                                       <button onClick={() => handleDelete(item.id)} className="p-2 text-fin-text-muted hover:text-[#F04438] transition-all"><Trash2 size={16} /></button>
                                    </TableCell>
                                 </TableRow>
                               ))}
                            </TableBody>
                         </Table>
                      </div>
                   </Card>
                </div>
             </div>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl">
             <UserManagementForm />
          </motion.div>
        )}

        {activeTab === 'data' && (
          <motion.div key="data" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <DataCard title="Backup Database" desc="Ekspor seluruh struktur dan data ke file SQL." icon={<Download size={32} />} color="indigo" />
             <DataCard title="Restore Database" desc="Impor data dari file backup sebelumnya." icon={<Upload size={32} />} color="emerald" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabBtn({ active, onClick, label, icon }: any) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-2 px-6 py-2 rounded-lg text-[11px] font-bold transition-all", active ? "bg-white text-fin-text-primary shadow-sm" : "text-[#667085] hover:text-fin-text-primary")}>
       {icon}
       <span className="uppercase tracking-wider">{label}</span>
    </button>
  );
}

function RefTabBtn({ active, onClick, label }: any) {
  return (
    <button onClick={onClick} className={cn("px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all border uppercase tracking-wider", active ? "bg-ds-primary text-white border-fin-text-primary" : "bg-white text-fin-text-muted border-[#EAECF0] hover:bg-fin-page")}>
       {label}
    </button>
  );
}

function RefForm({ type, onSuccess }: any) {
  const [form, setForm] = useState({ id: '', nama: '', kategori: 'BEBAS' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = type === 'sd' ? '/admin/sumber-dana' : type === 'opd' ? '/admin/opd' : '/admin/jenis';
      await api.post(endpoint, form);
      setForm({ id: '', nama: '', kategori: 'BEBAS' });
      onSuccess();
      toast.success('Referensi berhasil disimpan');
    } catch (err) { toast.error('Gagal menyimpan'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="p-8 rounded-xl border border-fin-border shadow-sm bg-white space-y-6">
       <h4 className="text-xs font-bold text-fin-text-primary uppercase tracking-widest">Tambah {type === 'sd' ? 'Sumber Dana' : type === 'opd' ? 'OPD' : 'Jenis Belanja'}</h4>
       <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#667085] uppercase tracking-widest ml-1">ID / Kode</label>
                <Input type="text" className="h-11 px-4 bg-[#F9FAFB] border-[#EAECF0] rounded-lg outline-none text-xs font-bold uppercase" value={form.id} onChange={(e: any) => setForm({...form, id: e.target.value.toUpperCase()})} required />
             </div>
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#667085] uppercase tracking-widest ml-1">Nama Lengkap</label>
                <Input type="text" className="h-11 px-4 bg-[#F9FAFB] border-[#EAECF0] rounded-lg outline-none text-xs font-bold uppercase" value={form.nama} onChange={(e: any) => setForm({...form, nama: e.target.value.toUpperCase()})} required />
             </div>
             {type === 'sd' && (
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-[#667085] uppercase tracking-widest ml-1">Kategori</label>
                   <select className="w-full h-11 px-4 bg-[#F9FAFB] border border-[#EAECF0] rounded-lg outline-none text-xs font-bold appearance-none uppercase" value={form.kategori} onChange={(e) => setForm({...form, kategori: e.target.value})}>
                      <option value="BEBAS">Bebas</option>
                      <option value="EARMARK">Earmark</option>
                   </select>
                </div>
             )}
          </div>
          <Button type="submit" disabled={saving} className="w-full h-11 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-lg font-bold text-[10px] shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest">
             {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
             <span>Simpan Referensi</span>
          </Button>
       </form>
    </Card>
  );
}

function UserManagementForm() {
  const [form, setForm] = useState({ username: '', password: '', role: 'Operator SP2D' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/users/register', form);
      toast.success('User berhasil didaftarkan');
      setForm({ username: '', password: '', role: 'Operator SP2D' });
    } catch (err) { toast.error('Gagal mendaftarkan user'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="p-10 rounded-xl border border-fin-border shadow-sm bg-white space-y-8">
       <div className="flex items-center gap-4 mb-2">
          <div className="w-10 h-10 bg-[#EFF8FF] text-[#175CD3] rounded-lg flex items-center justify-center"><UserPlus size={20} /></div>
          <div>
             <h4 className="text-base font-bold text-fin-text-primary tracking-tight">Registrasi Akun Operator</h4>
             <p className="text-[11px] font-semibold text-[#667085] mt-1.5 uppercase tracking-wider">Penambahan akses sistem baru</p>
          </div>
       </div>
       <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#667085] uppercase tracking-widest ml-1">Username</label>
                <Input type="text" className="h-11 px-4 bg-[#F9FAFB] border-[#EAECF0] rounded-lg outline-none font-bold" value={form.username} onChange={(e: any) => setForm({...form, username: e.target.value})} required />
             </div>
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#667085] uppercase tracking-widest ml-1">Password</label>
                <Input type="password" placeholder="••••••••" className="h-11 px-4 bg-[#F9FAFB] border-[#EAECF0] rounded-lg outline-none font-bold" value={form.password} onChange={(e: any) => setForm({...form, password: e.target.value})} required />
             </div>
          </div>
          <div className="space-y-1.5">
             <label className="text-[10px] font-bold text-[#667085] uppercase tracking-widest ml-1">Level Akses (Role)</label>
             <select className="w-full h-11 px-4 bg-[#F9FAFB] border border-[#EAECF0] rounded-lg outline-none font-bold text-fin-text-primary text-xs appearance-none uppercase" value={form.role} onChange={(e) => setForm({...form, role: e.target.value})}>
                <option value="Operator SP2D">Operator SP2D (Pengeluaran)</option>
                <option value="Operator Penerimaan">Operator Penerimaan (Kas Masuk)</option>
                <option value="admin">Administrator (Full Access)</option>
             </select>
          </div>
          <Button type="submit" disabled={saving} className="w-full h-14 bg-[#175CD3] hover:bg-[#155EEF] text-white rounded-lg font-bold text-xs shadow-lg shadow-blue-900/10 flex items-center justify-center gap-3 active:scale-95 uppercase tracking-widest">
             {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
             <span>Daftarkan Pengguna</span>
          </Button>
       </form>
    </Card>
  );
}

function DataCard({ title, desc, icon, color }: any) {
  return (
    <Card className="p-10 rounded-xl border border-fin-border shadow-sm bg-white flex flex-col items-center text-center space-y-6 group hover:border-[#2E90FA] transition-all cursor-pointer">
       <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center transition-all group-hover:scale-110", color === 'indigo' ? "bg-[#EFF8FF] text-[#175CD3]" : "bg-[#ECFDF3] text-[#027A48]")}>
          {icon}
       </div>
       <div>
          <h4 className="text-sm font-bold text-fin-text-primary mb-2 uppercase tracking-wider">{title}</h4>
          <p className="text-xs font-medium text-[#667085] max-w-[200px] leading-relaxed">{desc}</p>
       </div>
       <Button className={cn("w-full h-11 rounded-lg font-bold text-[10px] transition-all uppercase tracking-widest", color === 'indigo' ? "bg-ds-primary hover:bg-ds-primary-hover text-white" : "bg-[#027A48] hover:bg-[#05603A] text-white")}>
          Eksekusi Sekarang
       </Button>
    </Card>
  );
}
