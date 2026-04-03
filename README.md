# Syncra Community Server Build

## English

### What is this project?
Syncra is a full-stack community platform inspired by modern real-time chat apps. It includes:

- A FastAPI backend (REST + WebSocket)
- A Next.js frontend (App Router + Tailwind)
- PostgreSQL for persistent data
- Redis for realtime support and caching
- Docker-based local development setup

The project lets users create servers, channels, and communities with moderation and collaboration tools.

### What does this repository include?

- frontend/: Next.js 15 client application with App Router, route groups, server/channel pages, auth pages, and reusable UI components
- backend/: FastAPI service with versioned REST endpoints, WebSocket endpoints, DB models, schemas, and core security/config modules
- docker-compose.yml: Multi-service local stack (frontend, backend, PostgreSQL, Redis)
- static/uploads: Uploaded media/file storage path
- backend/ddl.sql: Database schema reference file

### Core capabilities

- Account and session flows: Register, login, token-based auth, optional Google auth integration
- Community structure: Servers, categories, text channels, voice channels, and memberships
- Real-time communication: WebSocket-based updates and live chat interaction
- Moderation toolkit: Report flows, member management dialogs, and role-based controls
- Collaboration tools: Poll creation/voting and bot help command support
- Insights and operations: Statistics endpoints/cards and API docs via Swagger

### What is it used for?
You can use this project to build and run a community/chat application with features such as:

- Authentication (email/password and Google support in backend config)
- Server and channel management
- Real-time messaging and WebSocket communication
- Voice room related endpoints
- Invite flows and membership controls
- Polls, reports, moderation, and statistics
- Static upload serving

This repository is suitable for:

- Learning full-stack architecture with FastAPI + Next.js
- Building a Discord-like internal/community communication app
- Extending with custom moderation, bot, or realtime features

### Cloudflare and global delivery

Cloudflare is used as the internet-facing layer to publish the app globally.

- DNS and domain routing: Cloudflare maps domains such as app.syncra.website and api.syncra.website to your origin infrastructure
- Reverse proxy and SSL: Requests are proxied through Cloudflare with HTTPS termination and certificate management
- Security layer: WAF, bot protection, and rate-limiting policies can be applied before requests reach your backend
- Performance edge: Caching and edge optimizations can reduce latency and improve global access

In short: Cloudflare works as the public gateway between users and your frontend/backend services.

---

### How to install and run

### Quick setup summary

1. Install Docker Desktop.
2. Clone this repository.
3. Run `docker compose up --build` in project root.
4. Open frontend on http://localhost:3000.
5. Open API docs on http://localhost:8000/docs.

If you prefer non-Docker setup, follow Option B below.

## Option A: Run with Docker (recommended)

### 1) Prerequisites
- Docker Desktop
- Docker Compose

### 2) Clone and enter project
```bash
git clone <your-repo-url>
cd community-server-build
```

### 3) Start all services
```bash
docker compose up --build
```

This starts:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### 4) Stop services
```bash
docker compose down
```

To remove volumes too:
```bash
docker compose down -v
```

---

## Option B: Run locally without Docker

### 1) Prerequisites
- Node.js 22+
- pnpm
- Python 3.12+
- PostgreSQL 15+
- Redis

### 2) Backend setup
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
. .venv/Scripts/Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env` (example):
```env
DATABASE_URL=postgresql://postgres:admin@localhost:5432/Syncra
SECRET_KEY=replace_with_a_secure_random_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REDIS_URL=redis://localhost:6379/0
GOOGLE_CLIENT_ID=
WEBRTC_STUN_URLS=stun:stun.l.google.com:19302
WEBRTC_TURN_URL=
WEBRTC_TURN_USERNAME=
WEBRTC_TURN_PASSWORD=
```

Run backend:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3) Frontend setup
```bash
cd frontend
pnpm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Run frontend:
```bash
pnpm dev
```

Open: http://localhost:3000

---

### Notes
- The backend auto-creates tables on startup (`Base.metadata.create_all`) and applies some lightweight schema sync operations.
- Uploaded files are served from `static/uploads`.
- In Docker Compose, the frontend environment is set to `NEXT_PUBLIC_API_URL=https://api.syncra.website/api/v1`; for local development, set it to your local backend URL.

---

## Turkce

### Bu proje nedir?
Syncra, gercek zamanli topluluk/sohbet uygulamalari mantigiyla gelistirilmis full-stack bir platformdur. Icerigi:

- FastAPI backend (REST + WebSocket)
- Next.js frontend (App Router + Tailwind)
- Kalici veri icin PostgreSQL
- Realtime ve cache icin Redis
- Docker tabanli gelistirme ortami

Bu proje kullanicilarin sunucu, kanal ve topluluk olusturmasini; iletisim ve yonetim araclarini kullanmasini saglar.

### Bu repo neleri icerir?

