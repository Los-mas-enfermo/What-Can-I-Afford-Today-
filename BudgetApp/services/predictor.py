from services.persistence import get_gas_price_history
import statistics

def get_smoothed_price(zip_code, item_name, current_price):
    history = get_gas_price_history(zip_code, item_name)
    if not history or len(history) < 2:
        return current_price
        
    prices = [h["price"] for h in history]
    rolling_avg = sum(prices) / len(prices)
    
    # Calculate Volatility (Standard Deviation)
    volatility = statistics.stdev(prices) if len(prices) > 1 else 0
    # normalize volatility (relative to avg)
    rel_volatility = volatility / rolling_avg if rolling_avg > 0 else 0
    
    # High Volatility -> Recency Weight (75%)
    # Low Volatility -> Stable Blend (50/50)
    current_weight = min(0.8, 0.5 + rel_volatility)
    return (current_price * current_weight) + (rolling_avg * (1 - current_weight))


import numpy as np
from sklearn.linear_model import LinearRegression

def predict_prices(data):
    if not data:
        return []

    # Simple linear trend if we have multiple stores
    y = np.array([item.get("total", 0) for item in data])
    if len(y) < 2: return {"next_prediction": float(y[0]) if len(y) > 0 else 0.0}
    
    X = np.array([[i] for i in range(len(y))])
    model = LinearRegression().fit(X, y)
    future = model.predict([[len(y)+1]])

    return {"next_prediction": float(future[0])}
