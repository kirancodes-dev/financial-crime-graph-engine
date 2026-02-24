import os
import uvicorn
import pandas as pd
import networkx as nx
import google.generativeai as genai
import certifi
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv


load_dotenv()

app = FastAPI()

# --- CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-pro')

# Initialize MongoDB
MONGO_URI = os.getenv("MONGO_URI")
db_status = "Disconnected"
if MONGO_URI:
    try:
        client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
        db = client["fraud_detection_db"]
        collection = db["flagged_networks"]
        db_status = "Connected"
        print("✅ Connected to MongoDB!")
    except Exception as e:
        print(f"⚠️ MongoDB Connection Failed: {e}")

# --- API ENDPOINTS ---
@app.get("/")
def home():
    return {"message": "Financial Crime Graph Engine is Online", "db_status": db_status}

@app.post("/api/analyze")
async def analyze_csv(file: UploadFile = File(...)):
    try:
        df = pd.read_csv(file.file)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid CSV file")

    G = nx.from_pandas_edgelist(df, 'sender_id', 'receiver_id', ['amount', 'timestamp'], create_using=nx.DiGraph())
    
    fraud_rings = []
    try:
        cycles = list(nx.simple_cycles(G))
        for cycle in cycles:
            if len(cycle) > 2 and len(cycle) < 7: 
                subgraph = G.subgraph(cycle)
                volume = sum([d['amount'] for u, v, d in subgraph.edges(data=True)])
                
                ring_data = {
                    "ring_id": f"RING_{len(fraud_rings)+1:03d}",
                    "pattern_type": "Circular Layering",
                    "member_count": len(cycle),
                    "score": min(95 + len(cycle), 100),
                    "nodes": cycle,
                    "total_volume": float(volume)
                }
                fraud_rings.append(ring_data)
                
                # SAVE TO MONGODB
                if MONGO_URI:
                    collection.update_one(
                        {"ring_id": ring_data["ring_id"]}, 
                        {"$set": ring_data}, 
                        upsert=True
                    )
    except Exception as e:
        print(f"Graph processing error: {e}")

    elements = []
    for node in G.nodes():
        risk = 10
        is_suspicious = any(node in r['nodes'] for r in fraud_rings)
        if is_suspicious: risk = 90
        
        elements.append({
            "data": {
                "id": str(node), "label": str(node), "risk_score": risk,
                "is_suspicious": is_suspicious, "recommend_freeze": is_suspicious and risk > 85
            }
        })
    for u, v, data in G.edges(data=True):
        elements.append({
            "data": {
                "source": str(u), "target": str(v),
                "amount": str(data.get('amount', 0)), "timestamp": str(data.get('timestamp', ''))
            }
        })

    return {
        "analytics": {
            "total_transactions": len(df),
            "flagged_entities": sum(1 for x in elements if x['data'].get('is_suspicious')),
        },
        "graph_data": elements[:1500],
        "fraud_rings": fraud_rings
    }

@app.post("/api/chat")
async def chat_agent(request: dict = Body(...)):
    user_query = request.get("query")
    context_data = request.get("context")

    if not GEMINI_API_KEY:
        return {"response": "AI is disabled (No API Key configured)."}

    prompt = f"""
    You are a forensic financial investigator. 
    Here is the data from the latest fraud scan: {str(context_data)[:2000]}...
    
    User Question: {user_query}
    
    Provide a professional, concise answer explaining the suspicious activity.
    """
    try:
        response = model.generate_content(prompt)
        return {"response": response.text}
    except Exception as e:
        return {"response": f"AI Error: {str(e)}"}