# ALMA C Testing

Interactive IRF visualization tool for New Keynesian DSGE models.

## Structure

```
frontend/   — standalone HTML/CSS/JS app (Chart.js, no build step)
backend/    — Python + Dynare/MATLAB solver (coming soon)
```

## Frontend

Open `frontend/index.html` in any browser. No server required.

**Model:** 4-equation NK (IS + Phillips Curve + Taylor Rule + Goods Market)  
**Solver:** Analytical backward recursion in JS  
**Shocks:** Demand, Monetary  

## Backend (planned)

FastAPI + MATLAB/Dynare for extended DSGE models.
