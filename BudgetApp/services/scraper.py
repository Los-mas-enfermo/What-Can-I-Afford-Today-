import re
import requests
import statistics

from datetime import datetime
from services.persistence import save_gas_price


GROCERY_BRAND_WEIGHTS = {
    "whole foods": 1.25, "gelson": 1.30, "bristol farms": 1.35, 
    "safeway": 1.00, "kroger": 1.00, "publix": 1.02, "albertsons": 1.00, 
    "vons": 1.00, "ralphs": 1.00, "aldi": 0.85, "walmart": 0.85, 
    "winco": 0.82, "lidl": 0.86, "trader joes": 0.98, "costco": 0.90
}

def get_grocery_temporal_adjustment():
    now = datetime.now()
    day = now.weekday()
    hour = now.hour
    adjustment = 1.0
    if day == 2: adjustment -= 0.020
    elif day == 1: adjustment -= 0.010
    elif day in [4, 5, 6]: adjustment += 0.015
    if 6 <= hour <= 9: adjustment -= 0.010
    return adjustment

def get_grocery_brand_adjustment(store_name):
    name_lower = store_name.lower()
    for brand, weight in GROCERY_BRAND_WEIGHTS.items():
        if brand in name_lower: return weight
    return 1.0

BRAND_WEIGHTS = {
    "costco": 0.88, "sams club": 0.88, "safeway": 0.92, "kroger": 0.95,
    "arco": 0.93, "shell": 1.10, "chevron": 1.12, "mobil": 1.10, 
    "exxon": 1.08, "7-eleven": 1.00, "bp": 1.05, "valero": 0.98
}

def get_temporal_adjustment():
    now = datetime.now()
    day = now.weekday()
    hour = now.hour
    adjustment = 1.0
    if day in [0, 6]: adjustment -= 0.015
    elif day in [2, 3, 4]: adjustment += 0.015
    if 6 <= hour <= 9 or 18 <= hour <= 21: adjustment -= 0.005
    return adjustment

def get_brand_adjustment(store_name):
    name_lower = store_name.lower()
    for brand, weight in BRAND_WEIGHTS.items():
        if brand in name_lower: return weight
    return 1.0

from bs4 import BeautifulSoup

def extract_prices_from_text(text):
    if not text: return []
    potential_matches = re.finditer(r'\$(\d+\.\d{2})', text)
    valid_prices = []
    for match in potential_matches:
        price_val = float(match.group(1))
        start, end = match.span()
        context = text[max(0, start-25):min(len(text), end+25)].lower()
        bad_keywords = ["star", "rating", "review", "mile", "distanc", "km", "off", "discount"]
        if any(kw in context for kw in bad_keywords):
            continue
        valid_prices.append(price_val)
    return valid_prices

def fallback_search_prices(query):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
        resp = requests.get(url, headers=headers, timeout=5)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        return extract_prices_from_text(soup.get_text())
    except Exception: return []

def parse_item_quantity(item_string):
    match = re.search(r'^([\d\.]+)\s+(.*)', item_string.strip())
    if match:
        try: return float(match.group(1)), match.group(2)
        except ValueError: pass
    return 1.0, item_string.strip()

def clean_item_for_query(item_name):
    cleaned = re.sub(r'^(gallons?\s+of|lbs?\s+of|bags?\s+of|bunches?\s+of|pounds?\s+of|boxes?\s+of|dozens?\s+of|packs?\s+of)\s+', '', item_name, flags=re.IGNORECASE)
    return cleaned.strip()

def is_prohibited(item_name):
    forbidden = ["fuck", "shit", "bitch", "asshole", "cunt", "dick", "pussy", "electricity", "utility bill", "power bill", "water bill", "electric bill"]
    return any(w in item_name.lower() for w in forbidden)

def get_item_heuristics(item_name):
    item = item_name.lower()
    if any(k in item for k in ["gas", "fuel", "unleaded"]): return (3.00, 6.00, 4.20)
    elif "diesel" in item: return (3.50, 7.00, 4.80)
    elif any(k in item for k in ["ev", "charging", "kw"]): return (0.10, 0.80, 0.35)
    elif "milk" in item: return (2.00, 7.00, 3.80)
    elif "bread" in item: return (1.50, 6.00, 3.20)
    elif "egg" in item: return (2.00, 8.00, 3.90)
    elif "chicken" in item: return (3.00, 15.00, 5.50)
    elif any(k in item for k in ["orange", "apple", "banana", "produce", "tomato"]): return (0.40, 6.00, 2.20)
    elif any(k in item for k in ["beef", "pork", "meat", "steak"]): return (4.00, 25.00, 8.50)
    return (0.50, 30.00, 5.00)

