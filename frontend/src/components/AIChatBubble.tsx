'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, User, Loader2, Sparkles, MessageSquare, Wand2, Zap, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
};

export default function AIChatBubble() {
  const [isVisible, setIsVisible] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'model',
      content: 'Halo, Bro! Saya **Bro Jenius**, asisten audit pribadi Anda. 🤖\n\nAda data **BKU** atau **mutasi bank** yang bikin pusing hari ini? Saya siap bantu analisis dengan cepat dan akurat!'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const suggestions = [
    { label: '🚀 Fast-Track Rekon', prompt: 'Bro, jelasin dong gimana aturan Fast-Track Penerimaan yang baru itu?' },
    { label: '🔎 Anomali Hari Ini', prompt: 'Bro, tolong carikan anomali transaksi terbesar hari ini.' },
    { label: '📊 Status Kas', prompt: 'Bro, bagaimana status saldo kas di seluruh bank saat ini?' },
    { label: '🏦 Rekon SP2D', prompt: 'Tampilkan daftar SP2D yang paling sulit dicocokkan.' },
  ];

  useEffect(() => {
    const checkVisibility = () => {
      const saved = localStorage.getItem('ai_visible');
      setIsVisible(saved !== 'false');
    };
    
    checkVisibility();
    window.addEventListener('ai-visibility-change', checkVisibility);
    return () => window.removeEventListener('ai-visibility-change', checkVisibility);
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    const newMessage: Message = { id: Date.now().toString(), role: 'user', content: userMessage };
    
    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const history = messages.slice(1).map(m => ({ role: m.role, content: m.content }));
      const res = await api.post('/dss/intelligence/chat', { 
        message: userMessage,
        history 
      });
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: res.data.reply 
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: 'Maaf, sepertinya saya sedang kesulitan memproses data. Coba lagi nanti ya.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = async (prompt: string) => {
    if (isLoading) return;
    
    // Use the handleSend logic but for a specific prompt
    const newMessage: Message = { id: Date.now().toString(), role: 'user', content: prompt };
    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const history = messages.slice(1).map(m => ({ role: m.role, content: m.content }));
      const res = await api.post('/dss/intelligence/chat', { 
        message: prompt,
        history 
      });
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: res.data.reply 
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: 'Maaf, sepertinya saya sedang kesulitan memproses data. Coba lagi nanti ya.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Floating Button */}
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <AnimatePresence>
          {!isOpen && (
            <Button
              onClick={() => setIsOpen(true)}
              className="group relative w-16 h-16 rounded-full bg-fin-info overflow-hidden shadow-[0_0_20px_rgba(46,144,250,0.5)] transition-all hover:scale-110 active:scale-95"
            >
              {/* Magic Glow Aura */}
              <div className="absolute inset-0 bg-gradient-to-tr from-fin-info via-fin-surplus to-fin-info animate-spin-slow opacity-80" />
              <div className="absolute inset-1 rounded-full bg-[#0B0F1A] flex items-center justify-center border border-white/10">
                <BrainCircuit size={28} className="text-fin-info animate-pulse group-hover:scale-125 transition-transform" />
              </div>
              
              {/* Orbiting Particles */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-2 border-dashed border-fin-info/30 rounded-full scale-125" 
              />
            </Button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 20, scale: 0.9, filter: 'blur(10px)' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-6 right-6 z-50 w-[400px] h-[650px] max-h-[85vh] bg-[#0B0F1A]/80 backdrop-blur-2xl rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col overflow-hidden"
          >
            {/* Animated Gradient Border */}
            <div className="absolute inset-0 pointer-events-none rounded-xl border-2 border-transparent bg-gradient-to-br from-fin-info/20 via-transparent to-fin-surplus/20 opacity-50" />
            {/* Header */}
            <div className="relative px-6 py-5 bg-gradient-to-r from-fin-subtle/50 to-transparent text-fin-text-primary flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-fin-info rounded-full blur-md opacity-50 animate-pulse" />
                  <div className="relative w-12 h-12 rounded-full bg-[#0B0F1A] border border-fin-info/30 flex items-center justify-center">
                    <Wand2 size={22} className="text-fin-info animate-bounce-slow" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-fin-income border-2 border-[#0B0F1A] shadow-[0_0_10px_rgba(18,183,106,0.5)]" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-fin-info to-fin-surplus">Bro Jenius AI</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Zap size={10} className="text-fin-warning fill-fin-warning animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-fin-info/70">Neural Link Active</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-transparent space-y-6 scrollbar-hide">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  className={cn(
                    "flex gap-4",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-lg",
                    msg.role === 'user' 
                      ? "bg-fin-info text-fin-surface" 
                      : "bg-[#0B0F1A] text-fin-info border border-fin-info/30"
                  )}>
                    {msg.role === 'user' ? <User size={18} /> : <Zap size={18} className="fill-fin-info/20" />}
                  </div>
                  
                  <div className={cn(
                    "px-5 py-4 rounded-xl max-w-[85%] text-sm leading-relaxed relative group",
                    msg.role === 'user' 
                      ? "bg-fin-info text-fin-surface rounded-tr-none shadow-[0_10px_20px_rgba(46,144,250,0.2)]" 
                      : "bg-white/5 backdrop-blur-md text-fin-text-primary border border-white/10 rounded-tl-none shadow-xl"
                  )}>
                    {/* Decorative Corner for Magic Look */}
                    <div className={cn(
                      "absolute top-0 w-2 h-2",
                      msg.role === 'user' ? "right-0 border-t-2 border-r-2 border-white/20" : "left-0 border-t-2 border-l-2 border-fin-info/20"
                    )} />

                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                    ) : (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({node, ...props}) => (
                            <div className="overflow-x-auto my-4 rounded-xl border border-white/10 bg-black/20">
                              <table className="w-full border-collapse text-xs" {...props} />
                            </div>
                          ),
                          thead: ({node, ...props}) => <thead className="bg-white/5 border-b border-white/10" {...props} />,
                          th: ({node, ...props}) => <th className="px-4 py-3 text-left font-black uppercase tracking-widest text-fin-info" {...props} />,
                          td: ({node, ...props}) => <td className="px-4 py-3 border-t border-white/5 text-fin-text-secondary" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc ml-6 my-3 space-y-2" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal ml-6 my-3 space-y-2" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-extrabold text-fin-info" {...props} />,
                          code: ({node, ...props}) => <code className="bg-fin-info/10 px-2 py-1 rounded text-fin-info font-mono border border-fin-info/20" {...props} />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-fin-subtle text-fin-info flex items-center justify-center shrink-0 border border-fin-info/20">
                    <Bot size={14} />
                  </div>
                  <div className="px-5 py-3.5 rounded-xl bg-fin-subtle border border-fin-border rounded-tl-none shadow-sm flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-fin-info rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-fin-info rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-fin-info rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-fin-surface border-t border-fin-border">
              {/* Automatic Suggestions Chips */}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar scroll-smooth">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s.prompt)}
                    disabled={isLoading}
                    className="whitespace-nowrap px-3 py-1.5 bg-fin-subtle border border-fin-info/10 rounded-full text-[11px] font-medium text-fin-info hover:bg-fin-info hover:text-fin-surface transition-all active:scale-95 disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSend} className="relative flex items-center">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tanya Bro Jenius..."
                  className="w-full pr-12 h-12 bg-fin-page border-fin-border rounded-xl text-sm text-fin-text-primary focus-visible:ring-fin-info/20 focus-visible:border-fin-info placeholder:text-fin-text-muted"
                  disabled={isLoading}
                />
                <Button 
                  type="submit" 
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="absolute right-1 w-10 h-10 rounded-lg bg-fin-info hover:opacity-90 text-fin-surface disabled:opacity-50 transition-colors"
                >
                  <Send size={16} className={cn(isLoading ? "opacity-0" : "opacity-100", "absolute transition-opacity")} />
                  {isLoading && <Loader2 size={16} className="animate-spin absolute" />}
                </Button>
              </form>
              <div className="mt-3 text-center">
                <p className="text-[10px] font-medium text-fin-text-muted">
                  AI dapat membuat kesalahan. Harap periksa kembali data penting.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
