# bare_node: Node-RED + Piper TTS + Baresip + PostgreSQL Stack

Bu proje; Node-RED (IVR Orkestrasyonu, Piper TTS, FFmpeg), Baresip (SIP Engine) ve PostgreSQL (Çağrı ve Kuyruk Veritabanı) bileşenlerini 3 bağımsız container'da bir araya getiren **Cross-Platform (Linux & macOS)** otomatik arama ve IVR platformudur.

## Klasör Yapısı (3-Container Stateless Mimarisi)

- **`./config/`**: Servislerin konfigürasyon dosyaları.
  - `config/baresip/`: Baresip `config` ve `accounts` dosyaları (`ctrl_tcp` port: 5555).
  - `config/nodered/`: Node-RED `settings.js` dosyası.
  - `config/postgres/`: `init.sql` ilk veritabanı şeması ve verileri.
- **`./data/`**: Runtime sırasında oluşan veriler.
  - `data/nodered/`: Node-RED akışları (`flows.json`) ve eklentileri.
  - `data/postgres/`: PostgreSQL veritabanı dosyaları.
  - `data/piper/`: Piper ONNX ses modelleri (`.onnx`).
  - `data/media/`: Üretilen `.wav` ses dosyaları (Node-RED, Piper ve Baresip ortak kullanır).
- **`./build/`**: Özel Docker imaj derleme dosyaları.
  - `build/nodered/`: Node-RED + Piper TTS + FFmpeg birleşik imaj dosyası.
  - `build/baresip/`: Baresip imaj dosyası.

## Başlatma

Container'ları başlatmak için:

```bash
docker compose up -d --build
```

Erişim Portları:
- **Node-RED UI**: http://localhost:1880 (Kullanıcı: `admin`, Şifre: `password123`)
- **Piper TTS API**: http://localhost:5005/api/tts (Container içi: `http://127.0.0.1:5000/api/tts`)
- **Baresip ctrl_tcp**: `localhost:5555`
- **PostgreSQL**: `localhost:5432` (Kullanıcı: `ivr_user`, Şifre: `ivr_password_123`, DB: `bare_ivr`)

## Örnek Akışlar

Node-RED paneli içerisinde 3 hazır akış mevcuttur:
1. **1. Metni Medyaya Çevir (TTS):** Piper TTS API ile metinden ses üretir.
2. **2. TTS + FFmpeg Formatlama:** Metni sese çevirip FFmpeg ile 8kHz Mono PCM telekom formatına dönüştürür.
3. **3. TTS + FFmpeg + Baresip IVR:** Ses sentezleme, formatlama ve Baresip üzerinden numara arama yapıp ses dinletir.
