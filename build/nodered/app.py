import os
import subprocess
import urllib.request
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Piper TTS API")

MEDIA_DIR = os.getenv("MEDIA_DIR", "/tmp/media")
MODELS_DIR = os.getenv("MODELS_DIR", "/app/models")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "tr_TR-eren-medium")

os.makedirs(MEDIA_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# Bilinen ses modelleri ve HuggingFace indirme bağlantıları
MODEL_URLS = {
    "tr_TR-eren-medium": {
        "onnx": "https://huggingface.co/99eren99/piper-turkish-tts/resolve/main/model.onnx",
        "json": "https://huggingface.co/99eren99/piper-turkish-tts/resolve/main/config.json"
    },
    "en_US-amy-medium": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
    }
}

def ensure_model_exists(model_name: str):
    onnx_path = os.path.join(MODELS_DIR, f"{model_name}.onnx")
    json_path = os.path.join(MODELS_DIR, f"{model_name}.onnx.json")

    if os.path.exists(onnx_path) and os.path.exists(json_path):
        return onnx_path

    if model_name not in MODEL_URLS:
        raise HTTPException(
            status_code=400,
            detail=f"Bilinmeyen model '{model_name}'. Desteklenen modeller: {list(MODEL_URLS.keys())}"
        )

    print(f"[Piper API] '{model_name}' ses modeli eksik, HuggingFace üzerinden otomatik indiriliyor...")
    urls = MODEL_URLS[model_name]
    
    try:
        urllib.request.urlretrieve(urls["onnx"], onnx_path)
        urllib.request.urlretrieve(urls["json"], json_path)
        print(f"[Piper API] '{model_name}' başarıyla indirildi!")
    except Exception as e:
        if os.path.exists(onnx_path): os.remove(onnx_path)
        if os.path.exists(json_path): os.remove(json_path)
        raise HTTPException(status_code=500, detail=f"Ses modeli indirilemedi: {str(e)}")

    return onnx_path

class TTSRequest(BaseModel):
    text: str
    filename: str = "output.wav"
    model: str = DEFAULT_MODEL

@app.on_event("startup")
def startup_event():
    try:
        ensure_model_exists(DEFAULT_MODEL)
    except Exception as e:
        print(f"[Piper API] Başlangıç modeli indirilirken uyarı: {e}")

@app.get("/health")
def health():
    return {
        "status": "ok", 
        "available_models": [f for f in os.listdir(MODELS_DIR) if f.endswith('.onnx')],
        "default_model": DEFAULT_MODEL
    }

@app.post("/api/tts")
def generate_tts(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Metin alanı boş olamaz")
    
    model_path = ensure_model_exists(req.model)
    filename = req.filename if req.filename.endswith(".wav") else f"{req.filename}.wav"
    output_path = os.path.join(MEDIA_DIR, filename)

    try:
        cmd = f'echo "{req.text}" | piper --model "{model_path}" --output_file "{output_path}"'
        subprocess.run(cmd, shell=True, check=True)

        return {
            "status": "success",
            "file_path": output_path,
            "filename": filename,
            "model_used": req.model,
            "text": req.text
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"TTS sentezleme hatası: {str(e)}")
