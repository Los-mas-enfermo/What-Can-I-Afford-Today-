import concurrent.futures
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict
from services.store_finder import find_stores
from services.scraper import scrape_store
from services.predictor import predict_prices
import re

router = APIRouter()

class SearchRequest(BaseModel):
    zip: Optional[str] = None
    radius: int = 10
    items: Optional[List[str]] = []
    origin_zip: Optional[str] = None
    dest_zip: Optional[str] = None

def clean_zip_code(zip_input):
    if not zip_input: return ""
    s = str(zip_input).strip()
    # If it has a comma or letters, it's likely a City, State or Address - KEEP IT
    if "," in s or any(c.isalpha() for c in s):
        return s
    # If it's pure numbers, try to extract a 5-digit ZIP
    match = re.search(r'(\d{5})', s)
    if match: return match.group(1)
    # Otherwise return as-is
    return s

@router.post("/search")
def search(data: SearchRequest):
    is_commute = bool(data.origin_zip and data.dest_zip)
    zips_to_check = []
    
    if is_commute:
        origin = clean_zip_code(data.origin_zip)
        dest = clean_zip_code(data.dest_zip)
        if origin: zips_to_check.append(origin)
        if dest: zips_to_check.append(dest)
    else:
        target_zip = clean_zip_code(data.zip if data.zip else "90210")
        zips_to_check = [target_zip]

    grouped_results = {} # ZIP/Location -> list of store results
    items_to_search = data.items if (data.items and len(data.items) > 0) else ["4 gallons of milk", "12 gallons of Gas", "5 lbs of Tomatoes"]

    all_scraped_data = [] # for prediction engine

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_zip = {}
        for z in zips_to_check:
            stores = find_stores(z, data.radius)
            grouped_results[z] = []
            for store in stores:
                future = executor.submit(scrape_store, store, z, items_to_search, data.radius)
                future_to_zip[future] = z

        for future in concurrent.futures.as_completed(future_to_zip):
            z = future_to_zip[future]
            try:
                res = future.result()
                if res:
                    grouped_results[z].append(res)
                    all_scraped_data.append(res)
            except Exception as e:
                print(f"Scrape failed for store in ZIP/Location {z}: {e}")

    predictions = predict_prices(all_scraped_data)

    return {
        "results": grouped_results if is_commute else all_scraped_data,
        "predictions": predictions,
        "is_commute": is_commute,
        "location_labels": zips_to_check # Send original input labels back for clearer UI
    }
