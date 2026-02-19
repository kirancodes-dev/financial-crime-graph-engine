import networkx as nx
import pandas as pd
from datetime import timedelta
import time

def analyze_muling_patterns(df):
    start_time = time.time()
    
    # 1. Data Cleaning & Type Enforcement
    df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
    df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
    df = df.dropna(subset=['senderid', 'receiverid', 'amount', 'timestamp'])
    df = df.sort_values('timestamp')

    # 2. Build Directed Graph
    G = nx.from_pandas_edgelist(
        df, source="senderid", target="receiverid",
        edge_attr=["amount", "timestamp", "transactionid"],
        create_using=nx.DiGraph()
    )

    account_flags = {}  # Store flags before consolidation
    fraud_rings = []
    ring_counter = 1

    # ==========================================
    # DETECTOR 1: CYCLES (Length 3-5)
    # ==========================================
    cycles = list(nx.simple_cycles(G, length_bound=5))
    for cycle in cycles:
        if 3 <= len(cycle) <= 5:
            r_id = f"RING_{ring_counter:03d}"
            ring_counter += 1
            fraud_rings.append({
                "ring_id": r_id,
                "member_accounts": [str(n) for n in cycle],
                "pattern_type": "Circular Routing",
                "risk_score": 95.0
            })
            for node in cycle:
                if node not in account_flags:
                    account_flags[node] = {"patterns": set(), "ring_id": r_id, "base_score": 90.0}
                account_flags[node]["patterns"].add("Cycle Member")

    # ==========================================
    # DETECTOR 2: SMURFING (72h Temporal Window)
    # ==========================================
    # Fan-In (Many to One)
    for receiver, group in df.groupby('receiverid'):
        if len(group['senderid'].unique()) >= 10:
            # Check if 10 distinct senders occur within any 72h window
            for i in range(len(group)):
                window = group[(group['timestamp'] >= group.iloc[i]['timestamp']) & 
                               (group['timestamp'] <= group.iloc[i]['timestamp'] + timedelta(hours=72))]
                unique_senders = window['senderid'].unique()
                if len(unique_senders) >= 10:
                    r_id = f"RING_{ring_counter:03d}"
                    ring_counter += 1
                    members = [str(receiver)] + [str(s) for s in unique_senders]
                    fraud_rings.append({
                        "ring_id": r_id, "member_accounts": members,
                        "pattern_type": "Smurfing (Fan-In)", "risk_score": 85.0
                    })
                    account_flags[receiver] = account_flags.get(receiver, {"patterns": set(), "ring_id": r_id, "base_score": 80.0})
                    account_flags[receiver]["patterns"].add("Smurf Aggregator")
                    break # Stop checking windows for this receiver once flagged

    # ==========================================
    # DETECTOR 3: LAYERED SHELLS (Pass-throughs)
    # ==========================================
    low_degree_nodes = [n for n, d in G.degree() if d <= 3 and G.in_degree(n) == 1 and G.out_degree(n) == 1]
    # Find chains of these pass-through nodes
    for node in low_degree_nodes:
        if node not in account_flags:
            account_flags[node] = {"patterns": set(), "ring_id": "SHELL_NET", "base_score": 70.0}
            account_flags[node]["patterns"].add("Shell Pass-through")

    # ==========================================
    # CONSOLIDATION & SCORING
    # ==========================================
    suspicious_accounts = []
    for acc, data in account_flags.items():
        # Score calculation: Base + Multiplicity (10 pts for multiple patterns)
        score = data["base_score"]
        if len(data["patterns"]) > 1:
            score = min(99.9, score + 10.0)
            
        suspicious_accounts.append({
            "account_id": str(acc),
            "suspicion_score": round(score, 1),
            "detected_patterns": list(data["patterns"]),
            "ring_id": data["ring_id"]
        })

    # Sort by score descending
    suspicious_accounts.sort(key=lambda x: x['suspicion_score'], reverse=True)
    p_time = round(time.time() - start_time, 3)

    # Format for Cytoscape.js Frontend
    graph_data = []
    for n in G.nodes():
        graph_data.append({"data": {"id": str(n), "label": str(n)[:6], "is_suspicious": n in account_flags}})
    for u, v, d in G.edges(data=True):
        graph_data.append({"data": {"source": str(u), "target": str(v), "amount": d['amount']}})

    return suspicious_accounts, fraud_rings, p_time, G.number_of_nodes(), graph_data