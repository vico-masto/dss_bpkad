'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Lock as LockIcon, 
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  ShieldAlert as AlertIcon,
  CheckCircle2
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/patterns/form-field';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';


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

      setLoading(false);
      setIsRedirecting(true);
      
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);

    } catch (err: any) {
      setError(err.response?.data?.message || 'Kredensial tidak valid');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-fin-page flex overflow-hidden font-sans">
      {/* SUCCESS TRANSITION OVERLAY */}
      <AnimatePresence>
        {isRedirecting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-fin-page flex flex-col items-center justify-center text-fin-text-primary"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="flex flex-col items-center text-center px-4"
            >
              <div className="mb-6 relative">
                 <motion.div 
                   initial={{ scale: 0.8, opacity: 0.5 }}
                   animate={{ scale: 1.6, opacity: 0 }}
                   transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
                   className="absolute inset-0 bg-fin-income/20 rounded-full"
                 />
                 <div className="relative z-10 bg-fin-income-bg border border-fin-income/20 p-5 rounded-full shadow-sm text-fin-income-text">
                    <CheckCircle2 size={44} className="text-fin-income" />
                 </div>
              </div>
              <h2 className="text-xl font-bold tracking-tight mb-1">Akses Terverifikasi</h2>
              <p className="text-xs text-fin-text-secondary tracking-wide">Mempersiapkan dasbor finansial Anda...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isRedirecting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
            transition={{ duration: 0.4 }}
            className="w-full flex"
          >
            {/* LEFT BRANDING PANEL - PREMIUM SLATE (HIDDEN ON MOBILE) */}
            <section className="hidden lg:flex lg:w-[55%] xl:w-[58%] bg-gradient-to-br from-slate-900 via-[#0a0f1d] to-[#101828] text-white flex-col justify-between p-12 relative overflow-hidden border-r border-white/5">
              {/* Very Subtle Decorative Glows */}
              <div className="absolute inset-0 opacity-25 pointer-events-none z-0">
                <motion.div 
                  animate={{ 
                    x: [0, 30, 0], 
                    y: [0, -20, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 15, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  className="absolute -top-[20%] -left-[20%] w-[80%] h-[80%] rounded-full bg-blue-500/10 blur-[120px]" 
                />
                <motion.div 
                  animate={{ 
                    x: [0, -30, 0], 
                    y: [0, 20, 0],
                    scale: [1, 1.2, 1]
                  }}
                  transition={{ 
                    duration: 20, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[100px]" 
                />
              </div>

              {/* Aru Map Layer (Minimalist Painting Background without dot) */}
              <div className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.35] z-0 mix-blend-screen">
                <Image src="/aru-map-minimalist-nodot.png" alt="Map of Aru Minimalist" fill className="object-cover object-center" priority />
              </div>
              
              {/* Dobo Text Overlay & Location Marker */}
              <div className="absolute top-[44%] left-[35%] z-10 pointer-events-none flex flex-col items-center">
                 <div className="w-1.5 h-1.5 bg-white rounded-full mb-1.5 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] opacity-90"></div>
                 <div className="text-[10px] font-extrabold tracking-[0.3em] text-white/80 uppercase drop-shadow-md ml-1">DOBO</div>
              </div>

              {/* Animated Cendrawasih Bird Layer (Realistic, Solid) */}
              <motion.div 
                animate={{ 
                  y: [0, -25, 0],
                  x: [0, 10, 0],
                  rotate: [-3, 3, -3]
                }}
                transition={{ 
                  duration: 6.5, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="absolute top-[5%] right-[-5%] w-[450px] h-[450px] pointer-events-none z-50 select-none drop-shadow-2xl"
              >
                <Image src="/cendrawasih-transparent.png" alt="Cendrawasih Bird" fill className="object-contain" priority />
              </motion.div>

              {/* Top Branding Section */}
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="relative z-10 flex items-center gap-3"
              >
                <img src="/logo-aru.png" alt="Logo Kab. Kepulauan Aru" className="h-12 w-auto object-contain" />
                <div className="h-8 w-px bg-white/15" />
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Pemerintah Kabupaten</p>
                  <p className="text-xs font-black text-white tracking-wide uppercase leading-tight mt-1">Kepulauan Aru</p>
                </div>
              </motion.div>

              {/* Middle Title & Description */}
              <div className="relative z-10 my-auto py-12">
                <motion.span 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-slate-300 mb-6"
                >
                  Portal Pengawasan Eksekutif
                </motion.span>
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                  className="text-4xl font-extrabold tracking-tight text-white leading-tight"
                >
                  Decision Support <br />
                  System <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">BPKAD</span>
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.7 }}
                  className="mt-4 text-xs leading-relaxed text-slate-400 max-w-[320px]"
                >
                  Sistem intelijen finansial eksekutif terpadu untuk monitoring kas daerah, pengelolaan BKU, dan akurasi rekonsiliasi kas secara real-time.
                </motion.p>
              </div>

              {/* Bottom Footer Credit */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="relative z-10 flex items-center justify-between text-[10px] text-slate-500 font-bold tracking-wider uppercase border-t border-white/5 pt-6"
              >
                <span>Secure SSL Protocol</span>
                <span>ARU v2.0</span>
              </motion.div>
            </section>

            {/* RIGHT PANEL - CLEAN FORM CARD */}
            <section className="w-full lg:w-[45%] xl:w-[42%] flex items-center justify-center p-6 sm:p-12 md:p-16">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="w-full max-w-[420px] bg-fin-surface border border-fin-border rounded-xl shadow-[0_4px_30px_rgba(16,24,40,0.03)] p-8 sm:p-10"
              >
                {/* Mobile-Only Emblem */}
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="flex lg:hidden items-center justify-center gap-2 mb-8"
                >
                  <img src="/logo-aru.png" alt="Logo Kab. Kepulauan Aru" className="h-10 w-auto object-contain" />
                  <div className="h-6 w-px bg-fin-border" />
                  <p className="text-xs font-black text-fin-text-primary uppercase tracking-wider">DSS BPKAD</p>
                </motion.div>

                {/* Form Title */}
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="mb-8 text-center lg:text-left"
                >
                  <h2 className="text-2xl font-bold tracking-tight text-fin-text-primary">Masuk ke Sistem</h2>
                  <p className="mt-2 text-xs text-fin-text-secondary leading-relaxed">Silakan masuk dengan kredensial terdaftar untuk mengelola audit kas daerah.</p>
                </motion.div>

                {/* Error Banner */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 rounded-lg border border-fin-expense/20 bg-fin-expense-bg p-3.5 text-xs font-semibold text-fin-expense-text flex items-center gap-2.5"
                  >
                    <AlertIcon className="size-4 shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {/* Login Form */}
                <form onSubmit={handleLogin} className="space-y-5">
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
                    <FormField label="Hak Akses" required>
                      <Select value={role} onValueChange={(val) => setRole(val || 'admin')}>
                        <SelectTrigger className="w-full h-input">
                          <SelectValue placeholder="Pilih Hak Akses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrator (Audit Level)</SelectItem>
                          <SelectItem value="Operator SP2D">Operator Pengeluaran</SelectItem>
                          <SelectItem value="Operator Penerimaan">Operator Penerimaan</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.5 }}>
                    <FormField label="Username" required>
                      <Input 
                        type="text" 
                        placeholder="Masukkan username Anda" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)} 
                        required 
                      />
                    </FormField>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.6 }}>
                    <FormField label="Kata Sandi" required>
                      <div className="relative">
                        <Input 
                          type={showPassword ? "text" : "password"} 
                          placeholder="••••••••" 
                          value={password} 
                          onChange={(e) => setPassword(e.target.value)} 
                          className="pr-10" 
                          required 
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowPassword(!showPassword)} 
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-fin-text-muted hover:text-fin-text-primary transition-colors"
                        >
                          {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </button>
                      </div>
                    </FormField>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className="flex items-center justify-between pt-1"
                  >
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={rememberMe} 
                        onChange={(e) => setRememberMe(e.target.checked)} 
                        className="size-4 rounded border-fin-border text-ds-accent focus:ring-ds-focus-ring/25 cursor-pointer" 
                      />
                      <span className="text-xs font-semibold text-fin-text-secondary hover:text-fin-text-primary transition-colors">Ingat Identitas</span>
                    </label>
                    <button 
                      type="button" 
                      className="text-xs font-bold text-ds-accent hover:text-ds-accent-hover transition-colors"
                    >
                      Bantuan?
                    </button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button 
                      type="submit" 
                      variant="primary" 
                      className="w-full h-btn-md mt-6 text-xs uppercase tracking-wider font-bold"
                      loading={loading}
                    >
                      Masuk Sistem
                    </Button>
                  </motion.div>
                </form>

                {/* Bottom Footer Credit */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.9 }}
                  className="mt-8 text-center text-[9px] font-bold text-fin-text-muted/60 uppercase tracking-widest leading-none"
                >
                  © Vico Masbaitubun
                </motion.div>
              </motion.div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
