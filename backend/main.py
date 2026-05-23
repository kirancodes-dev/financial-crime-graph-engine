import os
import io
import hashlib
import asyncio
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

import pandas as pd
import uvicorn
import certifi
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from pymongo import MongoClient
from dotenv import load_dotenv

try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

from engine import FraudEngine
from generate_data import generate_synthetic_data

load_dotenv()

app = FastAPI(title="Financial Crime Graph Engine", version="2.0")

# ── Middleware ──────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)  # compress large payloads
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Thread pool for CPU-bound graph analysis ────────────────────────────
executor = ThreadPoolExecutor(max_workers=4)

# ── In-memory caches ────────────────────────────────────────────────────
_result_cache: dict = {}   # file_hash → analysis result
_job_store: dict = {}      # job_id  → {"status", "result", "error", "started_at"}
CACHE_TTL = 600            # seconds

# ── Gemini AI (optional) ────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
model = None
if GENAI_AVAILABLE and GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)  # type: ignore[possibly-unbound]
    model = genai.GenerativeModel("gemini-flash-latest")  # type: ignore[possibly-unbound]

# ── MongoDB (optional) ─────────────────────────────────────────────────
MONGO_URI = os.getenv("MONGO_URI")
db_status = "Local Mode"
collection = None
if MONGO_URI:
    try:
        client = MongoClient(MONGO_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=3000)
        db = client["fraud_detection_db"]
        collection = db["flagged_networks"]
        db_status = "Connected"
        print("✅ Connected to MongoDB!")
    except Exception as e:
        print(f"⚠️  MongoDB skipped: {e}")


# ── Helpers ─────────────────────────────────────────────────────────────
def _hash_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()

def _is_cache_fresh(entry: dict) -> bool:
    return time.time() - entry.get("ts", 0) < CACHE_TTL

def _run_engine(csv_bytes: bytes) -> dict[str, Any]:
    """CPU-bound work — runs in thread pool."""
    df = pd.read_csv(io.BytesIO(csv_bytes))
    engine = FraudEngine(df)
    result: dict[str, Any] = engine.run_analysis()
    # Persist rings to MongoDB (fire-and-forget)
    if collection is not None:
        for ring in result.get("fraud_rings", []):  # ring: dict[str, Any]
            try:
                ring_dict: dict[str, Any] = ring
                collection.update_one({"ring_id": ring_dict["ring_id"]}, {"$set": ring_dict}, upsert=True)
            except Exception:
                pass
    return result


# ── Routes ───────────────────────────────────────────────────────────────
@app.get("/")
def home():
    return {
        "message": "Financial Crime Graph Engine v2 — Local Mode",
        "db_status": db_status,
        "cache_entries": len(_result_cache),
    }


@app.post("/api/analyze")
async def analyze_csv(file: UploadFile = File(...)):
    """Upload a CSV and get instant fraud analysis. Results are cached by file hash."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    file_hash = _hash_bytes(raw)

    # ── Cache hit: return instantly ──────────────────────────────────────
    if file_hash in _result_cache and _is_cache_fresh(_result_cache[file_hash]):
        entry = _result_cache[file_hash]
        return {**entry["data"], "cached": True}

    # ── Run analysis in thread pool so event loop stays free ─────────────
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(executor, _run_engine, raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")

    _result_cache[file_hash] = {"data": result, "ts": time.time()}
    return {**result, "cached": False}


@app.get("/api/demo")
async def get_demo_data(mode: str = "fiat"):
    """
    Returns pre-generated synthetic fraud data instantly — no file upload needed.
    Use ?mode=crypto for crypto-style addresses.
    """
    cache_key = f"__demo_{mode}"
    if cache_key in _result_cache and _is_cache_fresh(_result_cache[cache_key]):
        return {**_result_cache[cache_key]["data"], "cached": True, "demo": True}

    is_crypto = mode == "crypto"

    def _build_demo():
        buf = io.StringIO()
        # generate_synthetic_data writes a file; we patch it to write to buffer
        import sys, tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            orig_dir = os.getcwd()
            os.chdir(tmp)
            try:
                generate_synthetic_data(num_normal=300, is_crypto=is_crypto)
                fname = "crypto_ledger_demo.csv" if is_crypto else "fiat_banking_demo.csv"
                df = pd.read_csv(fname)
            finally:
                os.chdir(orig_dir)
        engine = FraudEngine(df)
        return engine.run_analysis()

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, _build_demo)
    _result_cache[cache_key] = {"data": result, "ts": time.time()}
    return {**result, "cached": False, "demo": True}


@app.post("/api/chat")
async def chat_agent(request: dict = Body(...)):
    user_query = request.get("query", "")
    context_data = request.get("context", {})

    if not model:
        return {"response": "🤖 AI assistant is offline (no GEMINI_API_KEY configured). You can still explore the graph."}

    prompt = (
        "You are a forensic financial investigator AI.\n"
        f"Latest fraud scan summary: {str(context_data)[:1500]}\n\n"
        f"Investigator question: {user_query}\n\n"
        "Reply in 2-3 concise, professional sentences."
    )
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(executor, model.generate_content, prompt)
        return {"response": response.text}
    except Exception as e:
        return {"response": f"AI Error: {str(e)}"}


@app.get("/api/export/flagged")
async def export_flagged_csv(cache_key: str = ""):
    """
    Download flagged entities as a CSV file.
    Pass ?cache_key=<file_hash> to export from a specific cached scan,
    or omit to use the most recent scan result.
    """
    # Find the most recent cache entry with flagged_entities
    entry = _result_cache.get(cache_key)
    if not entry:
        # Use the most recent fresh entry
        fresh = [(k, v) for k, v in _result_cache.items() if _is_cache_fresh(v) and "data" in v]
        if not fresh:
            raise HTTPException(status_code=404, detail="No scan result in cache. Run /api/analyze first.")
        entry = max(fresh, key=lambda kv: kv[1]["ts"])[1]

    flagged = entry["data"].get("flagged_entities", [])
    if not flagged:
        raise HTTPException(status_code=404, detail="No flagged entities in this scan.")

    # Build CSV in-memory
    buf = io.StringIO()
    fieldnames = ["account_id", "risk_score", "country", "fraud_types", "total_sent", "total_received", "recommend_freeze"]
    import csv
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(flagged)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=flagged_entities_{int(time.time())}.csv"}
    )


@app.get("/api/network-stats")
def get_network_stats():
    """Return network-level health metrics from the most recent scan."""
    fresh = [(k, v) for k, v in _result_cache.items() if _is_cache_fresh(v) and "data" in v]
    if not fresh:
        return {"error": "No scan data available. Run /api/analyze first."}
    entry = max(fresh, key=lambda kv: kv[1]["ts"])[1]
    analytics = entry["data"].get("analytics", {})
    breakdown = entry["data"].get("fraud_type_breakdown", {})
    return {"analytics": analytics, "fraud_type_breakdown": breakdown}


@app.delete("/api/cache")
def clear_cache():
    """Dev utility — wipe the server-side result cache."""
    _result_cache.clear()
    return {"message": "Cache cleared"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)