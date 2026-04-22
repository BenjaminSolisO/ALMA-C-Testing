from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Serve frontend as static site
# Future: add @app.post("/irf") above this line for Dynare/MATLAB backend
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
