$env:PYTHvONUNBUFFERED = "1";uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
docker-compose up -d backend