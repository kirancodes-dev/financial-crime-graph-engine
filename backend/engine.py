# backend/engine.py

import pandas as pd
import networkx as nx
import hashlib
from config import FraudConfig

class FraudEngine:
    def __init__(self, df: pd.DataFrame):
        self.df = df
        
        # --- BULLETPROOF DATA CLEANING ---
        self.df.columns = self.df.columns.str.strip().str.lower()
        col_mapping = {
            'time': 'timestamp', 'date': 'timestamp', 'datetime': 'timestamp', 'tx_time': 'timestamp',
            'sender': 'sender_id', 'source': 'sender_id', 'from': 'sender_id', 'origin': 'sender_id',
            'receiver': 'receiver_id', 'target': 'receiver_id', 'to': 'receiver_id', 'destination': 'receiver_id',
            'value': 'amount', 'amt': 'amount', 'tx_amount': 'amount'
        }
        self.df.rename(columns=col_mapping, inplace=True)

        if 'timestamp' not in self.df.columns:
            self.df['timestamp'] = pd.Timestamp.now()

        if not pd.api.types.is_datetime64_any_dtype(self.df['timestamp']):
            self.df['timestamp'] = pd.to_datetime(self.df['timestamp'], errors='coerce')
            self.df['timestamp'] = self.df['timestamp'].fillna(pd.Timestamp.now())
            
        all_accounts = pd.concat([self.df['sender_id'], self.df['receiver_id']]).unique()
        self.points = {account: 0 for account in all_accounts}
        self.fraud_rings = []
        self.suspicious_nodes = set()
        self.node_labels = {account: set() for account in self.points.keys()}
        self.node_fraud_count = {account: 0 for account in self.points.keys()}

        self.node_countries = {}
        for acc in all_accounts:
            h = int(hashlib.md5(str(acc).encode()).hexdigest(), 16)
            if h % 100 < 8: 
                self.node_countries[acc] = FraudConfig.HIGH_RISK_COUNTRIES[h % len(FraudConfig.HIGH_RISK_COUNTRIES)]
            else:
                standard = ['IN', 'US', 'GB', 'AE', 'SG']
                self.node_countries[acc] = standard[h % len(standard)]

    def assign_points(self, nodes, amount, fraud_type):
        for node in nodes:
            self.points[node] += amount
            self.suspicious_nodes.add(node)
            self.node_labels[node].add(fraud_type)
            self.node_fraud_count[node] += 1

    def detect_geo_risk(self):
        self.df['sender_country'] = self.df['sender_id'].map(self.node_countries)
        self.df['receiver_country'] = self.df['receiver_id'].map(self.node_countries)
        
        high_risk_set = set(FraudConfig.HIGH_RISK_COUNTRIES)
        cross_mask = self.df['sender_country'] != self.df['receiver_country']
        hr_mask = self.df['sender_country'].isin(high_risk_set) | self.df['receiver_country'].isin(high_risk_set)
        
        suspicious_geo = self.df[cross_mask & hr_mask]
        offshore_nodes = set(suspicious_geo['sender_id']).union(set(suspicious_geo['receiver_id']))
        
        for node in offshore_nodes:
            self.points[node] += FraudConfig.GEO_RISK_POINTS
            self.suspicious_nodes.add(node)
            self.node_labels[node].add('OFFSHORE_ROUTING')

    def detect_smurfing(self):
        df_low = self.df[self.df['amount'] <= FraudConfig.SMURF_MAX_AMOUNT]
        
        out_counts = df_low.groupby('sender_id')['receiver_id'].nunique()
        fan_outs = out_counts[out_counts >= FraudConfig.SMURF_MIN_UNIQUE_ACCOUNTS].index.tolist()
        for boss in fan_outs:
            receivers = df_low[df_low['sender_id'] == boss]['receiver_id'].unique()
            self.assign_points([boss], FraudConfig.SMURF_POINTS, 'SMURF_BOSS')
            self.assign_points(receivers, FraudConfig.SMURF_POINTS // 2, 'SMURF_MULE')
            self.fraud_rings.append({
                "ring_id": f"SMURF_OUT_{str(boss)[-4:]}",
                "pattern_type": "Fan-Out Smurfing",
                "nodes": [boss] + list(receivers),
                "score": FraudConfig.SMURF_POINTS
            })

        in_counts = df_low.groupby('receiver_id')['sender_id'].nunique()
        fan_ins = in_counts[in_counts >= FraudConfig.SMURF_MIN_UNIQUE_ACCOUNTS].index.tolist()
        for target in fan_ins:
            senders = df_low[df_low['receiver_id'] == target]['sender_id'].unique()
            self.assign_points([target], FraudConfig.SMURF_POINTS, 'SMURF_TARGET')
            self.assign_points(senders, FraudConfig.SMURF_POINTS // 2, 'SMURF_SENDER')
            self.fraud_rings.append({
                "ring_id": f"SMURF_IN_{str(target)[-4:]}",
                "pattern_type": "Fan-In Aggregation",
                "nodes": [target] + list(senders),
                "score": FraudConfig.SMURF_POINTS
            })

    def detect_cycles(self):
        out_degree = self.df['sender_id'].value_counts()
        in_degree = self.df['receiver_id'].value_counts()
        valid_nodes = set(out_degree.index).intersection(set(in_degree.index))
        df_pruned = self.df[self.df['sender_id'].isin(valid_nodes) & self.df['receiver_id'].isin(valid_nodes)]
        
        G_multi = nx.from_pandas_edgelist(df_pruned, 'sender_id', 'receiver_id', ['amount'], create_using=nx.MultiDiGraph())
        G_simple = nx.DiGraph(G_multi)
        
        try:
            cycles = list(nx.simple_cycles(G_simple, length_bound=FraudConfig.CYCLE_MAX_LENGTH))
            for i, cycle in enumerate(cycles):
                if len(cycle) > 2:
                    edge_counts = [G_multi.number_of_edges(cycle[j], cycle[(j + 1) % len(cycle)]) for j in range(len(cycle))]
                    loop_completions = min(edge_counts)
                    
                    if loop_completions > 0:
                        pts = loop_completions * FraudConfig.CYCLE_BASE_POINTS
                        self.assign_points(cycle, pts, 'CYCLE')
                        self.fraud_rings.append({
                            "ring_id": f"CYCLE_{i+1}",
                            "pattern_type": f"Cyclic Wash ({loop_completions}x loops)",
                            "nodes": cycle,
                            "score": pts * len(cycle)
                        })
        except Exception:
            pass

    def detect_layered_shells(self):
        df_sorted = self.df.sort_values('timestamp')
        G = nx.from_pandas_edgelist(df_sorted, 'sender_id', 'receiver_id', create_using=nx.DiGraph())
        
        for node in G.nodes():
            if G.out_degree(node) > 0 and G.in_degree(node) == 0:
                edges = nx.bfs_edges(G, node, depth_limit=FraudConfig.LAYER_MIN_DEPTH + 1)
                chain = [node]
                for u, v in edges:
                    if v not in chain: chain.append(v)
                
                if len(chain) > FraudConfig.LAYER_MIN_DEPTH:
                    self.assign_points(chain, FraudConfig.LAYER_POINTS, 'LAYERED')
                    self.fraud_rings.append({
                        "ring_id": f"SHELL_{str(node)[-4:]}",
                        "pattern_type": "Layered Structuring",
                        "nodes": chain,
                        "score": FraudConfig.LAYER_POINTS
                    })

    def run_analysis(self):
        self.detect_geo_risk()
        self.detect_smurfing()
        self.detect_cycles()
        self.detect_layered_shells()
        
        self.fraud_rings.sort(key=lambda x: x['score'], reverse=True)
        if self.fraud_rings:
            self.fraud_rings[0]['is_highest_risk'] = True

        return self.generate_ui_payload()

    def generate_ui_payload(self):
        G = nx.from_pandas_edgelist(self.df, 'sender_id', 'receiver_id', ['amount', 'timestamp'], create_using=nx.DiGraph())
        
        nodes_to_render = set(self.suspicious_nodes)
        if not nodes_to_render:
            nodes_to_render = set(list(G.nodes())[:100])
        else:
            neighbors = set()
            for n in nodes_to_render:
                neighbors.update(G.successors(n))
                neighbors.update(G.predecessors(n))
            nodes_to_render.update(neighbors)

        nodes_to_render = set(list(nodes_to_render)[:FraudConfig.MAX_NODES_TO_RENDER])
        subgraph = G.subgraph(nodes_to_render)

        # --- NEW: ADVANCED MATH - SHADOW BOSS DETECTION ---
        # Calculate Betweenness Centrality to find critical bridges in the network
        try:
            centrality = nx.betweenness_centrality(subgraph)
            # Find the top 3% most central nodes
            if centrality:
                threshold = sorted(centrality.values(), reverse=True)[:max(1, len(centrality)//33)][-1]
            else:
                threshold = 1.0
        except Exception:
            centrality = {}
            threshold = 1.0

        history = {n: [] for n in nodes_to_render}
        totals = {n: {'sent': 0.0, 'received': 0.0} for n in nodes_to_render}
        self.df['timestamp'] = self.df['timestamp'].astype(str)
        
        for record in self.df.to_dict('records'):
            s, r, amt, time, tid = record['sender_id'], record['receiver_id'], record['amount'], record['timestamp'], record.get('transaction_id', 'N/A')
            
            if s in nodes_to_render:
                totals[s]['sent'] += amt
                if len(history[s]) < 50: 
                    history[s].append({'type': 'SENT', 'counterparty': r, 'amount': amt, 'time': time, 'tx_id': tid})
            if r in nodes_to_render:
                totals[r]['received'] += amt
                if len(history[r]) < 50:
                    history[r].append({'type': 'RECEIVED', 'counterparty': s, 'amount': amt, 'time': time, 'tx_id': tid})

        accounts_to_freeze = [n for n in self.suspicious_nodes if self.points.get(n, 0) >= FraudConfig.FREEZE_THRESHOLD_SCORE]
        
        analytics = {
            "total_transactions": len(self.df),
            "flagged_entities": len(self.suspicious_nodes),
            "freeze_recommendations": len(accounts_to_freeze),
            "max_risk_score": max(self.points.values()) if self.points else 0
        }

        graph_data = []
        for node in nodes_to_render:
            labels = list(self.node_labels.get(node, []))
            primary_label = labels[0] if labels else 'NORMAL'
            if len(labels) > 1: primary_label = 'OVERLAPPING_FRAUD'
            
            # --- APPLY SHADOW BOSS LABEL ---
            is_shadow_boss = centrality.get(node, 0) >= threshold and centrality.get(node, 0) > 0
            if is_shadow_boss:
                if primary_label == 'NORMAL':
                    primary_label = 'SHADOW_BOSS'
                else:
                    primary_label = 'SHADOW_BOSS_OVERLAP'
                self.points[node] += 30 # Huge penalty for being a central coordinator

            recommend_freeze = node in accounts_to_freeze or is_shadow_boss
            country = self.node_countries.get(node, 'IN')
            
            ui_label = f"🛑 {node}\n[{country}]" if recommend_freeze else f"{node}\n[{country}]"

            graph_data.append({
                "data": {
                    "id": str(node),
                    "label": ui_label,
                    "country": country,
                    "is_suspicious": node in self.suspicious_nodes or is_shadow_boss,
                    "fraud_type": primary_label,
                    "risk_score": self.points.get(node, 0),
                    "fraud_count": self.node_fraud_count.get(node, 0),
                    "total_sent": totals[node]['sent'],
                    "total_received": totals[node]['received'],
                    "history": history[node],
                    "recommend_freeze": recommend_freeze
                }
            })
            
        for u, v, data in subgraph.edges(data=True):
            graph_data.append({
                "data": {
                    "source": str(u),
                    "target": str(v),
                    "amount": f"{data.get('amount', 0):.2f}",
                    "timestamp": data.get('timestamp', ''),
                    "is_fraudulent": (u in self.suspicious_nodes and v in self.suspicious_nodes)
                }
            })
                
        return {
            "analytics": analytics,
            "graph_data": graph_data,
            "fraud_rings": self.fraud_rings[:25], 
            "summary": "Analysis Complete"
        }