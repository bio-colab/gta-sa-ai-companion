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
echo Next step: Create a new repository on GitHub (without README), then run:
echo   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
echo   git push -u origin main
echo ====================================================================
pause
