# Node-RED & Baresip IVR Stack: Mimari, Deneyimler ve Teknik Özet

Bu doküman; **Node-RED**, **Piper TTS (Nöral Ses Sentezleme)**, **FFmpeg (Telekom Ses Formatlama)**, **Baresip (SIP Engine)** ve **PostgreSQL** bileşenlerini içeren cross-platform IVR platformunun geliştirilme sürecini, mimari kararlarını ve edinilen tüm rafine teknik tecrübeleri içermektedir.

---

## 1. 📌 Proje Amacı ve Genel Bakış

Projenin temel amacı; yüksek performanslı, ölçeklenebilir ve **saf Python (Python 3)** mantığıyla orkestre edilen otomatik arama ve IVR (Interactive Voice Response) sistemi oluşturmaktır.

### Temel Yetenekler:
1. **Nöral TTS (Piper):** Türkçe (**Eren** - `tr_TR-eren-medium`) ve İngilizce (**Amy** - `en_US-amy-medium`) ses modelleri ile yüksek kaliteli metinden sese dönüştürme.
2. **Telekom Ses Formatlama (FFmpeg):** Piper çıktısı olan 22050Hz seslerin telekom/SIP hatlarıyla %100 uyumlu **8000Hz, Mono, 16-bit PCM (`pcm_s16le`)** formatına dönüştürülmesi.
3. **SIP Arama Engine (Baresip):** `ctrl_tcp` (Port 5555) üzerinden komuta edilen, numara arama, ses yayınlama ve DTMF (tuşlama) algılama altyapısı.
4. **Saf Python Orkestrasyonu (Node-RED):** Düğümler arasında JavaScript yerine `node-red-contrib-python-function` kullanılarak tamamen Python sözdizimi ile veri işleme.

---

## 2. 🏗️ Mimari Evrim ve Alınan Kararlar

### İlk Durum (4 Konteynerli Mimari):
- Node-RED, Baresip, PostgreSQL ve Piper TTS ayrı 4 container olarak kurgulanmıştı.
- **Karşılaşılan Sorunlar:**
  - Konteynerler arası ağ gecikmesi.
  - Piper TTS için varsayılan Alpine Linux tabanlı imajlarda `piper-phonemize` ve `onnxruntime` kütüphanelerinin C-extension binary tekerleklerinin (`musl` libc uyumsuzluğu nedeniyle) source'tan derlenmeye çalışılması ve derleme sürelerinin aşırı uzaması.

### Nihai Durum (3 Konteynerli Tekilleştirilmiş Mimari):
Kaynak kullanımını düşürmek ve derleme süreçlerini hızlandırmak amacıyla sistem **3 bağımsız konteynere** indirgenmiştir:

```mermaid
graph TD
    Client[Kullanıcı / Web REST API] -->|1880 HTTP| NodeRED[bare_nodered<br/>Node-RED + FFmpeg + Piper TTS API]
    NodeRED -->|127.0.0.1:5000 internal| Piper[Piper TTS FastAPI Daemon]
    NodeRED -->|5432 SQL| Postgres[bare_postgres<br/>PostgreSQL 15]
    NodeRED -->|5555 TCP| Baresip[bare_baresip<br/>Baresip SIP UA - Host Network]
    Baresip -->|5060 UDP/TCP| Trunk[Cisco VG2 / Webex Calling / IP PBX]
```

1. **`bare_nodered` (Birleşik Node-RED & TTS & FFmpeg):**
   - **Base Image:** `python:3.10-slim` (Debian Bookworm)
   - Node-RED (Port: `1880`) + Piper TTS FastAPI Daemon (Port: `5000` internal, `5005` external) + FFmpeg 7.x.
2. **`bare_baresip` (SIP Motoru):**
   - Debian Bookworm tabanlı Baresip SIP UA (`network_mode: host`, Control: `5555` TCP).
3. **`bare_postgres` (Veritabanı):**
   - PostgreSQL 15 Alpine (Port: `5432`, `init.sql` ile otomatik şema kurulumu).

---

## 3. 💡 Edinilen Kritik Teknik Deneyimler & "Gotchas"

### 1. `python:3.10-slim` (Debian/glibc) vs Alpine (`musl`) Seçimi
- **Deneyim:** C/C++ bağımlılığı olan Python paketleri (`onnxruntime`, `piper-phonemize`, `pydantic-core`) Alpine Linux (`musl` libc) üzerinde `manylinux` wheel paketlerini kullanamaz ve Rust/Cargo veya C++ ile source'tan derlemeye kalkışır.
- **Çözüm:** Taban imaj olarak `python:3.10-slim` (Debian Bookworm / `glibc`) kullanıldığında PyPI üzerindeki hazır `manylinux_2_28_aarch64` ve `x86_64` tekerlekleri direkt indirilir. Derleme süresi 15 dakikadan **5 saniyeye** düşmüştür.

