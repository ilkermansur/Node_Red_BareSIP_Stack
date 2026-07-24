# Node-RED & Baresip IVR Stack: Mimari Analiz ve Sistem Röntgeni (v1.0.0 Sealed Release)

Bu doküman; platformun tüm bileşenlerini, bileşenlerin birbirleriyle olan iletişim protokollerini (API, TCP Socket, SQL, CLI), konteyner içi ve dışı ağ yapılarını, akışların (flow) arka planda nasıl çalıştığını ve geliştiricilerin sadece Node-RED flow'ları ile sistemi nasıl genişletebileceğini **en genel seviyeden en derin teknik detaylara (deep-dive)** kadar açıklamaktadır.

---

## 1. 🏗️ Yapı Nelerden Oluşuyor? (Genel Bakış)

Sistem; 3 bağımsız Docker konteyneri ve dış ağlarda yer alan santral/gateway bileşenlerinden oluşan, **IP-bağımsız (stateless)**, yüksek performanslı bir IVR mimarisidir.

### Ana Bileşen Listesi ve İmaj Rolleri:

| Bileşen Adı | Docker Container Name | Taban İmaj & Teknolojiler | Sorumluluk ve Rolü |
| :--- | :--- | :--- | :--- |
| **Node-RED & Audio Engine** | `bare_nodered` | `python:3.10-slim` (Debian)<br/>Node.js 20, Python 3.10, FFmpeg 7.x | IVR Akış Orkestrasyonu, Piper TTS REST Server (Port 5000), FFmpeg Ses Dönüştürme, Python Script Çalıştırma, DB Entegrasyonu. |
| **SIP Motoru (Baresip)** | `bare_baresip` | Debian Bookworm<br/>Baresip v1.0.0 C-Engine | SIP Çağrı Yönetimi, RTP Ses Yayınlama (`aufile`), DTMF Tuşlama Algılama, Cisco Gateway İletişimi. (`network_mode: host`) |
| **Veritabanı (PostgreSQL)** | `bare_postgres` | `postgres:15-alpine` | Arama Kuyruğu (`call_queue`), CDR Arama Kayıtları (`call_records`), Kullanıcı / Menü Verileri. |
| **Cisco Voice Gateway / PBX** | *Remote Equipment* | Cisco IOS CUBE / Webex Calling | IP Trunk üzerinden SIP INVITE paketlerini kabul eder ve Webex Calling / PSTN hattına yönlendirir. |

---

## 2. 🔌 Bileşenler Birbiriyle Nasıl Konuşuyor? (İletişim Röntgeni)

Aşağıdaki şemada bileşenler arasındaki tüm bağlantı türleri (HTTP REST API, TCP Netstring Socket, PostgreSQL SQL Protocol, Local CLI Execution) ve ağ sınırları gösterilmiştir:

```mermaid
graph TD
    subgraph Dış Dünya & Kullanıcılar
        User[Kullanıcı / REST Client]
        Phone[Webex Calling / IP Telefon]
    end

    subgraph Host Sunucu (Linux / macOS - 192.168.85.3)
        subgraph Docker Container: bare_nodered
            NR[Node-RED Core - Port 1880]
            PiperDaemon[Piper TTS FastAPI - Port 5000 Internal]
            PyFunc[Python Function Engine<br/>node-red-contrib-python-function]
        end

        subgraph Docker Container: bare_postgres
            PG[(PostgreSQL 15 DB<br/>Port 5432)]
        end

        subgraph Host Network Mode Container: bare_baresip
            Baresip[Baresip SIP UA<br/>Port 5060 SIP / 5555 TCP Control]
        end

        SharedMedia[Paylaşılan Hacim Volume<br/>/tmp/media / ./data/media]
    end

    %% İletişim Protokolleri
    User -->|1. HTTP POST Request /api/v1/make-call| NR
    NR -->|2. HTTP REST API /api/tts| PiperDaemon
    PiperDaemon -->|3. WAV Dosyası Yazar| SharedMedia
    NR -->|4. CLI Process Exec: ffmpeg && rm| SharedMedia
    NR -->|5. SQL TCP/IP psycopg2:5432| PG
    NR -->|6. TCP JSON Netstring Socket:5555| Baresip
    Baresip -->|7. RTP Audio Stream /tmp/media/*.wav| SharedMedia
    Baresip <-->|8. SIP Protocol UDP/TCP:5060| Phone
```

