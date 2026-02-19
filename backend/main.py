from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import time
from graph_engine import analyze_muling_patterns

app = FastAPI(title="RIFT 2026 AML Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/analyze")
async def analyze_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload a CSV.")

    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        # Standardize column names (handle both 'transaction_id' and 'transactionid')
        df.columns = df.columns.str.lower().str.replace('_', '')
        required = {'transactionid', 'senderid', 'receiverid', 'amount', 'timestamp'}
        
        if not required.issubset(df.columns):
            raise HTTPException(status_code=400, detail=f"Missing columns. Found: {list(df.columns)}")

        # Run Bank-Level Graph Analysis
        suspicious, rings, p_time, total_acc, graph_data = analyze_muling_patterns(df)

        # EXACT Schema Match Required by Hackathon Judges
        return {
            "suspicious_accounts": suspicious,
            "fraud_rings": rings,
            "summary": {
                "total_accounts_analyzed": total_acc,
                "suspicious_accounts_flagged": len(suspicious),
                "fraud_rings_detected": len(rings),
                "processing_time_seconds": p_time
            },
            "graph_data": graph_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)