'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { 
  Layers, Plus, Pencil, Trash2, Save, X, Loader2, Database, FolderTree, Building2, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from '@/components/patterns/page-header';


const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<'opd' | 'jenis' | 'sumber'>('opd');
  
  const { data: opdData, mutate: mutateOpd, isLoading: loadOpd } = useSWR('/admin/opd', fetcher);
  const { data: jenisData, mutate: mutateJenis, isLoading: loadJenis } = useSWR('/admin/jenis', fetcher);
  const { data: sumberData, mutate: mutateSumber, isLoading: loadSumber } = useSWR('/admin/sumber-dana', fetcher);

  const [modalState, setModalState] = useState<{ isOpen: boolean, mode: 'add' | 'edit', data: any }>({ isOpen: false, mode: 'add', data: null });
  const [formData, setFormData] = useState({ id: '', nama: '', kategori: 'BEBAS' });
  const [saving, setSaving] = useState(false);

  // Confirm Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'success' | 'info' | 'question';
    onConfirm: () => void;
    isLoading?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: () => {},
    isLoading: false
  });

  const handleOpenModal = (mode: 'add' | 'edit', item: any = null) => {
    setFormData(item ? { ...item } : { id: '', nama: '', kategori: 'BEBAS' });
    setModalState({ isOpen: true, mode, data: item });
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, mode: 'add', data: null });
    setFormData({ id: '', nama: '', kategori: 'BEBAS' });
  };

  const handleSave = async () => {
    if (!formData.id || !formData.nama) return toast.error('ID dan Nama wajib diisi');
    setSaving(true);
    
    let endpoint = '';
    let mutateFunc: any;
    if (activeTab === 'opd') { endpoint = '/admin/opd'; mutateFunc = mutateOpd; }
    if (activeTab === 'jenis') { endpoint = '/admin/jenis'; mutateFunc = mutateJenis; }
    if (activeTab === 'sumber') { endpoint = '/admin/sumber-dana'; mutateFunc = mutateSumber; }

    try {
      if (modalState.mode === 'add') {
        await api.post(endpoint, formData);
        toast.success('Berhasil Ditambahkan', { description: 'Data referensi baru telah berhasil dicatat.' });
      } else {
        await api.put(`${endpoint}/${encodeURIComponent(modalState.data.id)}`, formData);
        toast.success('Pembaruan Berhasil', { description: 'Data referensi telah berhasil diperbarui.' });
      }
      mutateFunc();
      handleCloseModal();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Terjadi kesalahan saat menyimpan data');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Hapus Data Master',
      message: 'Apakah Anda yakin ingin menghapus data referensi ini? Hal ini mungkin berdampak pada data transaksi terkait.',
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isLoading: true }));
        
        let endpoint = '';
        let mutateFunc: any;
        if (activeTab === 'opd') { endpoint = '/admin/opd'; mutateFunc = mutateOpd; }
        if (activeTab === 'jenis') { endpoint = '/admin/jenis'; mutateFunc = mutateJenis; }
        if (activeTab === 'sumber') { endpoint = '/admin/sumber-dana'; mutateFunc = mutateSumber; }

        try {
          await api.delete(`${endpoint}/${encodeURIComponent(id)}`);
          toast.success('Data Dihapus', { description: 'Data referensi telah dihapus secara permanen.' });
          mutateFunc();
          setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err: any) {
          toast.error(err.response?.data?.message || 'Gagal menghapus data');
          setConfirmConfig(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const renderTable = (data: any[], isLoading: boolean) => {
    if (isLoading) return (
      <div className="flex flex-col items-center justify-center py-40 text-fin-text-muted">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-sm font-medium">Memuat data referensi...</p>
      </div>
    );

    return (
      <div className="overflow-x-auto min-h-[400px]">
        <Table>
          <TableHeader className="bg-fin-page">
            <TableRow className="border-b border-fin-border hover:bg-transparent">
              <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted w-48">ID / Kode</TableHead>
              <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Nama / Deskripsi</TableHead>
              {activeTab === 'sumber' && <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Kategori</TableHead>}
              <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-[#E9ECEF]">
            {data?.map((item: any) => (
              <TableRow key={item.id} className="group hover:bg-fin-page transition-colors">
                <TableCell className="px-6 py-4">
                  <span className="font-mono text-[11px] font-semibold text-fin-info-text bg-fin-info-bg border border-fin-info-text/20 px-2 py-0.5 rounded">
                    {item.id}
                  </span>
                </TableCell>
                <TableCell className="px-6 py-4 text-sm font-semibold text-fin-text-primary">{item.nama}</TableCell>
                {activeTab === 'sumber' && (
                  <TableCell className="px-6 py-4">
                    <Badge className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full border-none",
                      item.kategori === 'BEBAS' ? "bg-[#ECFDF3] text-[#027A48]" : "bg-fin-info-bg text-fin-info-text"
                    )}>
                      {item.kategori === 'BEBAS' ? 'Kas Bebas' : 'Kas Earmark'}
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" onClick={() => handleOpenModal('edit', item)} className="h-8 w-8 text-fin-text-muted hover:text-fin-info-text hover:bg-fin-surface rounded-lg">
                      <Pencil size={14} />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(item.id)} className="h-8 w-8 text-fin-text-muted hover:text-[#F04438] hover:bg-fin-surface rounded-lg">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!data || data.length === 0) && (
              <TableRow>
                <TableCell colSpan={activeTab === 'sumber' ? 4 : 3} className="text-center py-40">
                   <div className="flex flex-col items-center gap-3">
                      <Database size={48} className="text-[#F1F3F5]" />
                      <p className="text-fin-text-muted text-sm font-medium">Tidak ada data tersedia.</p>
                   </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">
      {/* PAGE HEADER */}
      <PageHeader
        title="Master Data"
        description="Pusat referensi dan data dasar sistem"
        icon={<Layers className="size-5" />}
        actions={
          <Button onClick={() => handleOpenModal('add')} className="h-10 px-6 bg-fin-text-primary text-white rounded-lg font-semibold text-xs hover:bg-ds-primary-hover transition-all shadow-sm flex items-center gap-2">
            <Plus size={16} /><span>Tambah Data Baru</span>
          </Button>
        }
      />

      <Card className="rounded-xl border border-fin-border shadow-sm bg-fin-surface overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
          <div className="border-b border-fin-border p-4 bg-fin-page">
            <TabsList className="bg-fin-page rounded-lg p-1 h-10 border border-fin-border">
              <TabsTrigger value="opd" className="px-6 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                <Building2 size={14} /> Daftar OPD
              </TabsTrigger>
              <TabsTrigger value="jenis" className="px-6 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                <FolderTree size={14} /> Jenis Belanja
              </TabsTrigger>
              <TabsTrigger value="sumber" className="px-6 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                <Layers size={14} /> Sumber Dana
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-[500px]">
            {activeTab === 'opd' && renderTable(opdData, loadOpd)}
            {activeTab === 'jenis' && renderTable(jenisData, loadJenis)}
            {activeTab === 'sumber' && renderTable(sumberData, loadSumber)}
          </div>
        </Tabs>
      </Card>

      {/* MODAL FORM */}
      <Dialog open={modalState.isOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-md rounded-xl p-8 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-fin-text-primary">
              {modalState.mode === 'add' ? 'Tambah Data Baru' : 'Edit Data'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-fin-text-muted ml-1">ID / Kode</label>
              <Input 
                className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-semibold focus:border-ds-focus-ring" 
                value={formData.id} 
                onChange={(e) => setFormData({...formData, id: e.target.value})} 
                disabled={modalState.mode === 'edit'}
                placeholder="Contoh: SD-PAD"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-fin-text-muted ml-1">Nama / Deskripsi</label>
              <Input 
                className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-semibold focus:border-ds-focus-ring" 
                value={formData.nama} 
                onChange={(e) => setFormData({...formData, nama: e.target.value})} 
                placeholder="Masukkan nama deskripsi"
              />
            </div>

            {activeTab === 'sumber' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-fin-text-muted ml-1">Kategori Sumber Dana</label>
                <div className="relative">
                  <select 
                    className="w-full h-10 px-4 bg-fin-page border border-fin-border rounded-lg text-sm font-semibold focus:outline-none focus:border-ds-focus-ring appearance-none cursor-pointer"
                    value={formData.kategori}
                    onChange={(e) => setFormData({...formData, kategori: e.target.value})}
                  >
                    <option value="BEBAS">Kas Bebas</option>
                    <option value="EARMARK">Kas Earmark</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-fin-text-muted pointer-events-none" size={16} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col gap-3 sm:flex-col">
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="w-full h-11 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-lg font-semibold text-sm transition-all shadow-lg shadow-[#101828]/20"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : 'Simpan Perubahan'}
            </Button>
            <Button 
              variant="ghost" 
              onClick={handleCloseModal}
              className="w-full h-11 text-fin-text-muted hover:bg-fin-page rounded-lg font-semibold text-sm transition-all"
            >
              Batalkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        isLoading={confirmConfig.isLoading}
      />
    </div>
  );
}
