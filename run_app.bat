@echo off
TITLE DSS BPKAD - Launcher
SETLOCAL EnableDelayedExpansion
COLOR 0B

echo ======================================================
echo           DSS BPKAD - APPLICATION LAUNCHER
echo           Backend:  http://localhost:5000
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
echo [3/6] Membersihkan proses Node.js DSS yang masih berjalan...
for /f "tokens=2" %%P in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)
for /f "tokens=2" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)
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
    echo [!] Prisma Generate gagal - DIABAIKAN ^(client sudah ada dari WSL^)
    echo     Ini normal jika DB hanya accessible via Docker network.
)
echo [OK] Backend siap.
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

:: Dapatkan path absolut untuk eksekusi yang stabil
set "BASE_DIR=%~dp0"

:: Bersihkan PORT dari environment agar tidak override .env
set "PORT="

:: Cek apakah Windows Terminal tersedia
where wt >nul 2>&1
if errorlevel 1 goto :open_separate

echo [i]  Membuka Windows Terminal - Backend dan Frontend dalam 1 jendela 2 tab...
wt new-tab --title "DSS-BACKEND [Port 5000]" --startingDirectory "%BASE_DIR%backend" cmd /k "set PORT= && node --max-old-space-size=512 server.js" ; new-tab --title "DSS-FRONTEND [Port 3000]" --startingDirectory "%BASE_DIR%frontend" cmd /k "set PORT=3000 && npx next dev -p 3000"
goto :done_launch

:open_separate
echo [!] Windows Terminal tidak ditemukan, membuka 2 jendela terpisah...
start "DSS-BACKEND  [Port 5000]" cmd /k "cd /d "%BASE_DIR%backend" && title DSS-BACKEND [Port 5000] && set PORT= && node --max-old-space-size=512 server.js"
timeout /t 3 /nobreak >nul
start "DSS-FRONTEND [Port 3000]" cmd /k "cd /d "%BASE_DIR%frontend" && title DSS-FRONTEND [Port 3000] && set PORT=3000 && npx next dev -p 3000"

:done_launch
echo.
echo ======================================================
echo    PROSES INISIASI DILUNCURKAN
echo.
echo    Backend  -^> http://localhost:5000  ^(API^)
echo    Frontend -^> http://localhost:3000  ^(Web UI^)
echo.
echo    [!] Frontend butuh ~60-90 detik untuk siap.
echo        Tunggu sampai muncul "Ready in Xs" di tab Frontend.
echo ======================================================
echo.
pause
