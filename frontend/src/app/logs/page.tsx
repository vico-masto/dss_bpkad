'use client';

import { useState, useEffect } from 'react';
import { History, Search, Loader2, User, Clock, Info, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/dss/logs');
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-700">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[#101828] rounded-xl flex items-center justify-center text-white shadow-lg">
          <History size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#101828] tracking-tight">Audit Log Aktivitas</h1>
          <p className="text-[#667085] font-semibold text-[11px] mt-1 uppercase tracking-wider">Security & Transaction Monitoring Trail</p>
        </div>
      </div>

      <Card className="rounded-xl border border-[#E9ECEF] shadow-sm bg-white overflow-hidden min-h-[600px]">
        <div className="p-6 border-b border-[#F2F4F7] flex justify-between items-center bg-[#F8F9FA]/50">
           <h3 className="text-xs font-bold text-[#101828] uppercase tracking-wider">Kronologi Sistem</h3>
           <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-[#98A2B3] shadow-sm border border-[#EAECF0]">
              <Clock size={16} />
           </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 text-[#98A2B3]">
            <Loader2 className="animate-spin mb-4" size={48} />
            <p className="font-bold text-[10px] uppercase tracking-widest text-center">Sinkronisasi Audit Trail...</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F2F4F7]">
            {logs.length === 0 ? (
              <div className="py-32 text-center text-[#98A2B3] font-bold uppercase tracking-widest text-[10px]">Belum ada aktivitas tercatat.</div>
            ) : (
              logs.map((log: any) => (
                <div key={log.id} className="p-8 hover:bg-[#F8F9FA] transition-all flex items-start gap-6 group relative">
                  <div className="w-12 h-12 rounded-xl bg-[#F9FAFB] border border-[#EAECF0] flex items-center justify-center text-[#98A2B3] group-hover:bg-[#101828] group-hover:text-white group-hover:border-[#101828] transition-all flex-shrink-0 shadow-sm">
                    <History size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                           <Badge className="text-[9px] font-bold px-2 py-0.5 bg-[#101828] text-white rounded-md uppercase tracking-wider border-none">{log.aksi}</Badge>
                           <div className="flex items-center text-[10px] font-bold text-[#98A2B3] uppercase tracking-wider">
                              <Clock size={12} className="mr-1.5" />
                              {format(new Date(log.created_at), 'dd MMM yyyy')} <span className="mx-2 opacity-30">|</span> {format(new Date(log.created_at), 'HH:mm:ss')}
                           </div>
                        </div>
                        <p className="text-[#1D2939] font-bold text-lg tracking-tight mb-3 group-hover:text-[#101828] transition-colors">{log.detail}</p>
                        <div className="flex items-center gap-4">
                           <div className="inline-flex items-center text-[10px] font-bold text-[#475467] bg-[#F9FAFB] px-3 py-1 rounded-lg border border-[#EAECF0] transition-colors">
                              <User size={12} className="mr-2 text-[#2E90FA]" />
                              OPERATOR: {log.user_pelaksana?.toUpperCase()}
                           </div>
                           <div className="flex items-center text-[10px] font-bold text-[#027A48] bg-[#ECFDF3] px-2 py-0.5 rounded-md border border-[#ABEFC6]">
                              <ShieldCheck size={14} className="mr-1.5" />
                              VERIFIED
                           </div>
                        </div>
                      </div>
                      <div className="w-full lg:w-auto pt-4 lg:pt-0 border-t lg:border-none border-[#F2F4F7]">
                         <div className="flex lg:flex-col items-center lg:items-end gap-3 lg:gap-1">
                            <Info size={14} className="text-[#EAECF0]" />
                            <span className="text-[9px] font-bold text-[#D0D5DD] uppercase tracking-tighter tabular-nums">ENTRY #{log.id.toString().padStart(6, '0')}</span>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