def get_geographic_multiplier(zip_code):
    if not zip_code: return 1.0
    s = str(zip_code).upper()
    if any(k in s for k in ["HI", "HAWAII", "NYC", "NY", "SF"]): return 1.65
    if any(k in s for k in ["CA", "CALIFORNI", "ALASKA", "AK", "WA", "SEATTLE", "MA", "BOSTON"]): return 1.35
    if any(k in s for k in ["IL", "CHICAGO", "CO", "FL", "MIAMI", "TX", "AUSTIN", "VA", "MD", "NJ"]): return 1.15
    if any(k in s for k in ["GA", "ATLANTA", "NC", "SC", "TX", "TN"]): return 1.00
    if s.isdigit() and len(s) >= 5:
        p = int(s[:2])
        if p in [96, 99, 10, 94]: return 1.65
        if p in [90, 91, 92, 93, 11, 98, 2, 1]: return 1.30
        if p in [60, 80, 20]: return 1.15
    return 0.90

def calculate_source_median(prices, store_name=None):
    if not prices: return None
    prices.sort()
    n = len(prices)
    if n >= 4: filtered = prices[n//4:]
    elif n >= 2: filtered = prices[1:]
    else: filtered = prices
    if not filtered: return statistics.median(prices)
    m = statistics.median(filtered)
    confidence_weight = min(1.0, 0.75 + (n * 0.05))
    adj = get_temporal_adjustment()
    if store_name: adj *= get_brand_adjustment(store_name)
    return m * adj * confidence_weight + m * adj * (1-confidence_weight)

def get_weighted_fuel_price(zip_code, radius, item, ddgs):
    queries = [f"AAA gas prices {zip_code}", f"GasBuddy prices {zip_code}", f"Gas station prices {zip_code} {item}"]
    all_prices = []
    # Run sequentially within the store thread to avoid thread-safety issues with single ddgs instance
    for q in queries:
        try:
            res = ddgs.text(q, max_results=3)
            all_prices.extend(extract_prices_from_text(" ".join([r.get("body", "") for r in res])))
        except: 
            # Fallback to direct request if ddgs fails
            all_prices.extend(fallback_search_prices(q))
    return calculate_source_median(all_prices)

def get_weighted_grocery_price(zip_code, radius, item, ddgs):
    queries = [f"Walmart price of {item} in {zip_code}", f"Kroger price of {item} in {zip_code}", f"current cost of {item} in {zip_code} stores"]
    all_prices = []
    for q in queries:
        try:
            res = ddgs.text(q, max_results=3)
            all_prices.extend(extract_prices_from_text(" ".join([r.get("body", "") for r in res])))
        except: 
            all_prices.extend(fallback_search_prices(q))
    med = calculate_source_median(all_prices)
    return med * get_grocery_temporal_adjustment() if med else None

def scrape_store(store, zip_code, items, radius=10):
    store_data = {"store": store["name"], "type": store.get("type", "grocery"), "prices": {}}
    total = 0.0
    try:
        from duckduckgo_search import DDGS
        ddgs = DDGS()
        use_ddgs = True
    except: use_ddgs = False
    geo_mult = get_geographic_multiplier(zip_code)

    for orig_item in items:
        if is_prohibited(orig_item): continue
        qty, item_name = parse_item_quantity(orig_item)
        search_item = clean_item_for_query(item_name)
        is_fuel = any(k in search_item.lower() for k in ["gas", "fuel", "diesel", "ev"])
        if store["type"] == "fuel" and not is_fuel: continue
        if store["type"] == "grocery" and is_fuel: continue

        override = None
        if use_ddgs:
            try:
                if is_fuel: override = get_weighted_fuel_price(zip_code, radius, search_item, ddgs)
                else: override = get_weighted_grocery_price(zip_code, radius, search_item, ddgs)
            except: override = None
            
        if not override:
            min_p, max_p, base_p = get_item_heuristics(search_item)
            avg_p = base_p * geo_mult
        else:
            avg_p = override

        avg_p = round(avg_p, 2)
        total_p = round(avg_p * qty, 2)
        store_data["prices"][orig_item] = {"unit_price": avg_p, "qty": qty, "total": total_p}
        total += total_p

    store_data["total"] = round(total, 2)
    return store_data