- frontend/: Next.js 15 istemci uygulamasi, route gruplari, server/channel sayfalari, auth sayfalari ve tekrar kullanilabilir UI componentleri
- backend/: FastAPI servisi, versioned REST endpointler, WebSocket endpointler, DB modelleri, schemalar ve core security/config modulleri
- docker-compose.yml: Frontend, backend, PostgreSQL ve Redis iceren coklu servis yapisi
- static/uploads: Yuklenen medya/dosyalarin tutuldugu klasor
- backend/ddl.sql: Veritabani sema referans dosyasi

### Temel ozellikler

- Hesap ve oturum akisleri: Kayit, giris, token tabanli kimlik dogrulama, opsiyonel Google auth entegrasyonu
- Topluluk yapisi: Server, kategori, text channel, voice channel ve uyelik yonetimi
- Gercek zamanli iletisim: WebSocket tabanli canli guncellemeler ve mesajlasma
- Moderasyon araci: Rapor akisleri, uye yonetimi ve role dayali kontrol mekanizmalari
- Is birligi araclari: Anket olusturma/oylama ve bot yardim komut destegi
- Izleme ve operasyon: Istatistik endpointleri/kartlari ve Swagger API dokumantasyonu

### Ne ise yarar?
Bu projeyi su senaryolar icin kullanabilirsiniz:

- Kimlik dogrulama (email/sifre ve backend tarafinda Google destegi)
- Sunucu ve kanal yonetimi
- Gercek zamanli mesajlasma ve WebSocket iletisim
- Ses odasi ile ilgili endpointler
- Davet (invite) ve uyelik/rol akislari
- Anket, raporlama, moderasyon ve istatistik ozellikleri
- Statik dosya/yukleme sunumu

Uygun kullanimlar:

- FastAPI + Next.js full-stack mimari ogrenmek
- Discord benzeri bir topluluk/iletisim uygulamasi gelistirmek
- Moderasyon, bot veya realtime ozelliklerini ozellestirerek genisletmek

### Cloudflare ve dunyaya yayinlama

Cloudflare, uygulamayi internete acan ve dunyaya sunan katman olarak kullanilir.

- DNS ve domain yonlendirme: app.syncra.website ve api.syncra.website gibi domainleri origin altyapiniza yonlendirir
- Reverse proxy ve SSL: Trafik Cloudflare uzerinden proxylenir, HTTPS ve sertifika yonetimi saglanir
- Guvenlik katmani: WAF, bot korumasi ve rate-limit kurallari backend'e ulasmadan once uygulanabilir
- Performans avantaji: Cache ve edge optimizasyonlariyla global erisim ve gecikme iyilestirilebilir

Ozetle: Cloudflare, kullanici ile frontend/backend servisleriniz arasindaki public gecit gorevini gorur.

---

### Kurulum ve calistirma

### Hizli kurulum ozeti

1. Docker Desktop kurun.
2. Bu repoyu klonlayin.
3. Proje kokunde `docker compose up --build` calistirin.
4. Frontend icin http://localhost:3000 adresini acin.
5. API dokumani icin http://localhost:8000/docs adresini acin.

Docker kullanmak istemiyorsaniz asagidaki Secenek B adimlarini izleyin.

## Secenek A: Docker ile calistirma (onerilen)

### 1) Gereksinimler
- Docker Desktop
- Docker Compose

### 2) Projeyi klonlayin ve klasore girin
```bash
git clone <repo-adresi>
cd community-server-build
```

### 3) Tum servisleri baslatin
```bash
docker compose up --build
```

Acilan servisler:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Dokumantasyonu (Swagger): http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### 4) Servisleri durdurun
```bash
docker compose down
```

Volume'leri de silmek icin:
```bash
docker compose down -v
```

---

## Secenek B: Docker olmadan lokal calistirma

### 1) Gereksinimler
- Node.js 22+
- pnpm
- Python 3.12+
- PostgreSQL 15+
- Redis

### 2) Backend kurulumu
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
. .venv/Scripts/Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

`backend/.env` dosyasi olusturun (ornek):
```env
DATABASE_URL=postgresql://postgres:admin@localhost:5432/Syncra
SECRET_KEY=guvenli_random_bir_anahtar_ile_degistirin
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REDIS_URL=redis://localhost:6379/0
GOOGLE_CLIENT_ID=
WEBRTC_STUN_URLS=stun:stun.l.google.com:19302
WEBRTC_TURN_URL=
WEBRTC_TURN_USERNAME=
WEBRTC_TURN_PASSWORD=
```

Backend'i calistirin:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3) Frontend kurulumu
```bash
cd frontend
pnpm install
```

`frontend/.env.local` olusturun:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Frontend'i calistirin:
```bash
pnpm dev
```

Acin: http://localhost:3000

---

### Notlar
- Backend baslarken tablolari otomatik olusturur (`Base.metadata.create_all`) ve hafif bir schema senkronizasyonu uygular.
- Yuklenen dosyalar `static/uploads` klasorunden sunulur.
- Docker Compose icinde frontend ortam degiskeni `NEXT_PUBLIC_API_URL=https://api.syncra.website/api/v1` olarak ayarlidir; lokal gelistirme icin bunu local backend adresinize cekin.
