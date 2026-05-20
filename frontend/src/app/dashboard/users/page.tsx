'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  User, 
  Lock, 
  ShieldCheck, 
  UserPlus, 
  Trash2, 
  Key, 
  Loader2, 
  ShieldAlert,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn } from "@/lib/utils";
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  
  const { data: users = [], isLoading, mutate } = useSWR('/auth/users', fetcher);
  
  // States for Self Password Change
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // States for New User
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'Operator Penerimaan'
  });
  const [isAddingUser, setIsAddingUser] = useState(false);

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

  // Reset Password Dialog State
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetData, setResetData] = useState({ id: '', username: '', password: '' });

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    try {
      await api.post('/auth/change-password', {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword
      });
      toast.success('Password Anda berhasil diperbarui');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal mengubah password');
    }
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) {
      toast.error('Username dan Password wajib diisi');
      return;
    }
    try {
      await api.post('/auth/register', newUser);
      toast.success(`User ${newUser.username} berhasil dibuat`);
      setNewUser({ username: '', password: '', role: 'Operator Penerimaan' });
      setIsAddingUser(false);
      mutate();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal membuat user');
    }
  };

  const handleDeleteUser = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Hapus Akun Pengguna',
      message: 'Apakah Anda yakin ingin menghapus akun ini secara permanen? Pengguna tidak akan bisa login lagi.',
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isLoading: true }));
        try {
          await api.delete(`/auth/users/${id}`);
          toast.success('User berhasil dihapus');
          mutate();
          setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err: any) {
          toast.error(err.response?.data?.message || 'Gagal menghapus user');
          setConfirmConfig(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const handleResetPassword = async () => {
    if (!resetData.password || resetData.password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    try {
      await api.put(`/auth/users/${resetData.id}/password`, { newPassword: resetData.password });
      toast.success('Password user berhasil direset');
      setIsResetDialogOpen(false);
      setResetData({ id: '', username: '', password: '' });
    } catch (err: any) {
      toast.error('Gagal mereset password');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black text-fin-text-primary tracking-tight uppercase">Keamanan & Akses</h1>
          <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest mt-1">Pengaturan Profil & Manajemen Akun Operator</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => mutate()} className="h-11 w-11 rounded-xl border-fin-border">
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </Button>
          {currentUser?.role === 'admin' && (
            <>
              <Button
                onClick={() => setIsAddingUser(true)}
                className="bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-bold flex items-center gap-2 px-6 h-11 shadow-xl shadow-sm"
              >
                <UserPlus size={18} />
                <span>Tambah User</span>
              </Button>
            <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
              <DialogContent className="sm:max-w-[425px] rounded-xl border-none shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black text-fin-text-primary uppercase tracking-tight">Buat Akun Baru</DialogTitle>
                  <DialogDescription className="text-xs font-medium text-fin-text-muted">
                    Tambahkan operator baru untuk membantu pengelolaan data finansial.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black text-fin-text-primary uppercase tracking-widest">Username</Label>
                    <Input 
                      placeholder="Contoh: op_penerimaan" 
                      className="h-11 rounded-xl bg-fin-page border-fin-border font-bold text-sm" 
                      value={newUser.username}
                      onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black text-fin-text-primary uppercase tracking-widest">Password Awal</Label>
                    <Input 
                      type="password" 
                      placeholder="******" 
                      className="h-11 rounded-xl bg-fin-page border-fin-border font-bold" 
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black text-fin-text-primary uppercase tracking-widest">Role / Hak Akses</Label>
                    <Combobox
                      value={newUser.role}
                      onValueChange={(v) => setNewUser({...newUser, role: v})}
                      placeholder="Pilih Role"
                      className="h-11 rounded-xl"
                      options={[
                        { value: 'Operator Penerimaan', label: 'Operator Penerimaan' },
                        { value: 'Operator SP2D', label: 'Operator Pengeluaran (SP2D)' },
                        { value: 'admin', label: 'Administrator (Full Access)' },
                      ]}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddUser} className="w-full bg-ds-primary hover:bg-ds-primary-hover text-white font-black text-xs uppercase tracking-widest h-12 rounded-xl shadow-lg">
                    Daftarkan Akun
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Profile / Change Password Section */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-8 border-fin-border shadow-sm space-y-6 rounded-xl bg-fin-surface">
            <div className="flex items-center gap-4 pb-4 border-b border-fin-border">
               <div className="w-12 h-12 rounded-xl bg-indigo-50 text-fin-info-text flex items-center justify-center shadow-sm">
                  <Lock size={22} />
               </div>
               <div>
                  <h2 className="text-sm font-black text-fin-text-primary uppercase tracking-tight">Ganti Password</h2>
                  <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Self-Service Security</p>
               </div>
            </div>

            <div className="space-y-5">
               <div className="space-y-2">
                  <Label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Password Lama</Label>
                  <Input 
                    type="password" 
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({...passwordForm, oldPassword: e.target.value})}
                    className="h-11 bg-fin-page border-fin-border rounded-xl font-bold" 
                    placeholder="******" 
                  />
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Password Baru</Label>
                  <Input 
                    type="password" 
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                    className="h-11 bg-fin-page border-fin-border rounded-xl font-bold" 
                    placeholder="******" 
                  />
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Konfirmasi Password</Label>
                  <Input 
                    type="password" 
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                    className="h-11 bg-fin-page border-fin-border rounded-xl font-bold" 
                    placeholder="******" 
                  />
               </div>
               <Button onClick={handleChangePassword} className="w-full bg-ds-primary hover:bg-ds-primary-hover text-white h-12 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-sm">
                 Simpan Perubahan
               </Button>
            </div>
          </Card>
        </div>

        {/* User List Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-fin-border shadow-sm rounded-xl overflow-hidden bg-fin-surface">
            <div className="p-8 bg-fin-surface border-b border-fin-border flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-fin-page text-fin-text-muted flex items-center justify-center border border-fin-border">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-fin-text-primary uppercase tracking-tight">Daftar Operator Sistem</h2>
                    <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Access Control List (ACL)</p>
                  </div>
               </div>
               <Badge variant="outline" className="px-4 py-1.5 rounded-full border-fin-border text-[10px] font-black uppercase text-fin-text-muted bg-fin-page">
                  {users.length} Users Found
               </Badge>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-fin-page text-[10px] font-black text-fin-text-muted uppercase tracking-[0.2em] hover:bg-fin-page border-b-0">
                    <TableHead className="px-8 py-5 h-auto text-fin-text-muted font-black">User & Authority</TableHead>
                    <TableHead className="px-8 py-5 h-auto text-fin-text-muted font-black">Account Created</TableHead>
                    <TableHead className="px-8 py-5 h-auto text-center text-fin-text-muted font-black">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#F2F4F7]">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i} className="border-b-0 hover:bg-transparent">
                        <TableCell colSpan={3} className="px-8 py-4">
                           <div className="h-14 bg-gray-50 animate-pulse rounded-xl" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : users.map((u: any) => (
                    <TableRow key={u.id} className="hover:bg-fin-page/50 transition-colors group border-b-0">
                      <TableCell className="px-8 py-6">
                        <div className="flex items-center gap-4">
                           <div className={cn(
                             "w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs shadow-sm",
                             u.role === 'admin' ? "bg-ds-primary text-white" : "bg-[#ECFDF3] text-[#027A48]"
                           )}>
                             {u.username.substring(0, 2).toUpperCase()}
                           </div>
                           <div>
                              <p className="text-sm font-black text-fin-text-primary flex items-center gap-2 tracking-tight">
                                {u.username}
                                {u.id === currentUser?.id && (
                                  <Badge className="bg-fin-subtle text-fin-text-muted hover:bg-fin-subtle text-[8px] font-black px-1.5 py-0 rounded">CURRENT</Badge>
                                )}
                              </p>
                              <p className="text-[10px] text-fin-text-muted font-bold uppercase tracking-widest mt-0.5">{u.role}</p>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-6">
                         <p className="text-[11px] text-fin-text-muted font-bold uppercase">
                           {new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                         </p>
                      </TableCell>
                      <TableCell className="px-8 py-6 text-center">
                         {currentUser?.role === 'admin' ? (
                           <div className="flex items-center justify-center gap-2">
                             <Button 
                               onClick={() => {
                                 setResetData({ id: u.id, username: u.username, password: '' });
                                 setIsResetDialogOpen(true);
                               }}
                               variant="ghost" 
                               size="icon" 
                               className="h-10 w-10 rounded-xl text-fin-text-muted hover:text-fin-info-text hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all"
                               title="Reset Password"
                             >
                               <Key size={16} />
                             </Button>
                             {u.id !== currentUser?.id && (
                               <Button 
                                 onClick={() => handleDeleteUser(u.id)}
                                 variant="ghost" 
                                 size="icon" 
                                 className="h-10 w-10 rounded-xl text-fin-text-muted hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all"
                                 title="Hapus User"
                               >
                                 <Trash2 size={16} />
                               </Button>
                             )}
                           </div>
                         ) : (
                           <span className="text-[10px] font-black text-slate-200 tracking-widest">—</span>
                         )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-6 bg-fin-page border-fin-border flex items-start gap-4 rounded-xl border-dashed">
             <div className="w-10 h-10 bg-fin-surface rounded-xl flex items-center justify-center text-rose-500 shadow-sm shrink-0 border border-fin-border">
                <ShieldAlert size={20} />
             </div>
             <div className="space-y-1">
                <h4 className="text-[11px] font-black text-fin-text-primary uppercase tracking-widest">Policy Keamanan Akun</h4>
                <p className="text-[10px] font-medium text-fin-text-muted leading-relaxed">
                  Administrator bertanggung jawab penuh atas manajemen hak akses. Setiap operator wajib menjaga kerahasiaan kata sandi. 
                  Sistem mencatat setiap aktivitas login dan modifikasi data finansial untuk audit berkala. 
                  <span className="font-bold text-fin-text-primary"> Password minimal harus mengandung 6 karakter.</span>
                </p>
             </div>
          </Card>
        </div>
      </div>
      <ConfirmDialog 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        isLoading={confirmConfig.isLoading}
      />

      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-fin-text-primary uppercase tracking-tight">Reset Password Account</DialogTitle>
            <DialogDescription className="text-xs font-medium text-fin-text-muted">
              Masukkan kata sandi baru untuk akun operator <strong className="text-fin-text-primary">{resetData.username}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-fin-text-primary uppercase tracking-widest">Password Baru</Label>
              <Input 
                type="password" 
                placeholder="Minimal 6 karakter" 
                className="h-11 rounded-xl bg-fin-page border-fin-border font-bold" 
                value={resetData.password}
                onChange={(e) => setResetData({...resetData, password: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleResetPassword} className="w-full bg-ds-primary hover:bg-ds-primary-hover text-white font-black text-xs uppercase tracking-widest h-12 rounded-xl shadow-lg">
              Konfirmasi Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
