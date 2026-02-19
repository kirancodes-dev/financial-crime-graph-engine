# backend/config.py

class FraudConfig:
    # --- 1. Cycle Fraud Settings ---
    CYCLE_MAX_LENGTH = 6           
    CYCLE_BASE_POINTS = 10         
    
    # --- 2. Layered Shell Settings ---
    LAYER_MIN_DEPTH = 3            
    LAYER_POINTS = 15              
    
    # --- 3. Morphing / Smurfing Settings ---
    SMURF_MIN_UNIQUE_ACCOUNTS = 15 
    SMURF_MAX_AMOUNT = 3000        
    SMURF_POINTS = 20              

    # --- 4. Geo-Risk (Cross-Border) Settings ---
    HIGH_RISK_COUNTRIES = ['KY', 'KP', 'RU', 'PA', 'SY', 'IR'] # Cayman, North Korea, Russia, Panama, Syria, Iran
    GEO_RISK_POINTS = 15           # Points added for routing money offshore
    
    # --- 5. Analytics & Triage Rules ---
    FREEZE_THRESHOLD_SCORE = 20    
    MAX_NODES_TO_RENDER = 800