### Detaylı İletişim Protokolleri Matrisi:

| İletişim Yolu | Kaynak -> Hedef | İletişim Tipi / Protokol | Konteyner İçi mi / Dışı mı? | Veri Biçimi (Payload) |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP API Endpoint** | Client -> Node-RED | HTTP POST / REST | Konteyner Dışı -> İçi (1880) | JSON (`phone_number`, `text`) |
| **TTS Sentezleme** | Node-RED -> Piper Daemon | HTTP POST REST API | Konteyner İçi (127.0.0.1:5000) | JSON -> Disk File (`.wav`) |
| **Audio Formatlama** | Node-RED -> FFmpeg | Local OS CLI (Subprocess Exec) | Konteyner İçi (`/tmp/media`) | Binary WAV file conversion |
| **DB Okuma / Yazma** | Node-RED -> PostgreSQL | PostgreSQL Binary Protocol (SQL) | Konteyner İçi -> Konteyner İçi (5432) | SQL Queries (INSERT, SELECT, UPDATE) |
| **SIP Komut Kontrolü** | Node-RED -> Baresip | TCP Socket (`baresip:5555`) | Konteyner İçi -> Host Net Konteyner | JSON Netstring (`len:{"command":"..."},`) |
| **DTMF Canlı Dinleme** | Baresip -> Node-RED | TCP Socket Stream Broadcast | Host Net Konteyner -> Konteyner İçi | Netstring Events (`CALL_DTMF_START`) |
| **SIP & RTP Sinyalleşme**| Baresip -> Cisco VG2 | SIP (UDP 5060) / RTP (UDP) | Host Network -> Dış Ağ (192.168.91.122) | SIP INVITE, 200 OK, G.711 PCMA Audio |

---

## 3. 🔍 Deep-Dive: Bir Flow Çalıştığında Arka Planda Ne Oluyor?

Geliştiricinin Node-RED üzerinde tetiklediği bir IVR arama akışında (örneğin Master HTTP API `/api/v1/make-call`) adım adım gerçekleşen teknik süreç:

### Adım 1: HTTP API İsteğinin Alınması
1. Kullanıcı `POST http://192.168.85.3:1880/api/v1/make-call` adresine JSON gönderir.
2. Node-RED `HTTP In` düğümü isteği yakalar ve mesaj nesnesine (`msg.payload`) aktarır.

### Adım 2: Nöral Metinden Sese Sentezleme (TTS)
1. Python Düğümü benzersiz bir `call_id` üreterek ham dosya adı belirler (`call_1784884146_raw.wav`).
2. Node-RED, `bare_nodered` konteyneri içindeki yerel Piper Daemon'a (`http://127.0.0.1:5000/api/tts`) HTTP POST atar.
3. Piper TTS (Eren `tr_TR-eren-medium` modeli) metni saniyeler içinde 22050Hz WAV olarak `/tmp/media/` dizinine yazar.

### Adım 3: Telekom Formatlaması & Anlık Çöp Temizliği
1. Python düğümü FFmpeg CLI komutunu üretir:
   `ffmpeg -y -i /tmp/media/call_raw.wav -ar 8000 -ac 1 -c:a pcm_s16le /tmp/media/call_telecom.wav && rm -f /tmp/media/call_raw.wav`
2. `Exec` düğümü bu komutu çalıştırır. Dönüştürme bittiği an ham dosya diskten **anında silinir**.

### Adım 4: Veritabanı Kaydı (PostgreSQL)
1. Python düğümü `psycopg2` kütüphanesi ile `postgres-db:5432` üzerindeki `bare_ivr` veritabanına bağlanır.
2. `call_records` tablosuna `status='IN_PROGRESS'`, telefon numarası ve başlama zaman damgasıyla yeni satır ekler.

