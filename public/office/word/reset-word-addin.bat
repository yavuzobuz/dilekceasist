@echo off
chcp 65001 >nul
title DilekceAsist AI - Word Eklentisi Sifirlama

echo.
echo ==============================================
echo   DilekceAsist AI - Word Eklentisi Sifirlama
echo ==============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi.
    pause
    exit /b 1
)

echo [1/6] Word kapatiliyor...
taskkill /F /IM WINWORD.EXE >nul 2>&1
timeout /t 2 >nul

echo [2/6] Office onbellek klasorleri temizleniyor...
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\" rmdir /S /Q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\" >nul 2>&1
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\WebServiceCache\" rmdir /S /Q "%LOCALAPPDATA%\Microsoft\Office\16.0\WebServiceCache\" >nul 2>&1

echo [3/6] Guncel manifest indiriliyor...
if exist "%TEMP%\dilekceasist" rmdir /S /Q "%TEMP%\dilekceasist" >nul 2>&1
mkdir "%TEMP%\dilekceasist"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://dilekceasist.vercel.app/manifest.xml' -OutFile '%TEMP%\dilekceasist\manifest.xml'"

if not exist "%TEMP%\dilekceasist\manifest.xml" (
    echo [HATA] Manifest indirilemedi.
    pause
    exit /b 1
)

echo [4/6] Eski debug ve sideload kayitlari kaldiriliyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command "npx --yes office-addin-dev-settings debugging '%TEMP%\dilekceasist\manifest.xml' --disable" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "npx --yes office-addin-dev-settings unregister '%TEMP%\dilekceasist\manifest.xml'" >nul 2>&1

echo [5/6] Eklenti yeniden yukleniyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command "npx --yes office-addin-dev-settings sideload '%TEMP%\dilekceasist\manifest.xml' -a Word"

echo [6/6] Tamamlandi.
echo.
echo Word'u yeniden acip Eklentilerim listesinden DilekceAsist'i acin.
echo Hata devam ederse Office hesabindan cikis-giris yapin ve bu scripti tekrar calistirin.
echo.
pause
