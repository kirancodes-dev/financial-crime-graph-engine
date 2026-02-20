import pandas as pd
from fastapi import FastAPI, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import io
import os
import traceback
from pymongo import MongoClient
import certifi
from google import genai
from dotenv import load_dotenv

# Internal Forensic Engine
from engine import FraudEngine

load_dotenv()

# --- CLOUD PERSISTENCE (With Safety Bypass) ---
MONGO_URL = os.getenv("MONGO_URL")
client_db = None
accounts_col = None

if MONGO_URL:
    try:
        client_db = MongoClient(MONGO_URL, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
        db = client_db["ForensicsDB"]
        accounts_col = db["flagged_accounts"]
        client_db.admin.command('ping')
        print("✅ Judicial Cloud Database Online")
    except Exception as e:
        print(f"⚠️ Cloud DB Bypass: {e}")
else:
    print("ℹ️ MONGO_URL not found. Running in local-only mode.")

# --- MODERN AI CLIENT (With Safety Bypass) ---
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
ai_client = genai.Client(api_key=GEMINI_KEY) if GEMINI_KEY else None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/analyze")
async def analyze_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        fraud_engine = FraudEngine(df)
        results = fraud_engine.run_analysis()
        
        # PERSISTENCE (Only if MongoDB is connected)
        if accounts_col is not None and results.get("suspicious_accounts"):
            try:
                for acc in results["suspicious_accounts"]:
                    accounts_col.update_one(
                        {"account_id": acc["account_id"]},
                        {"$set": {
                            "account_id": acc["account_id"],
                            "suspicion_score": acc["suspicion_score"],
                            "detected_patterns": acc["detected_patterns"],
                            "ring_id": acc["ring_id"],
                            "last_audit": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")
                        }},
                        upsert=True
                    )
            except Exception as db_err:
                print(f"DB Write Error: {db_err}")
                
        return results
    except Exception as e:
        print(traceback.format_exc())
        return JSONResponse(status_code=400, content={"error": str(e)})

@app.get("/api/archive")
async def get_archive():
    try:
        if accounts_col is None: return []
        cursor = accounts_col.find({}, {"_id": 0}).sort("suspicion_score", -1).limit(100)
        return list(cursor)
    except:
        return []

@app.post("/api/chat")
async def chat_with_data(query: str = Body(..., embed=True), context: dict = Body(...)):
    if not ai_client:
        return {"response": "AI Assistant is currently offline (API Key Missing)."}
    try:
        analytics = context.get('analytics', {})
        response = ai_client.models.generate_content(
            model="gemini-2.0-flash", 
            contents=f"Investigator Query: {query}. Data Context: {analytics}"
        )
        return {"response": response.text.strip()}
    except:
        return {"response": "AI Error."}

# --- RENDER PORT HANDLING ---
if __name__ == "__main__":
    import uvicorn
    import os
    # Render provides the PORT environment variable automatically
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)