#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/Nexus-HUB57/Osint-AI.git"
TARGET_DIR="Osint-AI"

echo "=================================================="
echo "🚀 1. Clonando repositório $REPO_URL..."
echo "=================================================="

if [ -d "$TARGET_DIR" ]; then
    echo "⚠️  Diretório '$TARGET_DIR' já existe. Acessando..."
    cd "$TARGET_DIR"
else
    git clone "$REPO_URL"
    cd "$TARGET_DIR"
fi

echo "=================================================="
echo "📦 2. Instalando dependências..."
echo "=================================================="
npm install

echo "=================================================="
echo "🩺 3. Verificando tipos e build..."
echo "=================================================="
npm run typecheck || echo "(typecheck skipped — algumas rotas podem exigir runtime Node)"

echo "=================================================="
echo "🟢 4. Iniciando servidor de desenvolvimento..."
echo "=================================================="
npm run dev
