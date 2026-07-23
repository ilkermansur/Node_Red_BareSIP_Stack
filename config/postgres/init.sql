-- 1. Arama Kuyruğu (Outbound Queue)
CREATE TABLE IF NOT EXISTS call_queue (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(32) NOT NULL,
    tts_text TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, FAILED
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Çağrı Detay Kayıtları (CDR)
CREATE TABLE IF NOT EXISTS call_records (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(64),
    phone_number VARCHAR(32) NOT NULL,
    direction VARCHAR(10) DEFAULT 'OUTBOUND', -- OUTBOUND / INBOUND
    status VARCHAR(32),                      -- ANSWERED, BUSY, NO_ANSWER, FAILED
    dtmf_digits VARCHAR(32),                 -- Basılan tuşlar (Örn: "1")
    duration_seconds INT DEFAULT 0,
    started_at TIMESTAMP,
    ended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Örnek başlangıç verisi (Test için)
INSERT INTO call_queue (phone_number, tts_text) 
VALUES ('05551234567', 'Merhaba, bu bir Node Red ve Baresip test aramasıdır. Tuşlama yapabilirsiniz.');
