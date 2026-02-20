import pandas as pd
import networkx as nx
import numpy as np
import hashlib
import re

class FraudConfig:
    HIGH_RISK_COUNTRIES = ['KY', 'PA', 'VG', 'CY', 'BS']
    GEO_RISK_POINTS = 15
    SMURF_MAX_AMOUNT = 10000
    SMURF_MIN_UNIQUE_ACCOUNTS = 10
    SMURF_STD_DEV_TOLERANCE = 0.15
    SMURF_POINTS = 20
    CYCLE_MAX_LENGTH = 6
    CYCLE_BASE_POINTS = 10
    LAYER_MIN_DEPTH = 3
    LAYER_CUT_PERCENTAGE = 0.05
    LAYER_POINTS = 15
    FREEZE_THRESHOLD_SCORE = 40
    MAX_NODES_TO_RENDER = 800

class FraudEngine:
    def __init__(self, df: pd.DataFrame):
        self.df = self._universal_data_cleaner(df)
        all_accounts = pd.concat([self.df['sender_id'], self.df['receiver_id']]).dropna().unique()
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

    def _universal_data_cleaner(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.dropna(how='all')
        df.columns = df.columns.astype(str).str.strip().str.lower()
        mapping = {}
        for col in df.columns:
            if re.search(r'sender|source|from|origin|payer', col): mapping[col] = 'sender_id'
            elif re.search(r'receiver|target|to|dest|beneficiary|payee', col): mapping[col] = 'receiver_id'
            elif re.search(r'amount|value|amt|total|price', col): mapping[col] = 'amount'
            elif re.search(r'time|date|created', col): mapping[col] = 'timestamp'
            elif re.search(r'id|txid|reference|hash', col): mapping[col] = 'transaction_id'
        df.rename(columns=mapping, inplace=True)

        required = ['sender_id', 'receiver_id', 'amount']
        missing = [col for col in required if col not in df.columns]
        if missing: raise ValueError(f"CSV Missing logical columns for: {', '.join(missing)}")
        
        if 'timestamp' not in df.columns: df['timestamp'] = pd.Timestamp.now()
        if 'transaction_id' not in df.columns: df['transaction_id'] = [f"GEN_TX_{i}" for i in range(len(df))]

        df['sender_id'] = df['sender_id'].astype(str).str.strip()
        df['receiver_id'] = df['receiver_id'].astype(str).str.strip()
        df['amount'] = df['amount'].astype(str).str.replace(r'[^\d\.-]', '', regex=True)
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce').fillna(0.0)
        df = df[df['amount'] > 0].copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce').fillna(pd.Timestamp.now())
        return df

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
            self.assign_points([node], FraudConfig.GEO_RISK_POINTS, 'OFFSHORE_ROUTING')

    def detect_smurfing(self):
        df_low = self.df[self.df['amount'] <= FraudConfig.SMURF_MAX_AMOUNT]
        out_counts = df_low.groupby('sender_id')
        for sender, group in out_counts:
            receivers = group['receiver_id'].unique()
            if len(receivers) >= FraudConfig.SMURF_MIN_UNIQUE_ACCOUNTS:
                amounts = group['amount'].values
                mean_amt = np.mean(amounts)
                std_dev = np.std(amounts)
                is_uniform = std_dev < (FraudConfig.SMURF_STD_DEV_TOLERANCE * mean_amt) if mean_amt > 0 else False
                score = FraudConfig.SMURF_POINTS if is_uniform else FraudConfig.SMURF_POINTS // 2
                self.assign_points([sender], score, 'SMURF_BOSS_UNIFORM' if is_uniform else 'SMURF_BOSS')
                self.assign_points(receivers, score // 2, 'SMURF_MULE')
                self.fraud_rings.append({"ring_id": f"SMURF_OUT_{str(sender)[-4:]}", "pattern_type": "Structured Fan-Out", "member_count": len(receivers) + 1, "nodes": [sender] + list(receivers), "score": score})

        in_counts = df_low.groupby('receiver_id')
        for target, group in in_counts:
            senders = group['sender_id'].unique()
            if len(senders) >= FraudConfig.SMURF_MIN_UNIQUE_ACCOUNTS:
                amounts = group['amount'].values
                mean_amt = np.mean(amounts)
                std_dev = np.std(amounts)
                is_uniform = std_dev < (FraudConfig.SMURF_STD_DEV_TOLERANCE * mean_amt) if mean_amt > 0 else False
                score = FraudConfig.SMURF_POINTS if is_uniform else FraudConfig.SMURF_POINTS // 2
                self.assign_points([target], score, 'SMURF_TARGET_UNIFORM' if is_uniform else 'SMURF_TARGET')
                self.assign_points(senders, score // 2, 'SMURF_SENDER')
                self.fraud_rings.append({"ring_id": f"SMURF_IN_{str(target)[-4:]}", "pattern_type": "Structured Fan-In", "member_count": len(senders) + 1, "nodes": [target] + list(senders), "score": score})

    def detect_cycles(self):
        G_multi = nx.from_pandas_edgelist(self.df, 'sender_id', 'receiver_id', ['amount'], create_using=nx.MultiDiGraph())
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
                        self.fraud_rings.append({"ring_id": f"CYCLE_{i+1}", "pattern_type": f"Cyclic Wash ({loop_completions}x)", "member_count": len(cycle), "nodes": list(cycle), "score": pts * len(cycle)})
        except Exception:
            pass

    def run_analysis(self):
        self.detect_geo_risk()
        self.detect_smurfing()
        self.detect_cycles()
        self.fraud_rings.sort(key=lambda x: x['score'], reverse=True)
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

        try:
            centrality = nx.betweenness_centrality(subgraph)
            threshold = sorted(centrality.values(), reverse=True)[:max(1, len(centrality)//33)][-1] if centrality else 1.0
        except Exception:
            centrality, threshold = {}, 1.0

        history = {n: [] for n in nodes_to_render}
        totals = {n: {'sent': 0.0, 'received': 0.0} for n in nodes_to_render}
        node_metadata = {n: {} for n in nodes_to_render}
        core_fields = ['sender_id', 'receiver_id', 'amount', 'timestamp']
        
        for record in self.df.to_dict('records'):
            s, r, amt, time = record['sender_id'], record['receiver_id'], record['amount'], str(record['timestamp'])
            metadata = {str(k).upper(): str(v) for k, v in record.items() if k not in core_fields and pd.notna(v)}
            if s in nodes_to_render:
                totals[s]['sent'] += amt
                node_metadata[s].update(metadata)
                if len(history[s]) < 30: history[s].append({'type': 'SENT', 'counterparty': str(r), 'amount': amt, 'time': time})
            if r in nodes_to_render:
                totals[r]['received'] += amt
                node_metadata[r].update(metadata)
                if len(history[r]) < 30: history[r].append({'type': 'RECEIVED', 'counterparty': str(s), 'amount': amt, 'time': time})

        accounts_to_freeze = [n for n in self.suspicious_nodes if self.points.get(n, 0) >= FraudConfig.FREEZE_THRESHOLD_SCORE]
        
        graph_data = []
        for node in nodes_to_render:
            labels = list(self.node_labels.get(node, []))
            primary_label = labels[0] if labels else 'NORMAL'
            is_shadow_boss = centrality.get(node, 0) >= threshold and centrality.get(node, 0) > 0
            if is_shadow_boss:
                primary_label = 'SHADOW_BOSS'
                self.points[node] += 30 
            
            recommend_freeze = node in accounts_to_freeze or is_shadow_boss
            country = self.node_countries.get(node, 'IN')
            graph_data.append({
                "data": {
                    "id": str(node), "label": f"{'🛑 ' if recommend_freeze else ''}{node}\n[{country}]", "country": country,
                    "is_suspicious": node in self.suspicious_nodes or is_shadow_boss, "fraud_type": primary_label,
                    "risk_score": self.points.get(node, 0), "total_sent": totals[node]['sent'],
                    "total_received": totals[node]['received'], "history": history[node], 
                    "metadata": node_metadata[node], "recommend_freeze": recommend_freeze
                }
            })
            
        for u, v, data in subgraph.edges(data=True):
            graph_data.append({
                "data": {
                    "source": str(u), "target": str(v), "amount": f"{data.get('amount', 0):.2f}",
                    "timestamp": str(data.get('timestamp', '')), "is_fraudulent": (u in self.suspicious_nodes and v in self.suspicious_nodes)
                }
            })
                
        return {
            "analytics": {
                "total_transactions": len(self.df), "flagged_entities": len(self.suspicious_nodes),
                "freeze_recommendations": len(accounts_to_freeze), "max_risk_score": max(self.points.values()) if self.points else 0
            },
            "graph_data": graph_data,
            "fraud_rings": self.fraud_rings[:25]
        }