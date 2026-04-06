@echo off
chcp 65001 >nul
title DilekceAsist AI - Kurulum

echo.
echo ==============================================
echo   DilekceAsist AI - Word Eklentisi Kurulumu
echo ==============================================
echo.
echo Kurulum basliyor, lutfen bekleyin...
echo.

:: Node.js kontrol
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi!
    echo Node.js indirme sayfasi aciliyor...
    start https://nodejs.org/en/download
    echo Node.js kurduktan sonra bu dosyayi tekrar calistirin.
    pause
    exit /b 1
)

:: Word kapat
echo [1/5] Word kapatiliyor...
taskkill /F /IM WINWORD.EXE >nul 2>&1
timeout /t 2 >nul

:: Office onbellek temizle
echo [2/5] Office onbellek temizleniyor...
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\" (
    rmdir /S /Q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\" >nul 2>&1
)

:: Manifest indir
echo [3/5] Manifest indiriliyor...
if not exist "%TEMP%\dilekceasist" mkdir "%TEMP%\dilekceasist"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://dilekceasist.vercel.app/manifest.xml' -OutFile '%TEMP%\dilekceasist\manifest.xml'"

if not exist "%TEMP%\dilekceasist\manifest.xml" (
    echo [HATA] Manifest indirilemedi! Internet baglantinizi kontrol edin.
    pause
    exit /b 1
)

:: Debugging aktif et
echo [4/5] Eski gelistirme kayitlari temizleniyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command "npx --yes office-addin-dev-settings debugging '%TEMP%\dilekceasist\manifest.xml' --disable" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "npx --yes office-addin-dev-settings unregister '%TEMP%\dilekceasist\manifest.xml'" >nul 2>&1

:: Sideload et
echo [5/5] Word'e yukleniyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command "npx --yes office-addin-dev-settings sideload '%TEMP%\dilekceasist\manifest.xml' -a Word"

echo.
echo ==============================================
echo Kurulum tamamlandi.
echo Word acildiginda eklentiyi kullanabilirsiniz.
echo ==============================================
echo.
pause
