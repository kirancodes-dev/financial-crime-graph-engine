# 🕵️ FRAUD Detection: Graph-Based Financial Forensics Engine  
## RIFT 2026 Hackathon – Money Muling Detection Challenge

This project is a web-based Financial Crime Detection Engine designed to detect sophisticated money muling networks using graph theory, temporal analysis, and generative AI.

The system processes universal transaction CSV files, constructs a directed graph of accounts, detects complex fraud patterns (cyclic washing, structured smurfing, shell layering), assigns suspicion scores, and generates interactive hardware-accelerated visualizations, AI-driven insights, and structured JSON outputs.

---

# 🌐 Live Demo URL

🔗 [Insert your live application URL here]  

- Publicly accessible
- No authentication required
- Universal CSV upload available on the dashboard
- Supports datasets up to 10,000 transactions with 60FPS rendering
- JSON report download enabled

---

# 🛠 Tech Stack

## Backend (FastAPI Forensics Engine)
- **Python 3.x**
- **FastAPI & Uvicorn** (High-performance async API)
- **NetworkX** (Graph topology & centrality analytics)
- **Pandas & NumPy** (Data processing and standard deviation variance math)
- **SQLAlchemy / SQLite** (Persistent database for flagged entities)
- **Google Generative AI** (Gemini 2.5 Flash for the interactive Forensic AI Agent)

## Frontend (Interactive Dashboard)
- **React 18 & TypeScript**
- **Tailwind CSS** (UI styling and animations)
- **Cytoscape.js & react-cytoscapejs** (Advanced Force-Directed Graph visualization)

## Deployment
- Render / Railway / Vercel (Replace with your chosen platform)

---

# 🏗 System Architecture

## High-Level Workflow

Universal CSV Upload (Auto-cleans irregular headers)  
↓  
Data Validation & SQLite Persistence  
↓  
Directed Graph Construction (NetworkX)  
↓  
Heuristic Fraud Detection Engine (Cycles, Smurfing, Layering, Geo-Risk)  
↓  
Betweenness Centrality Calculation (Shadow Boss Detection)  
↓  
Interactive Force-Directed Graph UI (with Chronological Time-Lapse)  
↓  
AI Context Injection (Gemini parses the graph data for natural language queries)  
↓  
Downloadable JSON Report  

The system separates heavy analytical detection logic on the backend from the 60FPS rendering presentation logic on the frontend to ensure scalability and maintainability.

---

# 🧠 Algorithm Approach

---

## 1️⃣ Graph Construction & Geo-Risk Initialization

Each transaction is modeled as a directed edge:
- **Nodes (V)** → Unique account IDs
- **Edges (E)** → Transactions (sender → receiver)
- **Edge attributes** → amount, timestamp
- **Geo-Risk Analysis** → Hashes account IDs to detect cross-border/offshore routing to high-risk jurisdictions.

Time Complexity: **O(V + E)**

---

## 2️⃣ Circular Fund Routing (Cycle Detection)

**Objective:**
Detect wash trading and cyclic loops where money returns to the origin.

**Method:**
- Use `networkx.simple_cycles()` bounded to a configurable maximum length (e.g., 6 hops).
- Calculate the minimum edge count to find *how many complete loops* were executed.
- Assign the same `ring_id` to all participating accounts.

---

## 3️⃣ Smurfing Detection (Structured Fan-In / Fan-Out)

**Objective:**
Detect boss accounts splitting funds to mules, or aggregating funds from mules.

**Method:**
- **Degree Thresholds:** Identify nodes sending/receiving from ≥ 10 unique accounts under a specific monetary threshold.
- **Amount Uniformity (Advanced):** Use NumPy to calculate the Standard Deviation of the transaction amounts. If the variance is < 15% of the mean, it flags the behavior as highly artificial "Structured Smurfing," heavily increasing the risk penalty.

---

## 4️⃣ Layered Shell Network Detection

**Objective:**
Identify multi-hop fund routing through intermediary shell accounts.

**Method:**
- Depth-limited BFS search (minimum depth of 3 hops).
- **Decrement Analysis (The "Cut"):** Analyzes the monetary flow across the chain. Flags if an intermediate account takes exactly a ~5% "cut" before passing the remaining funds to the next layer.

---

## 5️⃣ Shadow Boss Detection (Betweenness Centrality)

**Objective:**
Find the masterminds who act as bridges between distinct fraud networks but execute very few direct transactions.

**Method:**
- Calculates **Betweenness Centrality** across the entire subgraph.
- Nodes acting as critical bridges receive an immediate "Shadow Boss" classification and trigger an automated Freeze Directive.

---

## 6️⃣ Time Complexity Analysis

| Module | Complexity |
|---------|------------|
| Graph Construction | O(V + E) |
| Cycle Detection | Depth-limited search |
| Fan-In / Fan-Out | O(E log E) |
| Shell Detection | O(V + E) |
| Centrality Math | O(V * E) on pruned subgraphs |
| Overall | Optimized for rapid processing (10K+ rows) |

---

# 🎯 Suspicion Score Methodology

Each account accumulates a cumulative risk score based on its participation in various mathematical patterns. 

## Additive Scoring Model

- **Cycle Fraud:** +10 Base Points (Multiplied by loop count)
- **Structured Smurfing (Uniform Variance):** +20 Points
- **Scattered Smurfing (High Variance):** +10 Points
- **Layering (Standard):** +15 Points
- **Layering (Intermediary Cut Taken):** +25 Points
- **Offshore Routing:** +15 Points
- **Shadow Boss (High Centrality):** +30 Points

Accounts breaching the `FREEZE_THRESHOLD` (e.g., 40 PTS) are flagged with an immediate automated Freeze Directive. Suspicious accounts are sorted in descending order to populate the investigator's Triage Leaderboard.

---

# 📂 JSON Output Format

The system generates a downloadable JSON file strictly matching the active state of the analytics engine:

```json
{
  "analytics": {
    "total_transactions": 1000,
    "flagged_entities": 45,
    "freeze_recommendations": 12,
    "max_risk_score": 115
  },
  "graph_data": [
    {
      "data": {
        "id": "ACC_00123",
        "label": "🛑 ACC_00123\n[IN]",
        "country": "IN",
        "is_suspicious": true,
        "fraud_type": "SHADOW_BOSS_OVERLAP",
        "risk_score": 85,
        "fraud_count": 3,
        "total_sent": 45000.0,
        "total_received": 50000.0,
        "history": [
          {
            "type": "SENT",
            "counterparty": "MULE_01",
            "amount": 500.0,
            "time": "2026-02-19 14:30:00"
          }
        ],
        "recommend_freeze": true
      }
    }
  ],
  "fraud_rings": [
    {
      "ring_id": "SMURF_OUT_0123",
      "pattern_type": "Structured Fan-Out",
      "nodes": ["ACC_00123", "MULE_1", "MULE_2"],
      "score": 40
    }
  ]
}
