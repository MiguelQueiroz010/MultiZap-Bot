#!/bin/bash

echo "Instalando dependências do Puppeteer/Chromium..."

# Atualiza e instala as bibliotecas necessárias
sudo apt-get update
sudo apt-get install -y \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libxshmfence1 \
    libnss3 \
    libx11-xcb1 \
    libxss1

echo "Dependências instaladas com sucesso!"
