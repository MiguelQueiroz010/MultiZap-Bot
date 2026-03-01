#!/usr/bin/env bash
set -euo pipefail

echo "=== Resolvendo erro de Puppeteer/Chromium ==="
echo

# usa sudo quando não é root
SUDO=""
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
fi

echo "1. Atualizando pacotes do sistema..."
${SUDO} apt-get update

echo
echo "2. Instalando dependências críticas do Chromium/Puppeteer..."
${SUDO} apt-get install -y --no-install-recommends \
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
        ca-certificates \
        fontconfig \
        libfreetype6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxext6 \
        libxrender1 \
        xdg-utils \
        fonts-liberation \
        libu2f-udev || true

echo
echo "3. (Opcional) Instalar Google Chrome estável (útil se quiser usar o Chrome do sistema)"
read -p "Deseja instalar google-chrome-stable? [y/N]: " INSTALL_CHROME || true
if [[ "$INSTALL_CHROME" =~ ^[Yy]$ ]]; then
    ${SUDO} wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | ${SUDO} apt-key add -
    ${SUDO} sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
    ${SUDO} apt-get update
    ${SUDO} apt-get install -y --no-install-recommends google-chrome-stable || true
fi

echo
echo "4. Limpando cache do Puppeteer (para forçar re-download se necessário)..."
rm -rf "$HOME/.cache/puppeteer" || true

echo
echo "5. Reinstalando dependências npm do projeto (opcional)"
read -p "Deseja rodar 'npm install' no projeto agora? [y/N]: " RUN_NPM || true
if [[ "$RUN_NPM" =~ ^[Yy]$ ]]; then
    (cd "$(dirname "$0")/.." && npm install)
fi

echo
echo "✓ Instalação concluída!"
echo
echo "📝 Notas importantes:"
echo "- Você pode apontar o Puppeteer para um Chrome/Chromium do sistema usando a variável de ambiente PUPPETEER_EXECUTABLE_PATH ou CHROME_PATH."
echo "  Exemplo: export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser"
echo
echo "- Para testar, execute:" 
echo "  cd /workspaces/MultiZap-Bot/zbot && npm start"
echo

