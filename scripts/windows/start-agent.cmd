@echo off
rem Start the TikTok agents and append output to logs\agent.log
cd /d "%~dp0\..\.."
if not exist logs mkdir logs
call npm start >> logs\agent.log 2>&1
