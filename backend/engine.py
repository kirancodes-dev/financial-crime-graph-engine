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
    # Velocity detection
    VELOCITY_WINDOW_HOURS = 1
    VELOCITY_MIN_TXN = 8          # transactions in window to flag
    VELOCITY_POINTS = 25
    # Round-trip detection
    ROUND_TRIP_POINTS = 18

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

    def detect_velocity_burst(self):
        """Flag accounts sending an unusually high number of txns in a short rolling window."""
        df = self.df.copy()
        df['ts_epoch'] = df['timestamp'].astype(np.int64) // 10**9  # seconds
        window_sec = FraudConfig.VELOCITY_WINDOW_HOURS * 3600
        sender_groups = df.groupby('sender_id')
        for sender, group in sender_groups:
            times = sorted(group['ts_epoch'].tolist())
            # Sliding window count
            for i, t_start in enumerate(times):
                count = sum(1 for t in times[i:] if t - t_start <= window_sec)
                if count >= FraudConfig.VELOCITY_MIN_TXN:
                    self.assign_points([sender], FraudConfig.VELOCITY_POINTS, 'VELOCITY_BURST')
                    self.fraud_rings.append({
                        "ring_id": f"VEL_{str(sender)[-4:]}",
                        "pattern_type": f"Velocity Burst ({count} txns/{FraudConfig.VELOCITY_WINDOW_HOURS}h)",
                        "member_count": 1,
                        "nodes": [sender],
                        "score": FraudConfig.VELOCITY_POINTS
                    })
                    break  # one flag per sender is enough

    def detect_round_trips(self):
        """Detect A→B and B→A flows with matching amounts (±5%): classic layering."""
        # Build a map: (sender, receiver) -> list of amounts
        fwd: dict = {}
        for _, row in self.df.iterrows():
            key = (str(row['sender_id']), str(row['receiver_id']))
            fwd.setdefault(key, []).append(float(row['amount']))
        
        seen: set = set()
        for (a, b), amts_fwd in fwd.items():
            if (b, a) in fwd and (a, b) not in seen and (b, a) not in seen:
                amts_rev = fwd[(b, a)]
                # Check if any forward amount matches any reverse amount within 5%
                for af in amts_fwd:
                    for ar in amts_rev:
                        if af > 0 and abs(af - ar) / af <= 0.05:
                            seen.add((a, b))
                            self.assign_points([a, b], FraudConfig.ROUND_TRIP_POINTS, 'ROUND_TRIP')
                            self.fraud_rings.append({
                                "ring_id": f"RT_{a[-4:]}_{b[-4:]}",
                                "pattern_type": "Round-Trip Layering",
                                "member_count": 2,
                                "nodes": [a, b],
                                "score": FraudConfig.ROUND_TRIP_POINTS * 2
                            })
                            break
                    else:
                        continue
                    break

    def run_analysis(self):
        self.detect_geo_risk()
        self.detect_smurfing()
        self.detect_cycles()
        self.detect_velocity_burst()
        self.detect_round_trips()
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

        # ── Network-level statistics ──────────────────────────────────────────
        all_scores = list(self.points.values())
        avg_risk = float(np.mean(all_scores)) if all_scores else 0.0
        try:
            density = float(nx.density(subgraph))
        except Exception:
            density = 0.0
        try:
            ug = subgraph.to_undirected()
            cc = float(nx.average_clustering(ug)) if len(ug) > 1 else 0.0
        except Exception:
            cc = 0.0

        # ── Daily timeline (for sparkline chart) ─────────────────────────────
        self.df['date_str'] = self.df['timestamp'].dt.strftime('%Y-%m-%d')
        daily = self.df.groupby('date_str').agg(
            volume=('amount', 'sum'),
            count=('amount', 'count')
        ).reset_index()
        # Mark days with flagged activity
        flagged_ids = self.suspicious_nodes
        flagged_mask = self.df['sender_id'].isin(flagged_ids) | self.df['receiver_id'].isin(flagged_ids)
        flagged_daily = self.df[flagged_mask].groupby('date_str').size().reset_index(name='flagged')
        daily = daily.merge(flagged_daily, on='date_str', how='left').fillna(0)
        timeline = [
            {"date": row['date_str'], "volume": round(row['volume'], 2), "count": int(row['count']), "flagged": int(row['flagged'])}
            for _, row in daily.iterrows()
        ]

        # ── Fraud type breakdown ──────────────────────────────────────────────
        fraud_type_counts: dict[str, int] = {}
        for node in self.suspicious_nodes:
            for label in self.node_labels.get(node, []):
                fraud_type_counts[label] = fraud_type_counts.get(label, 0) + 1

        # ── Flagged entities list (for CSV export) ────────────────────────────
        flagged_entities = []
        for node in nodes_to_render:
            if node in self.suspicious_nodes or node in accounts_to_freeze:
                flagged_entities.append({
                    "account_id": str(node),
                    "risk_score": self.points.get(node, 0),
                    "country": self.node_countries.get(node, 'IN'),
                    "fraud_types": "|".join(self.node_labels.get(node, [])),
                    "total_sent": round(totals[node]['sent'], 2),
                    "total_received": round(totals[node]['received'], 2),
                    "recommend_freeze": node in accounts_to_freeze
                })
        flagged_entities.sort(key=lambda x: x['risk_score'], reverse=True)

        accounts_to_freeze_list = [
            {"account_id": str(n), "risk_score": self.points.get(n, 0),
             "country": self.node_countries.get(n, 'IN'),
             "fraud_types": "|".join(self.node_labels.get(n, []))}
            for n in accounts_to_freeze
        ]

        return {
            "analytics": {
                "total_transactions": len(self.df),
                "flagged_entities": len(self.suspicious_nodes),
                "freeze_recommendations": len(accounts_to_freeze),
                "max_risk_score": max(self.points.values()) if self.points else 0,
                "avg_risk_score": round(avg_risk, 1),
                "network_density": round(density, 4),
                "clustering_coefficient": round(cc, 4),
                "fraud_pattern_count": len(self.fraud_rings),
            },
            "graph_data": graph_data,
            "fraud_rings": self.fraud_rings[:25],
            "timeline": timeline,
            "fraud_type_breakdown": fraud_type_counts,
            "flagged_entities": flagged_entities,
        }