import pandas as pd
import random
import sys
from datetime import datetime, timedelta

def generate_synthetic_data(num_normal=450, is_crypto=False):
    transactions = []
    txn_counter = 1
    start_time = datetime(2026, 2, 19, 8, 0, 0)

    # Helper function to generate authentic-looking addresses
    def gen_address(prefix, is_fraud=False):
        if is_crypto:
            if is_fraud:
                return f"bc1q_{prefix}_{random.randint(1000, 9999)}" # Bitcoin SegWit style
            # Randomly mix BTC, HBAR, and Ethereum(SAND) style addresses
            choice = random.choice(['btc', 'hbar', 'eth'])
            if choice == 'btc': return f"bc1q{random.randint(10000000, 99999999)}"
            if choice == 'hbar': return f"0.0.{random.randint(100000, 999999)}"
            if choice == 'eth': return f"0x{random.randint(10000000, 99999999)}...SAND"
        else:
            return prefix if is_fraud else f"ACC_{random.randint(1000, 9999)}"

    def add_txn(sender, receiver, amount, time_offset_mins):
        nonlocal txn_counter
        transactions.append({
            "transaction_id": f"TXN_{txn_counter:04d}",
            "sender_id": sender,
            "receiver_id": receiver,
            "amount": amount if not is_crypto else round(amount * 0.0015, 4), # Scale down for crypto amounts
            "timestamp": (start_time + timedelta(minutes=time_offset_mins)).isoformat()
        })
        txn_counter += 1

    # 1. Generate Normal "Noise"
    normal_accounts = [gen_address("NORM") for _ in range(100)]
    for _ in range(num_normal):
        sender = random.choice(normal_accounts)
        receiver = random.choice(normal_accounts)
        while receiver == sender: receiver = random.choice(normal_accounts)
        add_txn(sender, receiver, round(random.uniform(10, 500), 2), random.randint(1, 1440))

    # 2. FRAUD RING 1: Cyclic Wash
    f1, f2, f3 = gen_address("WASH_A", True), gen_address("WASH_B", True), gen_address("WASH_C", True)
    add_txn(f1, f2, 9500.00, 100)
    add_txn(f2, f3, 9450.00, 105)
    add_txn(f3, f1, 9400.00, 110)

    # 3. FRAUD RING 2: Fan-Out Muling
    boss = gen_address("BOSS", True)
    mules = [gen_address(f"MULE_{i}", True) for i in range(1, 5)]
    target = gen_address("CLEAN_TARGET", True)
    
    for i, mule in enumerate(mules):
        add_txn(boss, mule, 2000.00, 200 + i)
        add_txn(mule, target, 1950.00, 300 + i)

    # 4. FRAUD RING 3: The Smurfing Operation (Structuring)
    # Sending multiple transactions just under $10,000 to avoid IRS/banking alerts
    smurfer = gen_address("SHADY_CORP", True)
    add_txn(smurfer, gen_address("SHELL_1", True), 9950.00, 400)
    add_txn(smurfer, gen_address("SHELL_2", True), 9800.00, 405)
    add_txn(smurfer, gen_address("SHELL_3", True), 9900.00, 410)

    # Export
    df = pd.DataFrame(transactions).sort_values(by="timestamp").reset_index(drop=True)
    filename = "crypto_ledger_demo.csv" if is_crypto else "fiat_banking_demo.csv"
    df.to_csv(filename, index=False)
    print(f"✅ Generated {filename} with Web3 tracing: {is_crypto}")

if __name__ == "__main__":
    is_crypto = '--crypto' in sys.argv
    generate_synthetic_data(num_normal=400, is_crypto=is_crypto)