#!/usr/bin/env bash
set -euo pipefail

echo "=== Resolvendo erro de Puppeteer/Chromium ==="

echo
# usa sudo quando não é root
SUDO=""
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
fi

export DEBIAN_FRONTEND=noninteractive

echo "1. Atualizando pacotes do sistema..."

# Se o repositório do yarn estiver configurado, desativamos temporariamente
# para evitar falhas de GPG enquanto o script instala somente dependências
# de Chromium. Reativação é responsabilidade do usuário.
YARN_LIST="/etc/apt/sources.list.d/yarn.list"
if [ -f "$YARN_LIST" ]; then
    echo "Desativando repositório yarn temporariamente ($YARN_LIST)..."
    ${SUDO} mv "$YARN_LIST" "${YARN_LIST}.disabled" || true
fi

# corrigir potencial erro de chave GPG do yarn; a chave é adicionada por via das
# instruções de instalação oficiais mas o erro pode continuar por causa do uso
# de subkey ou apt-key deprecado. Mesmo que falhe, não interrompemos.
YARN_KEY="62D54FD4003F6525"
if ! ${SUDO} apt-key list 2>/dev/null | grep -q "$YARN_KEY"; then
    echo "Tentando adicionar chave GPG do repositório yarn..."
    if command -v curl >/dev/null 2>&1; then
        ${SUDO} bash -c "curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - || true"
    fi
    # e também tente importar explicitamente pelo ID caso o arquivo anterior não
    # inclua a subkey desejada
    ${SUDO} apt-key adv --keyserver keyserver.ubuntu.com --recv-keys $YARN_KEY || true
fi

# Atualiza pacotes; erros são ignorados para que o script continue rodando.
${SUDO} apt-get update -yq || true

echo
echo "2. Detectando nomes de pacote libatk disponíveis e instalando dependências críticas do Chromium/Puppeteer..."

# Detecta qual nome de pacote libatk está disponível no repositório
AVAILABLE_LIBATK=""
for name in libatk1.0-0 libatk-1.0-0; do
    if ${SUDO} apt-cache show "$name" >/dev/null 2>&1; then
        AVAILABLE_LIBATK="$name"
        break
    fi
done

if [ -z "$AVAILABLE_LIBATK" ]; then
    echo "Aviso: nenhum pacote libatk encontrado no apt; iremos tentar usar o nome mais comum (libatk1.0-0)."
    AVAILABLE_LIBATK="libatk1.0-0"
fi

PACKAGES=(
    "$AVAILABLE_LIBATK"
    libatk-bridge2.0-0
    libcups2
    libdrm2
    libxkbcommon0
    libxcomposite1
    libxdamage1
    libxrandr2
    libgbm1
    libasound2
    libpango-1.0-0
    libcairo2
    libxshmfence1
    libnss3
    ca-certificates
    fontconfig
    libfreetype6
    libx11-6
    libx11-xcb1
    libxcb1
    libxext6
    libxrender1
    xdg-utils
    fonts-liberation
    libu2f-udev
)

echo "Instalando pacotes: ${PACKAGES[*]}"
${SUDO} apt-get install -y --no-install-recommends "${PACKAGES[@]}" || true

echo
echo "3. (OBRIGATÓRIO) Instalar Google Chrome estável (útil se quiser usar o Chrome do sistema)"
read -p "Deseja instalar google-chrome-stable? [y/N]: " INSTALL_CHROME || true
if [[ "$INSTALL_CHROME" =~ ^[Yy]$ ]]; then
    if command -v apt-key >/dev/null 2>&1; then
        ${SUDO} wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | ${SUDO} apt-key add -
        ${SUDO} sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
    else
        ${SUDO} wget -qO /usr/share/keyrings/google-chrome-archive-keyring.gpg https://dl-ssl.google.com/linux/linux_signing_key.pub
        ${SUDO} sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-archive-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'
    fi
    ${SUDO} apt-get update -yq
    ${SUDO} apt-get install -y --no-install-recommends google-chrome-stable || true
fi

echo
echo "4. Limpando cache do Puppeteer (para forçar re-download se necessário)..."
rm -rf "$HOME/.cache/puppeteer" || true

echo
echo "5. Instalando dependências npm do projeto"
npm install

echo
echo "✓ Instalação concluída!"
echo
echo "📝 Notas importantes:"
echo "- Você pode apontar o Puppeteer para um Chrome/Chromium do sistema usando a variável de ambiente PUPPETEER_EXECUTABLE_PATH ou CHROME_PATH."
echo "  Exemplo: export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser"
echo
echo "- Para testar, execute:" 
echo "  npm start"
echo
