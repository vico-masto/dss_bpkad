const fs = require('fs');
const file = 'd:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/rekon/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add states
const stateHook = '  const [isMatching, setIsMatching] = useState(false);';
const stateContent = `  const [isMatching, setIsMatching] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmCode, setResetConfirmCode] = useState('');
  const [isResetting, setIsResetting] = useState(false);`;
if (!content.includes('showResetModal')) {
    content = content.replace(stateHook, stateContent);
}

// 2. Add handler
const handlerHook = '  const handleMagicMatch = async () => {';
const handlerContent = `  const handleResetRekon = async () => {
    const yearStr = filters.startDate.split('-')[0];
    const expectedCode = \`RESET REKON \${yearStr}\`;
    if (resetConfirmCode !== expectedCode) {
      toast.error('Kode konfirmasi tidak valid.');
      return;
    }
    
    setIsResetting(true);
    try {
      await api.post('/reports/reconciliation/reset-all', {
        year: yearStr,
        code: resetConfirmCode
      });
      toast.success(\`Data rekonsiliasi tahun \${yearStr} berhasil di-reset.\`);
      setShowResetModal(false);
      setResetConfirmCode('');
      mutate();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal mereset rekonsiliasi');
    } finally {
      setIsResetting(false);
    }
  };

  const handleMagicMatch = async () => {`;
if (!content.includes('handleResetRekon')) {
    content = content.replace(handlerHook, handlerContent);
}

// 3. Add Button
const btnHook = `             <Upload size={14} />
             <span>Impor Rekening Koran</span>
          </Button>`;
const btnContent = `             <Upload size={14} />
             <span>Impor Rekening Koran</span>
          </Button>
          <Button 
            onClick={() => {
              setResetConfirmCode('');
              setShowResetModal(true);
            }}
            className="h-9 px-4 bg-white text-rose-600 border border-rose-200 rounded-lg font-bold text-xs hover:bg-rose-50 hover:border-rose-300 transition-all shadow-sm gap-2"
          >
             <AlertTriangle size={14} />
             <span>Reset Rekonsiliasi</span>
          </Button>`;
if (!content.includes('Reset Rekonsiliasi')) {
    content = content.replace(btnHook, btnContent);
}

// 4. Add Modal
const modalHook = '    </div>\n  );\n}';
const modalContent = `
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Reset Semua Rekonsiliasi
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-4 rounded-xl leading-relaxed">
              <strong className="block mb-1 text-sm">Peringatan Kritis!</strong>
              Tindakan ini akan <b>MENGHAPUS SEMUA HASIL KECOCOKAN</b> (baik Manual maupun Magic Match AI) untuk tahun berjalan ({filters.startDate.split('-')[0]}). Semua transaksi akan kembali ke status "BELUM REKON".<br/><br/>
              Tindakan ini bersifat permanen dan tidak dapat dibatalkan.
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">Ketik <b>RESET REKON {filters.startDate.split('-')[0]}</b> untuk melanjutkan</Label>
              <Input 
                value={resetConfirmCode}
                onChange={(e) => setResetConfirmCode(e.target.value)}
                placeholder={\`RESET REKON \${filters.startDate.split('-')[0]}\`}
                className="font-mono text-center text-sm uppercase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetModal(false)} disabled={isResetting}>Batal</Button>
            <Button 
              variant="destructive" 
              onClick={handleResetRekon} 
              disabled={isResetting || resetConfirmCode !== \`RESET REKON \${filters.startDate.split('-')[0]}\`}
              className="gap-2"
            >
              {isResetting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Eksekusi Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}`;
if (!content.includes('open={showResetModal}')) {
    content = content.replace(modalHook, modalContent);
}

fs.writeFileSync(file, content);
console.log('Success frontend update!');
