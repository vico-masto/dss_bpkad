import os
import sys
import subprocess

# Pastikan fpdf2 terinstal
try:
    from fpdf import FPDF
except ImportError:
    print("fpdf2 tidak ditemukan. Mencoba menginstal...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf2"])
    from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        # Helvetica bold 15
        self.set_font('Helvetica', 'B', 15)
        # Warna biru gelap
        self.set_text_color(16, 24, 40)
        # Title
        self.cell(0, 10, 'DSS BPKAD KABUPATEN KEPULAUAN ARU', 0, new_x="LMARGIN", new_y="NEXT", align='C')
        # Subtitle
        self.set_font('Helvetica', 'I', 9)
        self.set_text_color(102, 112, 133)
        self.cell(0, 5, 'Panduan Kerja Multi-Agent (Antigravity & Claude Code)', 0, new_x="LMARGIN", new_y="NEXT", align='C')
        # Line break
        self.ln(10)
        # Garis pembatas
        self.set_draw_color(208, 213, 221)
        self.line(20, 32, 190, 32)

    def footer(self):
        # Position at 1.5 cm from bottom
        self.set_y(-15)
        # Arial italic 8
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(152, 162, 179)
        # Page number
        self.cell(0, 10, f'Halaman {self.page_no()}/{{nb}}', 0, 0, 'C')

