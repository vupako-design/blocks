@echo off
git init -q
git branch -M main
git remote add origin https://github.com/vupako-design/blocks.git 2>nul
git add .
git commit -m "%date% %time:~0,5%"
git push -u origin main --force
pause
