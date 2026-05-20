'use client';

import { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  User, 
  Activity,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { format } from 'date-fns';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Separator } from "@/components/ui/separator";


export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dss/logs');
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-10 pb-20 animate-in fade-in duration-700">
      {/* Executive Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-ds-primary rounded-xl flex items-center justify-center text-white shadow-2xl shadow-slate-900/30 ring-4 ring-slate-900/5">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-fin-text-primary tracking-tight leading-none">Log Aktivitas Sistem</h1>
            <p className="text-fin-text-muted font-medium mt-2 text-[11px]">Audit Trail & Rekaman Keamanan • BPKAD</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-12 px-6 bg-fin-surface border-fin-border rounded-xl font-semibold text-xs hover:bg-fin-page transition-all text-fin-text-muted shadow-sm gap-2">
             <Download size={16} />
             <span>Export Log</span>
          </Button>
          <Button variant="default" size="icon" onClick={fetchLogs} className="h-14 w-14 bg-slate-950 text-white rounded-xl hover:bg-ds-primary transition-all shadow-xl active:scale-95">
            <RefreshCw size={22} className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <Card className="bg-fin-surface p-6 rounded-xl shadow-sm border border-fin-border grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
        <div className="md:col-span-2 space-y-2">
          <label className="text-xs font-semibold text-fin-text-muted ml-2">Cari Aktivitas / User Pelaksana</label>
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-fin-text-muted/40" size={16} />
            <Input 
              type="text" 
              placeholder="Cari nama user atau tindakan..." 
              className="h-12 pl-12 pr-4 bg-fin-page border-fin-border rounded-xl text-sm font-medium text-fin-text-primary focus-visible:ring-indigo-600/5 transition-all" 
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-fin-text-muted ml-2">Tipe Log / Audit</label>
          <Combobox
            value={filters.type}
            onValueChange={(v) => setFilters({...filters, type: v || ''})}
            placeholder="Semua Tipe"
            className="h-12"
            options={[
              { value: 'ALL', label: 'Semua Tipe Aktivitas' },
              { value: 'auth', label: 'Autentikasi (Login/Logout)' },
              { value: 'data', label: 'Mutasi Data (CRUD)' },
              { value: 'security', label: 'Keamanan (System)' },
            ]}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-fin-text-muted ml-2">Periode Audit</label>
          <div className="relative">
            <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-fin-text-muted/40" size={16} />
            <Input type="date" className="h-12 pl-12 pr-4 bg-fin-page border-fin-border rounded-xl text-sm font-medium text-fin-text-primary outline-none focus-visible:ring-indigo-600/5 transition-all" />
          </div>
        </div>
      </Card>

      {/* Logs Table Card */}
      <Card className="bg-fin-surface rounded-xl shadow-sm border border-fin-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-fin-page/50 hover:bg-fin-page/50 border-b border-fin-border">
                <TableHead className="px-10 py-6 text-xs font-semibold text-fin-text-muted">Waktu Kejadian</TableHead>
                <TableHead className="px-10 py-6 text-xs font-semibold text-fin-text-muted">User Pelaksana</TableHead>
                <TableHead className="px-10 py-6 text-xs font-semibold text-fin-text-muted">Aktivitas & Tindakan</TableHead>
                <TableHead className="px-10 py-6 text-xs font-semibold text-fin-text-muted">Modul</TableHead>
                <TableHead className="px-10 py-6 text-xs font-semibold text-fin-text-muted">Status</TableHead>
                <TableHead className="px-10 py-6 text-xs font-semibold text-fin-text-muted text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-40 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-fin-info-text" size={48} />
                      <span className="text-sm font-medium text-fin-text-muted">Mensinkronisasi Audit Trail...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-40 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <AlertCircle className="opacity-10 text-fin-text-muted" size={80} />
                      <span className="text-sm font-medium text-fin-text-muted/40">Belum Ada Rekaman Aktivitas</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-fin-page/30 transition-all duration-300 group border-b border-slate-50">
                    <TableCell className="px-10 py-8">
                       <div className="flex items-center gap-5">
                          <div className="w-10 h-10 bg-fin-page rounded-xl text-fin-text-muted flex items-center justify-center group-hover:bg-ds-primary group-hover:text-white group-hover:shadow-lg group-hover:shadow-ds-primary/20 transition-all duration-500">
                             <Clock size={16} />
                          </div>
                          <div>
                             <p className="text-xs font-semibold text-fin-text-primary">{format(new Date(log.created_at), 'dd MMMM yyyy')}</p>
                             <p className="text-[10px] text-fin-text-muted font-medium mt-1">{format(new Date(log.created_at), 'HH:mm:ss')} WIT</p>
                          </div>
                       </div>
                    </TableCell>
                    <TableCell className="px-10 py-8">
                       <div className="flex items-center gap-5">
                          <div className="w-10 h-10 bg-indigo-50 text-fin-info-text rounded-xl flex items-center justify-center text-[11px] font-bold border border-indigo-100 shadow-sm">
                             {log.user_pelaksana.substring(0, 2)}
                          </div>
                          <div>
                             <p className="text-[11px] font-bold text-fin-text-primary">{log.user_pelaksana}</p>
                             <Badge className="bg-fin-page text-fin-text-muted font-bold text-[9px] border-none px-2 py-0.5 mt-1 rounded-lg">Administrator</Badge>
                          </div>
                       </div>
                    </TableCell>
                    <TableCell className="px-10 py-8">
                       <p className="text-xs font-bold text-fin-text-primary leading-tight">{log.aksi}</p>
                    </TableCell>
                    <TableCell className="px-10 py-8">
                       <Badge variant="outline" className="px-4 py-1.5 bg-fin-page text-fin-text-muted border-fin-border rounded-xl text-[10px] font-bold">System audit</Badge>
                    </TableCell>
                    <TableCell className="px-10 py-8">
                       <div className="flex items-center gap-2 text-emerald-500">
                          <CheckCircle2 size={14} />
                          <span className="text-[10px] font-bold">Operational</span>
                       </div>
                    </TableCell>
                    <TableCell className="px-10 py-8 text-center">
                       <Button variant="ghost" size="icon" className="h-11 w-11 bg-fin-page text-fin-text-muted rounded-xl hover:text-fin-info-text hover:bg-fin-surface hover:shadow-xl transition-all duration-500 active:scale-90">
                         <ExternalLink size={18} />
                       </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
