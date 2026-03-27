# Bölüm 1: Discord Nedir?

Discord, toplulukların bir araya gelip iletişim kurmasını sağlayan, IP üzerinden ses (VoIP), anlık mesajlaşma ve dijital dağıtım platformudur.

  - Rol tabanlı izin yönetimi (RBAC).
  - Zengin medya desteği (Görsel, Video, Dosya paylaşımı).
  

# Bölüm 2: Syncra Projesi Teknik Analiz Raporu

- **Proje Adı:** Syncra (Community Server Platform)
- **Amaç:** Kullanıcıların kendi topluluklarını oluşturabileceği, gerçek zamanlı, modern ve ölçeklenebilir bir iletişim platformu geliştirmek.

## 🛠️ 1. Kullanılan Teknolojiler (Tech Stack)

| Katman | Teknoloji / Kütüphane | Sürüm / Detay |
| :--- | :--- | :--- |
| **Frontend** | Next.js | v15 (App Router Mimarisi) |
| **Dil** | TypeScript | Statik tip güvenliği için |
| **UI Framework** | React | v19 |
| **Styling** | Tailwind CSS | Modern CSS Utility sınıflandırması |
| **Component Lib** | Shadcn/UI (Radix) | Erişilebilir UI bileşenleri |
| **Backend** | Python & FastAPI | Yüksek performanslı asenkron API |
| **Veritabanı** | PostgreSQL | v15 (İlişkisel Veri Modeli) |
| **Önbellek/PubSub** | Redis | Anlık mesaj dağıtımı ve Socket yönetimi |
| **Altyapı** | Docker & Compose | Konteynerizasyon ve Orkestrasyon |
| **Reverse Proxy** | Cloudflare Tunnel | Güvenli dışa açılım (HTTPS) |

## 🏗️ 2. Mimari Yapı (Architecture)

Proje, **Monolithic Microservices-Ready** (Monolitik ama Mikroservise Hazır) bir mimari ile tasarlanmıştır. Tüm servisler Docker üzerinde izole konteynerler olarak çalışır.



### B. Backend Mimarisi (Server-Side)

- **Asenkron Yapı:** Python `async/await` yapısı ve FastAPI sayesinde yüksek eşzamanlılık (concurrency) kapasitesine sahiptir.
- **Katmanlı Mimari (Layered Architecture):**
  - **Router:** HTTP isteklerini karşılar (`/api/v1/servers`).
  - **Controller/Service:** İş mantığını (Business Logic) yürütür.
  - **CRUD/Repository:** Veritabanı işlemlerini (SQLAlchemy) yönetir.
  - **Schema (Pydantic):** Veri doğrulama ve tip güvenliğini sağlar.

### D. Gerçek Zamanlı İletişim (Real-time)

- **WebSockets:** Anlık mesajlaşma, "yazıyor" bilgisi ve durum güncellemeleri için kullanılır.
- **Redis Pub/Sub:** Backend birden fazla worker (işçi) ile çalıştığında, soketlerin birbiriyle haberleşmesini sağlayan "Merkezi Haberleşme Hattı"dır.
- **WebRTC (P2P Mesh):** Sesli görüşme için tarayıcılar arası (Peer-to-Peer) doğrudan bağlantı kurar. STUN sunucusu ile NAT arkasındaki cihazların birbirini bulması sağlanır.

## 🌟 3. Projenin Sunduğu Özellikler (Features)

- **Sunucu & Kanal Yönetimi:**
  - Kullanıcılar birden fazla sunucu oluşturabilir.
  - Sunucular içinde Kategoriler ve bu kategorilere bağlı Metin/Ses kanalları açılabilir.
  - Kanal bazlı izinler (sadece admin görebilir vb.) yönetilebilir.
- **Gelişmiş Üyelik Sistemi:**
  - Benzersiz Davet Linki (Invite Code) sistemi.
  - Rol Yönetimi (Guest, Member, Moderator, Admin).
  - Kullanıcı Yasaklama (Ban) ve Atma (Kick) mekanizmaları.
- **Modern Sohbet Deneyimi:**
  - Gerçek zamanlı mesajlaşma (sayfa yenilemeden).
  - Dosya ve Resim yükleme desteği.
  - Emoji seçici ve zengin metin desteği.
  - Mesaj düzenleme ve silme (gerçek zamanlı yansır).
- **Sesli ve Görüntülü İletişim:**
  - Kullanıcılar sesli kanallara tek tıkla katılabilir.
  - Mikrofon açma/kapama ve durum göstergeleri (Konuşuyor yeşil çemberi).
- **Responsive (Mobil Uyumlu) Tasarım:**
  - Hem masaüstü hem de mobil cihazlarda tam uyumlu arayüz.
  - Mobilde "Drawer" (çekmece) menüler ve dokunmatik dostu kontroller.
- **Güvenlik:**
  - JWT (JSON Web Token) tabanlı kimlik doğrulama.
  - CORS ve Middleware korumaları.
  - Şifrelenmiş veri saklama.