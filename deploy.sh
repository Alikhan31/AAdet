#!/bin/bash
set -e

# ── Adet deploy script ────────────────────────────────────────────────────────
# Usage: ./deploy.sh
# Requires: .env.server file in this directory

if [ ! -f ".env.server" ]; then
  echo "ERROR: .env.server not found."
  echo "Copy .env.server.example → .env.server and fill in values."
  exit 1
fi

# Load env vars (for POSTGRES_PASSWORD etc used by docker-compose.prod.yml)
set -a
source .env.server
set +a

# Copy backend env
cp .env.server habit-tracking-back/.env

echo "▶ Pulling latest code..."
git pull

echo "▶ Building and starting services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "▶ Waiting for API to be healthy..."
sleep 5
docker compose ps

echo ""
echo "✓ Deployed!"
echo "  Frontend : http://$(curl -s ifconfig.me):3000"
echo "  API      : http://$(curl -s ifconfig.me):8001"
echo "  API docs : http://$(curl -s ifconfig.me):8001/docs"
