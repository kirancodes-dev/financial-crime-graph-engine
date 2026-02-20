import pandas as pd
from fastapi import FastAPI, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import io
import os
import traceback
from pymongo import MongoClient
import certifi
from google import genai  # <--- FIXED IMPORT
from dotenv import load_dotenv

# Internal Forensic Engine
from engine import FraudEngine

load_dotenv()

# --- CLOUD PERSISTENCE INITIALIZATION ---
MONGO_URL = os.getenv("MONGO_URL")
client_db = None
accounts_col = None

if not MONGO_URL:
    print("❌ ERROR: MONGO_URL not found in .env")
else:
    try:
        client_db = MongoClient(MONGO_URL, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
        db = client_db["ForensicsDB"]
        accounts_col = db["flagged_accounts"]
        client_db.admin.command('ping')
        print("✅ Judicial Cloud Database Online")
    except Exception as e:
        print(f"❌ Cloud DB Connection Failed: {e}")
        client_db = None

# --- MODERN AI CLIENT ---
# New syntax for the updated SDK
ai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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
        
        # --- CLOUD PERSISTENCE ---
        if accounts_col is not None and results.get("suspicious_accounts"):
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
        return results

    except Exception as e:
        print(traceback.format_exc())
        return JSONResponse(status_code=400, content={"error": f"Engine Crash: {str(e)}"})

@app.get("/api/archive")
async def get_archive():
    try:
        if accounts_col is None: return []
        cursor = accounts_col.find({}, {"_id": 0}).sort("suspicion_score", -1).limit(100)
        return list(cursor)
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/chat")
async def chat_with_data(query: str = Body(..., embed=True), context: dict = Body(...)):
    try:
        analytics = context.get('analytics', {})
        # Modern SDK uses .models.generate_content
        response = ai_client.models.generate_content(
            model="gemini-2.0-flash", 
            contents=f"Context: {analytics}. Query: {query}"
        )
        return {"response": response.text.strip()}
    except Exception as e:
        print(f"AI Error: {e}")
        return {"response": "Forensic AI is adjusting its algorithms. Try again shortly."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)