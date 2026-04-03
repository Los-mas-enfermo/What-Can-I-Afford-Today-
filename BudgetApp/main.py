from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from fastapi.responses import RedirectResponse

app = FastAPI(title="What can I Afford Today?")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def redirect_to_static():
    return RedirectResponse(url="/static/index.html")
