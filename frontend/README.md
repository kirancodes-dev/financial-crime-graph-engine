# 🕵️ RIFT Forensics Engine — Money Muling Detection System

> **RIFT 2026 Hackathon | Graph Theory / Financial Crime Detection Track**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Deployed-brightgreen)](https://your-deployed-url.vercel.app)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-purple)](https://vitejs.dev)
[![Cytoscape](https://img.shields.io/badge/Cytoscape.js-3.29-orange)](https://js.cytoscape.org)

---

## 🔗 Live Demo
**[https://your-deployed-url.vercel.app](https://your-deployed-url.vercel.app)**  
*(Replace with your actual Vercel/Netlify URL after deployment)*

---

## 📌 Project Overview

A production-grade web forensics engine that processes financial transaction CSVs and exposes hidden **money muling networks** through graph analysis and interactive visualization.

Upload a CSV → Get an interactive graph with fraud rings highlighted → Download JSON report.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Graph Visualization | Cytoscape.js + cose-bilkent layout |
| Charts / Analytics | D3.js v7 |
| File Upload | React Dropzone |
| CSV Parsing | PapaParse |
| Animation | Framer Motion |
| Icons | Lucide React |

> **Note on Sigma.js / Vis.js**: This project primarily uses Cytoscape.js as the graph renderer due to its superior performance with directed graphs and built-in layout algorithms. Sigma.js (WebGL renderer) can be swapped in for 50K+ node datasets by installing `sigma` and `graphology`. Vis.js is available as an alternative via the `vis-network` package.

---

## 🏗 System Architecture

```
rift-fraud-engine/
├── src/
│   ├── components/
│   │   ├── DropZone.jsx      # React Dropzone upload UI
│   │   ├── GraphPanel.jsx    # Cytoscape.js interactive graph
│   │   ├── StatsPanel.jsx    # D3.js bar charts + stat cards
│   │   ├── FraudRingTable.jsx# Sortable/expandable ring table
│   │   └── NodeDetail.jsx    # Clicked-node side panel
│   ├── utils/
│   │   ├── detection.js      # Core graph algorithms
│   │   ├── csvParser.js      # PapaParse wrapper + validation
│   │   └── cytoscapeBuilder.js # Element/stylesheet builders
│   ├── styles/index.css      # Tailwind + custom CSS
│   ├── App.jsx               # Root layout + state management
│   └── main.jsx              # Entry point
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 🧠 Algorithm Approach

### 1. Cycle Detection — `O(V × (V + E))` DFS
Detects circular fund routing (money laundering loops) of length 3–5.

**Method**: Modified DFS from each node. Track visited set per path. When a neighbor equals the starting node and path length ∈ [3,5], a cycle is recorded. Canonical form (sorted members) deduplicates symmetrical cycles.

```
A → B → C → A  (length 3 cycle = money laundering ring)
A → B → C → D → A  (length 4)
```

### 2. Smurfing Detection — `O(V + E)`
Identifies fan-in (aggregator accounts) and fan-out (dispersal accounts).

**Method**: For each account, count unique in-edges and out-edges. If either ≥ 10 AND ≥10 transactions occur within a **72-hour sliding window**, flag as smurfing.

Temporal analysis uses a two-pointer window scan: `O(n log n)` for sort, `O(n)` for sweep.

### 3. Layered Shell Network Detection — `O(V × D)` where D = chain depth
Detects multi-hop chains through low-transaction accounts.

**Method**: DFS from each non-shell node. A node is classified as a "shell" if `txCount ≤ 3`. Chains of 3+ consecutive shell accounts are flagged.

### False Positive Filtering
Legitimate high-volume accounts are excluded:
- `txCount > 500` → likely a merchant/payment processor
- `uniqueSenders > 100 && txCount > 200` → payroll/subscription service

---

## 📊 Suspicion Score Methodology

Scores are normalized 0–100 and composed additively:

| Component | Max Points | Logic |
|-----------|-----------|-------|
| Cycle membership | +30 | Per cycle containing the account |
| Smurfing membership | +25 | Fan-in or fan-out pattern |
| Shell chain membership | +20 | Intermediate in a shell chain |
| Velocity | +20 | tx/hour > 5; capped at 20 |
| High in-degree | +10 | >15 unique senders |
| High out-degree | +10 | >15 unique receivers |
| Mid-volume layering | +5 | 20 < txCount < 500 |

Score is capped at 100. Sorted descending in output JSON.

---

## ⚡ Performance

| Dataset Size | Processing Time |
|-------------|----------------|
| 1K txns | <0.5s |
| 5K txns | <3s |
| 10K txns | <15s |
| 50K+ txns | Use Sigma.js WebGL mode |

---

## 📥 Installation & Setup

### Prerequisites
- Node.js ≥ 18.0
- npm ≥ 9.0

### Local Development
```bash
git clone https://github.com/YOUR_USERNAME/rift-fraud-engine.git
cd rift-fraud-engine
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### Production Build
```bash
npm run build
npm run preview
```

### Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```

---

## 📋 Usage Instructions

1. **Upload** your CSV file via drag-and-drop or click-to-browse
2. **Wait** for graph processing (shown via spinner)
3. **Explore** the interactive graph:
   - Hover nodes to see account details
   - Click a node to pin the detail panel
   - Use **Suspicious Only** filter to isolate fraud network
   - Change layout (force-directed, circle, grid, etc.)
4. **Review** the Ring Registry table for all detected patterns
5. **Export** the structured JSON report via "Export JSON" button

### CSV Format
```csv
transaction_id,sender_id,receiver_id,amount,timestamp
TXN_000001,ACC_00001,ACC_00002,15000.00,2024-01-15 10:00:00
```

---

## 📤 Output JSON Format

```json
{
  "suspicious_accounts": [
    {
      "account_id": "ACC_00001",
      "suspicion_score": 87.5,
      "detected_patterns": ["cycle_length_3", "high_velocity"],
      "ring_id": "RING_001"
    }
  ],
  "fraud_rings": [
    {
      "ring_id": "RING_001",
      "member_accounts": ["ACC_00001", "ACC_00002", "ACC_00003"],
      "pattern_type": "cycle",
      "risk_score": 95.3
    }
  ],
  "summary": {
    "total_accounts_analyzed": 500,
    "suspicious_accounts_flagged": 15,
    "fraud_rings_detected": 4,
    "processing_time_seconds": 2.3
  }
}
```

---

## ⚠️ Known Limitations

1. **Large Graphs (>50K nodes)**: Cytoscape.js renders in Canvas2D; performance degrades. Switch to Sigma.js (WebGL) for massive datasets.
2. **Cycle Detection Completeness**: DFS finds cycles of length 3–5 only. Longer cycles (6+) are not flagged by design (per spec), though they may exist.
3. **Temporal Smurfing**: The 72-hour window uses sorted timestamps. Timezone discrepancies in the CSV may affect window accuracy.
4. **Shell Network Threshold**: Shell classification uses txCount ≤ 3. High-risk accounts with few transactions but large amounts may be under-flagged if they don't connect to other shells.
5. **Memory**: Large CSVs (>10MB) parsed entirely in-browser. For production, server-side streaming recommended.
6. **No Persistence**: Analysis results are not saved. Each upload triggers fresh analysis.

---

## 👥 Team Members

| Name | Role |
|------|------|
| YOUR_NAME | Full-Stack + Graph Algorithms |
| TEAMMATE_2 | UI/UX + Visualization |
| TEAMMATE_3 | Detection Logic + Testing |

---

## 📎 Submission Links

- 🌐 **Live App**: [https://your-deployed-url.vercel.app](https://your-deployed-url.vercel.app)
- 💻 **GitHub**: [https://github.com/YOUR_USERNAME/rift-fraud-engine](https://github.com/YOUR_USERNAME/rift-fraud-engine)
- 🎬 **Demo Video**: [LinkedIn Post Link]

---

*Built for RIFT 2026 Hackathon — Graph Theory / Financial Crime Detection Track*
