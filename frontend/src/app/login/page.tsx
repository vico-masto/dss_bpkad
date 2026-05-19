'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  User as UserIcon, 
  Lock as LockIcon, 
  ArrowRight as ArrowRightIcon, 
  ShieldCheck as ShieldIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  ChevronRight as ChevronIcon,
  Building2 as BuildingIcon,
  Activity,
  CheckCircle2
} from 'lucide-react';
import api from '@/lib/api';
import JoyfulLoader from '@/components/JoyfulLoader';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUsername = localStorage.getItem('remembered_username');
      if (savedUsername) {
        setUsername(savedUsername);
        setRememberMe(true);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/auth/login', { username, password, role });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      if (rememberMe) {
        localStorage.setItem('remembered_username', username);
      } else {
        localStorage.removeItem('remembered_username');
      }

      // Smooth Professional Handoff
      setLoading(false);
      setIsRedirecting(true);
      
      setTimeout(() => {
        router.push('/dashboard');
      }, 1200);

    } catch (err: any) {
      setError(err.response?.data?.message || 'Kredensial tidak valid');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#030712] text-white overflow-hidden font-sans">
      {/* 1. CYBERNETIC BACKGROUND ELEMENTS */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Deep Indigo Glow */}
        <motion.div
          className="absolute -top-60 -left-60 h-[800px] w-[800px] rounded-full bg-indigo-500/10 blur-[160px]"
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3] 
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Emerald Accent Glow */}
        <motion.div
          className="absolute top-1/2 -right-60 h-[600px] w-[600px] rounded-full bg-emerald-500/5 blur-[140px]"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2] 
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.05] mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#030712]/50 to-[#030712]" />
      </div>

      {loading && (
        <div className="fixed inset-0 z-50 bg-[#030712]/80 backdrop-blur-xl flex items-center justify-center">
          <JoyfulLoader size="lg" text="Membangun Sesi Audit Aman..." />
        </div>
      )}

      {/* Success Transition Overlay */}
      <AnimatePresence>
        {isRedirecting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#030712] flex flex-col items-center justify-center text-white"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', damping: 12 }}
              className="flex flex-col items-center"
            >
              <div className="mb-8 relative">
                 <motion.div 
                   initial={{ scale: 0 }}
                   animate={{ scale: 2, opacity: 0 }}
                   transition={{ duration: 1.5, repeat: Infinity }}
                   className="absolute inset-0 bg-indigo-500/50 rounded-full"
                 />
                 <div className="relative z-10 bg-indigo-600 p-6 rounded-[24px] shadow-2xl shadow-indigo-500/40">
                    <CheckCircle2 size={56} className="text-white" />
                 </div>
              </div>
              <h2 className="text-3xl font-black tracking-tighter mb-2 uppercase">Akses Terverifikasi</h2>
              <p className="text-indigo-400 font-bold text-xs tracking-[0.4em] uppercase">Memasuki Ruang Kendali Audit...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isRedirecting && (
          <motion.div 
            exit={{ opacity: 0, scale: 0.98, filter: 'blur(20px)' }}
            transition={{ duration: 0.6 }}
            className="relative z-10 mx-auto flex min-h-screen max-w-[1440px] items-center justify-center p-4 lg:p-8"
          >
        <div className="grid w-full max-w-[1100px] overflow-hidden rounded-[40px] border border-white/10 bg-[#111827]/40 shadow-[0_0_80px_rgba(0,0,0,0.5)] backdrop-blur-3xl lg:grid-cols-10">
          
          {/* Left Branding Section (Midnight Cybernetic) */}
          <section className="hidden lg:flex flex-col justify-between bg-[#111827] p-12 lg:col-span-4 relative overflow-hidden border-r border-white/10">
            {/* Animated Patterns */}
            <div className="absolute inset-0 z-0">
               <motion.div 
                 animate={{ 
                   rotate: 360
                 }}
                 transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                 className="absolute -top-1/2 -right-1/2 w-full h-full border-[1px] border-indigo-500/10 rounded-full" 
               />
               <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-emerald-500/5" />
            </div>
            
            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-14 inline-flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-indigo-500 to-indigo-900 shadow-2xl shadow-indigo-500/20 text-white ring-1 ring-white/10"
              >
                <ShieldIcon size={32} />
              </motion.div>
              <h1 className="text-6xl font-black tracking-tighter text-white leading-none">
                DSS <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">BPKAD</span>
              </h1>
              <p className="mt-8 text-sm leading-relaxed text-gray-400 font-medium max-w-[280px] tracking-tight">
                Sistem Intelijen Finansial Eksekutif & Pengawasan Audit Digital Terintegrasi.
              </p>
            </div>

            {/* Secure Session Card */}
            <div className="relative z-10 my-10">
               <div className="bg-[#030712]/60 backdrop-blur-2xl border border-white/10 rounded-[28px] p-5 shadow-2xl ring-1 ring-white/5">
                  <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Live Protocol</span>
                     </div>
                     <span className="text-[9px] font-bold text-gray-500">ARU-NODE v2.0</span>
                  </div>
                  
                  <div className="space-y-4">
                     <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                           <Activity size={18} />
                        </div>
                        <div>
                           <p className="text-[11px] font-black text-white">Audit Engine Ready</p>
                           <p className="text-[10px] text-gray-400">Memory Synced (14-Day Window)</p>
                        </div>
                     </div>
                     <div className="h-px bg-white/10 w-full opacity-50" />
                     <div className="flex items-center justify-between">
                        <div>
                           <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Chief Architect</p>
                           <p className="text-[11px] font-black text-white">ViGit MaSrah</p>
                        </div>
                        <div className="px-2 py-1 bg-indigo-500/20 rounded-md border border-indigo-500/30">
                           <p className="text-[7px] font-black text-indigo-400 uppercase">Verified</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            <div className="relative z-10 flex items-center gap-6">
                <div className="flex -space-x-3">
                   {[1,2,3].map(i => (
                     <div key={i} className="h-8 w-8 rounded-full border-2 border-[#111827] bg-[#030712] flex items-center justify-center overflow-hidden">
                        <div className="h-full w-full bg-gradient-to-br from-indigo-500/20 to-indigo-500/40" />
                     </div>
                   ))}
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Authorized Personnel Only</p>
            </div>
          </section>

          {/* Right Login Section (Midnight Surface) */}
          <section className="flex flex-col justify-center p-8 sm:p-16 lg:col-span-6 bg-[#111827]/20">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="mx-auto w-full max-w-[380px]"
            >
              <div className="mb-12 text-center lg:text-left">
                <h2 className="text-4xl font-black tracking-tighter text-white">Login Sistem</h2>
                <p className="mt-3 text-sm font-medium text-gray-400">Otorisasi Sesi Audit Finansial BPKAD.</p>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-8 rounded-[20px] border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-xs font-bold text-rose-400 flex items-center gap-4"
                >
                  <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleLogin} className="space-y-7">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Hak Akses</label>
                  <div className="relative group">
                     <select 
                       value={role} 
                       onChange={(e) => setRole(e.target.value)} 
                       className="h-14 w-full appearance-none rounded-[18px] border border-white/10 bg-[#030712]/40 px-6 text-sm font-bold text-white outline-none transition-all group-hover:border-indigo-500/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5"
                     >
                       <option value="admin">Administrator (Audit Level)</option>
                       <option value="Operator SP2D">Operator Pengeluaran</option>
                       <option value="Operator Penerimaan">Operator Penerimaan</option>
                     </select>
                     <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"><ChevronIcon size={18} className="rotate-90" /></div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Username</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors"><UserIcon size={18} /></div>
                    <input 
                      type="text" 
                      placeholder="Username Audit" 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)} 
                      className="h-14 w-full rounded-[18px] border border-white/10 bg-[#030712]/40 pl-14 pr-6 text-sm font-bold text-white outline-none transition-all group-hover:border-indigo-500/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 placeholder:text-gray-600" 
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Kata Sandi</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors"><LockIcon size={18} /></div>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="••••••••" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      className="h-14 w-full rounded-[18px] border border-white/10 bg-[#030712]/40 pl-14 pr-14 text-sm font-bold text-white outline-none transition-all group-hover:border-indigo-500/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 placeholder:text-gray-600" 
                      required 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute inset-y-0 right-0 pr-5 flex items-center text-gray-500 hover:text-indigo-400 transition-colors"
                    >
                      {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                       <input 
                         type="checkbox" 
                         checked={rememberMe} 
                         onChange={(e) => setRememberMe(e.target.checked)} 
                         className="h-5 w-5 rounded-md border-white/10 bg-[#030712] text-indigo-500 focus:ring-indigo-500/20 transition-all cursor-pointer" 
                       />
                    </div>
                    <span className="text-[11px] font-bold text-gray-400 group-hover:text-white transition-colors">Ingat Identitas</span>
                  </label>
                  <button type="button" className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600 hover:text-indigo-400 transition-colors">Bantuan?</button>
                </div>

                <button 
                  type="submit" 
                  disabled={loading} 
                  className="group mt-4 flex h-15 w-full items-center justify-center gap-4 rounded-[20px] bg-indigo-600 text-xs font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(79,70,229,0.3)] active:scale-[0.98] disabled:opacity-70"
                >
                  {loading ? (
                    <JoyfulLoader size="sm" text="" />
                  ) : (
                    <>
                      Masuk Sistem 
                      <ArrowRightIcon size={18} className="transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-14 flex items-center justify-center gap-3 grayscale opacity-30">
                 <BuildingIcon size={16} className="text-gray-500" />
                 <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                   BPKAD KAB. KEPULAUAN ARU
                 </p>
              </div>
            </motion.div>
          </section>
        </div>
      </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
