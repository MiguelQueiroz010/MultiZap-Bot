#!/bin/bash

echo "=== Resolvendo erro de Puppeteer/Chromium ==="
echo ""

echo "1. Atualizando pacotes do sistema..."
sudo apt-get update

echo ""
echo "2. Instalando dependências críticas do Chromium/Puppeteer..."
sudo apt-get install -y \
    libatk-1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libcups2t64 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    libpango-1.0-0 \
    libcairo2 \
    libxshmfence1 \
    libnss3

echo ""
echo "3. Instalando dependências adicionais..."
sudo apt-get install -y \
    ca-certificates \
    fontconfig \
    libffi-dev \
    libfreetype6 \
    libssl-dev \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    libxrender1 \
    xdg-utils \
    fonts-liberation \
    libu2f-udev \
    libvulkan1

echo ""
echo "4. Instalando Google Chrome (binário não-snap)..."
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add - && \
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' && \
sudo apt-get update && \
sudo apt-get install -y google-chrome-stable

echo ""
echo "5. Limpando cache do Puppeteer..."
rm -rf ~/.cache/puppeteer

echo ""
echo "6. Reinstalando dependências npm do projeto..."
cd /workspaces/MultiZap-Bot/zbot
npm install

echo ""
echo "✓ Instalação concluída!"
echo ""
echo "📝 Notas importantes:"
echo "- O app.js já foi configurado para usar Google Chrome em:"
echo "  executablePath: '/usr/bin/google-chrome-stable'"
echo ""
echo "- Para testar, execute:"
echo "  cd /workspaces/MultiZap-Bot/zbot && npm start"
echo ""