def create_guide_pdf():
    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    pdf.set_auto_page_break(auto=True, margin=20)
    
    # --- Judul Dokumen ---
    pdf.set_font('Helvetica', 'B', 18)
    pdf.set_text_color(16, 24, 40)
    pdf.cell(0, 15, 'PANDUAN KOLABORASI MULTI-AGENT', 0, new_x="LMARGIN", new_y="NEXT", align='L')
    
    # --- Box Peran ---
    pdf.set_fill_color(248, 249, 250)
    pdf.set_draw_color(229, 231, 235)
    pdf.rect(20, 50, 170, 22, 'DF')
    pdf.set_xy(23, 52)
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(16, 24, 40)
    pdf.cell(0, 5, 'PERAN AGEN:', 0, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font('Helvetica', '', 9.5)
    pdf.set_x(23)
    pdf.cell(0, 5, '- Antigravity (Gemini 3 Flash): Plan Master, Architect, & Quality Assurance Manager', 0, new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(23)
    pdf.cell(0, 5, '- Claude Code: Code Executor, Builder, & Local Test Runner', 0, new_x="LMARGIN", new_y="NEXT")
    
    pdf.ln(10)
    
    # --- Bagian I ---
    pdf.set_font('Helvetica', 'B', 13)
    pdf.set_text_color(16, 24, 40)
    pdf.cell(0, 8, 'I. TUGAS DAN TANGGUNG JAWAB', 0, new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.ln(2)
    
    # Antigravity
    pdf.set_font('Helvetica', 'B', 11)
    pdf.set_text_color(23, 92, 211)  # Biru
    pdf.cell(0, 6, 'Plan Master & Manager (Antigravity)', 0, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(51, 51, 51)
    
    tugas_manager = [
        "1. Analisis Dampak: Menganalisis efek perubahan terhadap database (Prisma), Express backend, dan Next.js frontend.",
        "2. Pembuatan Blueprint: Menulis rencana implementasi komprehensif di 'implementation_plan.md'.",
        "3. Manajemen Task: Menyusun checklist detail di 'task.md' untuk mencegah lompatan logika.",
        "4. Audit Kualitas (QA): Memverifikasi hasil kerja, mencocokkan aturan kritis, dan menyusun 'walkthrough.md'."
    ]
    for t in tugas_manager:
        pdf.multi_cell(0, 5.5, t, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        
    pdf.ln(4)
    
    # Claude Code
    pdf.set_font('Helvetica', 'B', 11)
    pdf.set_text_color(23, 92, 211)
    pdf.cell(0, 6, 'Code Executor (Claude Code)', 0, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(51, 51, 51)
    
    tugas_executor = [
        "1. Eksekusi Presisi: Membaca 'implementation_plan.md' dan menyelesaikan checklist 'task.md' langkah demi langkah.",
        "2. Refactoring & Debugging: Menyelesaikan konflik tipe TypeScript, error ESLint, dan optimasi internal.",
        "3. Local Testing: Menjalankan skrip pengetesan lokal dan melaporkan hasil eksekusi terminal kepada Manager."
    ]
    for t in tugas_executor:
        pdf.multi_cell(0, 5.5, t, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        
    pdf.ln(4)
    
    # --- Bagian II ---
    pdf.set_font('Helvetica', 'B', 13)
    pdf.set_text_color(16, 24, 40)
    pdf.cell(0, 8, 'II. ALUR KERJA (WORKFLOW) KOLABORATIF', 0, new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.ln(2)
    
    workflow_steps = [
        ("Fase 1: Perencanaan & Penugasan (Oleh: Antigravity)",
         "Sebelum perubahan kode dilakukan, Antigravity menulis berkas 'implementation_plan.md' (desain arsitektur) dan 'task.md' (checklist langkah mikro)."),
        ("Fase 2: Penyerahan ke Eksekutor (Oleh: Pengguna)",
         "Pengguna memerintahkan Claude Code: \"Claude, baca 'implementation_plan.md' dan eksekusi checklist di 'task.md' langkah demi langkah. Update task.md jika selesai.\""),
        ("Fase 3: Eksekusi & Pembaruan Progress (Oleh: Claude Code)",
         "Claude Code menyelesaikan task satu per satu, memperbarui status dari [ ] -> [/] -> [x] di 'task.md', serta menangani error kompilasi secara mandiri."),
        ("Fase 4: Verifikasi & Kontrol Kualitas (Oleh: Antigravity)",
         "Setelah Claude selesai, Manager (Antigravity) mengaudit kode terhadap aturan emas (C.1 - C.4), menyusun 'walkthrough.md', dan memperbarui berkas memori proyek.")
    ]
    
    for title, desc in workflow_steps:
        pdf.set_font('Helvetica', 'B', 10.5)
        pdf.set_text_color(16, 24, 40)
        pdf.multi_cell(0, 5.5, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(0, 5, desc, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        
    pdf.ln(4)
    
    # --- Bagian III ---
    pdf.set_font('Helvetica', 'B', 13)
    pdf.set_text_color(16, 24, 40)
    pdf.cell(0, 8, 'III. ATURAN EMAS KOLABORASI (GOLDEN RULES)', 0, new_x="LMARGIN", new_y="NEXT", align='L')
    pdf.ln(2)
    
    rules = [
        ("1. No Ghost Code (Tanpa Kode Bayangan)",
         "Claude Code dilarang keras menambahkan fitur atau file di luar rencana yang disetujui di 'implementation_plan.md' tanpa konfirmasi dari Manager."),
        ("2. Strict Linting & Type-Safety",
         "Claude Code wajib menjamin kode bersih dari error tipe TypeScript, warning ESLint, dan error Express backend sebelum diserahkan kembali."),
        ("3. Sinkronisasi Memori",
         "Setiap perubahan struktur database atau rute baru wajib dilaporkan ke Antigravity untuk diperbarui di berkas utama 'DSS_BPKAD_Memory.md'.")
    ]
    
    for title, desc in rules:
        pdf.set_font('Helvetica', 'B', 10.5)
        pdf.set_text_color(180, 50, 50)  # Warna merah kecoklatan untuk aturan
        pdf.multi_cell(0, 5.5, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(51, 51, 51)
        pdf.multi_cell(0, 5, desc, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    output_path = r"D:\Antigravity\DSS_BPKAD\PANDUAN_KOLABORASI_MULTI_AGENT.pdf"
    pdf.output(output_path)
    print(f"PDF Berhasil dibuat di: {output_path}")

if __name__ == "__main__":
    create_guide_pdf()
