@echo off
rem Amphicos 3D Platform, offline edition. Opens the platform full screen in Microsoft Edge or Google Chrome.
rem No internet and no installation needed. Keep this file next to index.html.
setlocal
set "APP=%~dp0index.html"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --new-window --start-fullscreen "%APP%"
) else (
  start "" msedge --new-window --start-fullscreen "%APP%"
)
endlocal
