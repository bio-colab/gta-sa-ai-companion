@echo off
title Initialize Git Repository - GTA SA AI Companion
echo ====================================================================
echo Initializing Git Repository for GTA San Andreas AI Companion
echo ====================================================================
git init
git add .
git commit -m "Initial Release: Embodied Autonomous AI NPC Companion for GTA San Andreas"
git branch -M main
echo.
echo ====================================================================
echo Repository initialized successfully!
echo.
echo Next step: To push to GitHub, run:
echo   git remote add origin https://github.com/bio-colab/gta-sa-ai-companion.git
echo   git push -u origin main
echo ====================================================================
pause
