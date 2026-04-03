import json
import os
from datetime import datetime

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "gas_price_history.json")

def save_gas_price(zip_code, fuel_type, price):
    history = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r") as f:
                history = json.load(f)
        except: pass
    key = f"{zip_code}_{fuel_type.lower()}"
    if key not in history: history[key] = []
    history[key].append({"price": price, "timestamp": datetime.now().isoformat()})
    history[key] = history[key][-10:]
    with open(DATA_FILE, "w") as f: json.dump(history, f, indent=2)

def get_gas_price_history(zip_code, fuel_type):
    if not os.path.exists(DATA_FILE): return []
    try:
        with open(DATA_FILE, "r") as f:
            history = json.load(f)
        key = f"{zip_code}_{fuel_type.lower()}"
        return history.get(key, [])
    except: return []
