#!/bin/bash

echo "Instalando dependências do Puppeteer/Chromium..."

# Atualiza e instala as bibliotecas necessárias
sudo apt-get update
sudo apt-get install -y \
    libatk-1.0-0 \
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
    libnss3

echo "Dependências instaladas com sucesso!"
