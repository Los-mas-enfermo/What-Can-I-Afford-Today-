def find_stores(zip_code, radius):
    """
    Returns exactly two static store categories representing the zip code.
    Since we only need to provide zip-code generalized price averages,
    we skip the unreliable search for explicit retail brand names.
    """
    return [
        {"name": f"Neighborhood Market for {zip_code}", "type": "grocery"},
        {"name": f"Local Fuel Prices for {zip_code}", "type": "fuel"}
    ]
