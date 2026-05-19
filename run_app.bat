@echo off
TITLE DSS BPKAD - Launcher
SETLOCAL EnableDelayedExpansion
COLOR 0B

echo ======================================================
echo           DSS BPKAD - APPLICATION LAUNCHER
echo           Backend: http://localhost:5000
echo           Frontend: http://localhost:3000
echo ======================================================
echo.

:: 1. Cek Folder
echo [1/6] Memeriksa struktur folder...
if not exist "backend\" (
    echo [X] ERROR: Folder 'backend' tidak ditemukan!
    echo     Pastikan file bat ini ada di root folder proyek.
    pause & exit /b
)
if not exist "frontend\" (
    echo [X] ERROR: Folder 'frontend' tidak ditemukan!
    pause & exit /b
)
echo [OK] Folder ditemukan.

:: 2. Cek RAM yang tersedia
echo [2/6] Memeriksa kondisi sistem...
for /f "skip=1 tokens=2 delims=," %%A in ('wmic OS get FreePhysicalMemory /format:csv') do (
    set /a FREE_MB=%%A/1024
)
echo [i]  RAM tersedia: !FREE_MB! MB
if !FREE_MB! LSS 500 (
    echo [!] PERINGATAN: RAM tersedia sangat rendah ^(!FREE_MB! MB^).
    echo     Tutup aplikasi lain sebelum melanjutkan untuk menghindari error.
    echo     Tekan CTRL+C untuk batal, atau...
    pause
)

:: 3. Pembersihan Sesi Sebelumnya
echo [3/6] Membersihkan proses Node.js yang masih berjalan...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] Pembersihan selesai.

:: 4. Persiapan Backend
echo [4/6] Menyiapkan Backend...
cd backend
if not exist "node_modules\" (
    echo [!] node_modules backend hilang, menginstall dependensi...
    call npm install
    if !ERRORLEVEL! NEQ 0 (
        echo [X] npm install gagal.
        pause & cd .. & exit /b
    )
)
echo [i]  Menjalankan Prisma Generate...
call npx prisma generate >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [X] Prisma Generate gagal. Cek koneksi Database atau file .env
    pause & cd .. & exit /b
)
echo [OK] Backend siap. ^(DB pool: 3 koneksi^)
cd ..

:: 5. Persiapan Frontend
echo [5/6] Memeriksa Frontend...
cd frontend
if not exist "node_modules\" (
    echo [!] node_modules frontend hilang, menginstall dependensi...
    call npm install
    if !ERRORLEVEL! NEQ 0 (
        echo [X] npm install frontend gagal.
        pause & cd .. & exit /b
    )
)
echo [OK] Frontend siap.
cd ..

:: 6. Jalankan Kedua Server
echo [6/6] Menjalankan server...
echo.

start "DSS-BACKEND  [Port 5000]" cmd /k "cd backend && node --max-old-space-size=512 server.js"
timeout /t 2 /nobreak >nul
start "DSS-FRONTEND [Port 3000]" cmd /k "cd frontend && npm run dev"

echo.
echo ======================================================
echo    KEDUA SERVER SEDANG BERJALAN
echo    Backend  -> http://localhost:5000
echo    Frontend -> http://localhost:3000
echo.
echo    Tutup jendela terminal DSS-BACKEND / DSS-FRONTEND
echo    untuk menghentikan server.
echo ======================================================
echo.
pause