### Adım 5: Baresip SIP Araması (Netstring TCP Protocol)
1. Python düğümü Baresip'in beklediği JSON Netstring formatında komutu hazırlar:
   `59:{"command":"dial","params":"sip:399@192.168.91.122","token":"call_123"},`
2. Node-RED TCP Request düğümü bu paketi `baresip:5555` portuna basar.
3. Baresip `192.168.85.3:5060` IP'sinden Cisco VG2 santraline (`192.168.91.122`) SIP INVITE paketini gönderir.

### Adım 6: Canlı DTMF Dinleme ve DB Güncelleme
1. Telefon çalar, karşı taraf (Webex kullanıcısı) aramayı açar (`200 OK`).
2. Baresip `/tmp/media/call_telecom.wav` dosyasını RTP akışı olarak karşı tarafa oynatır.
3. Kullanıcı telefondan **`1`** tuşuna bastığında Cisco santrali RTP event (`telephone-event/8000`) olarak Baresip'e iletir.
4. Baresip TCP 5555 portundan `{"event":true, "type":"CALL_DTMF_START", "param":"1"}` yayınlar.
5. Node-RED `TCP In` dinleyicisi ve Python DTMF Parser bu olayı süzerek `call_records` tablosundaki en son aramayı `dtmf_digits='1'`, `status='COMPLETED'` ve `ended_at=CURRENT_TIMESTAMP` şeklinde günceller.

---

## 4. 🛠️ Flow Yazan Geliştiriciler İçin Rehber

Artık sistem **mühürlenmiştir (Sealed Release)**. Yeni bir IVR senaryosu yazarken **Docker Compose, Dockerfile veya Baresip konfigürasyonlarını değiştirmenize HİÇBİR ZAMAN İHTİYAÇ YOKTUR.**

### Yeni Bir Flow Yazarken İzlenecek 3 Basit Adım:

1. **Merkezi Konfigürasyonu Kullanın:**
   Gerekli tüm varsayılan parametreler `config/app_config.json` dosyasında yer almaktadır. Python düğümlerinde bu dosyayı okuyarak dinamik parametreler elde edebilirsiniz:
   ```python
   import json
   with open('/data/app_config.json', 'r') as f:
       config = json.load(f)
   default_gateway = config['sip']['default_gateway']
   ```

2. **Dinamik Ses Dosyası Kullanın:**
   Baresip sabit bir ses dosyasına bağlı değildir. Herhangi bir akışta ürettiğiniz ses dosyasının yolunu Baresip'e iletmeniz yeterlidir:
   ```python
   # Önce ses kaynağını dinamik dosyaya ayarlar, sonra arar:
   cmd_ausrc = {"command": "ausrc", "params": f"aufile,{formatted_wav_path}"}
   cmd_dial = {"command": "dial", "params": target_phone_number}
   ```

3. **Veritabanı Bağlantısı:**
   Python düğümlerinde PostgreSQL bağlantısı için standart bilgileri kullanın:
   ```python
   import psycopg2
   conn = psycopg2.connect(host='postgres-db', dbname='bare_ivr', user='ivr_user', password='ivr_password_123')
   ```

---

## 5. 🔒 Mühürleme Sertifikası (Major Version 1.0.0 Release)

Bu projenin altyapısı, ağ mimarisi ve bileşenler arası protokolleri **v1.0.0 kararlı sürümü** olarak mühürlenmiştir.

- **Mimari Kararlılık:** %100 Uyumlu (Debian glibc tabanlı Python 3.10 + Baresip Host Network + PostgreSQL 15).
- **Esneklik:** Tamamen Node-RED arayüzü ve Python sözdizimi üzerinden sürülebilir.
- **Portatiflik:** Hem macOS hem Linux sunucularda `docker compose up -d` komutuyla sıfır konfigürasyon değişikliği ile çalışmaya hazırdır.