### 2. Baresip `network_mode: host` ve Cisco Dial-Peer `Via:` Eşleşmesi
- **Deneyim:** Baresip Docker köprü ağında (`172.18.0.x`) çalışırken SIP paketlerindeki `Via:` başlığına iç IP basıyordu. Cisco VG2 santrali `incoming uri via 101` (`host ipv4:192.168.85.3`) kuralını kontrol ederken iç IP uyuşmadığı için çağrı varsayılan `dial-peer 0`'a düşüyordu.
- **Çözüm:** `docker-compose.yml` içerisinde Baresip için `network_mode: host` ayarlandı. `Via:` ve `Contact:` başlıkları doğrudan fiziksel sunucu IP'sini (`192.168.85.3`) taşır hale geldi ve Cisco VG2'nin `dial-peer 102` kuralı %100 eşleşti.

### 3. Node-RED Exec Düğümü Çıkış Bacakları ve Paralel Çağrı Önleme
- **Deneyim:** Node-RED `Exec` düğümü varsayılan 3 çıktı bacağına (`stdout`, `stderr`, `rc`) sahiptir. 3 bacağın tümü Baresip `/dial` düğümüne bağlandığında FFmpeg dönüşümü tamamlanınca aynı milisaniyede 3 ayrı arama emri tetikleniyor ve Webex tarafında 3 ekran belirmesine yol açıyordu.
- **Çözüm:** `Exec` düğümünün 2. ve 3. bacak bağlantıları kaldırılıp sadece `stdout` (1. bacak) bağlandı. Böylece tek tetiklemede kesinlikle tek 1 çağrı çıkması sağlandı.

### 4. Cisco Gateway Registrar'sız Mod (`regint=0`)
- **Deneyim:** Cisco IOS Gateway / CUBE (`IOS-17.3.6`) üzerinde dahili SIP Registrar bulunmadığında Baresip'in periyodik `REGISTER` isteklerine `503 Service Unavailable` dönülmekteydi.
- **Çözüm:** `config/baresip/accounts` içerisine `;regint=0` eklendi (`<sip:6666@192.168.91.122>;regint=0;audio_codecs=PCMA,PCMU`). Otomatik kayıt kapatılarak doğrudan SIP INVITE moduna geçildi.

### 5. Çağrı Cevaplandığında Kapanma Hatası ve `aufile` Ses Akışı
- **Deneyim:** Arama yanıtlandığında (`200 OK`) Baresip `start_source failed (null.null): No such file or directory` hatası veriyor ve aktif ses kaynağı bulamadığı için hemen `BYE` göndererek oturumu kapatıyordu.
- **Çözüm:** `config/baresip/config` içerisinde ses kaynağı `audio_source aufile,/tmp/media/flow3_telecom.wav` olarak tanımlandı. Arama yanıtlandığı an 8kHz PCM ses dosyası RTP akışına bağlanarak telefona net bir şekilde dinletildi.

---

## 4. 🧪 Senaryo ve Test Doğrulamaları

| Senaryo | Açıklama | Girdi | Çıktı / Format | Doğrulama Durumu |
| :--- | :--- | :--- | :--- | :---: |
| **Senaryo 1** | Metni Medyaya Çevir (TTS) | JSON (`text`, `model`) | `/tmp/media/flow1_test.wav` (132 KB) | **%100 Başarılı** |
| **Senaryo 2** | TTS + FFmpeg Telekom Formatlama | Ham WAV Dosyası | `/tmp/media/flow2_telecom.wav` (68 KB)<br/>`8000Hz, Mono, pcm_s16le, 128 kbps` | **%100 Başarılı** |
| **Senaryo 3** | Full IVR Arama & Ses Oynatma | Telefon No + Metin | FFmpeg Formatlama -> Baresip -> Cisco VG2 -> Webex Calling | **%100 Başarılı (Ses Alındı)** |

---

## 5. 🌐 Cross-Platform & IP Bağımsız (Stateless) Yapı

- **IP Bağımsızlığı:**
  - Konteyner içi iletişim `127.0.0.1` ve Docker host-gateway (`baresip:host-gateway`, `bare_postgres:5432`) üzerinden yapıldığı için sunucu IP adresi değişse dahi hiçbir kod veya konfigürasyon değişikliği gerektirmez.
- **Cross-Platform:**
  - Hem **macOS (Apple Silicon ARM64)** hem de **Linux (x86_64)** üzerinde `docker compose up -d --build` komutu ile saniyeler içinde ayağa kalkar.
