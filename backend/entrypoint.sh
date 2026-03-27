#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

# Aktif olan modu yazdır
echo "Starting Backend..."
echo "DEV_MODE is set to: $DEV_MODE"

if [ "$DEV_MODE" = "true" ]; then
    echo "Running in DEVELOPMENT mode (with hot-reload)..."
    # Geliştirme modu: Kod değiştikçe sunucu yeniden başlar (Hot Reload)
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "Running in PRODUCTION mode (with Gunicorn workers)..."
    # Prodüksiyon modu: Gunicorn yapılandırmasına göre çoklu worker çalışır
    # -c gunicorn.conf.py: Ayarları dosyadan oku
    # -k uvicorn.workers.UvicornWorker: Uvicorn'un hızlı asenkron worker sınıfını kullan
    exec gunicorn -c gunicorn.conf.py app.main:app
fi
