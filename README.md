# National Bank Challenge
Trading behavior analysis app with:
- a Flask backend (`main.py`) that parses uploaded CSV files
- a React + Vite frontend (`frontend/`) for visualization and insights

## Prerequisites
- Python `3.13+`
- [`uv`](https://docs.astral.sh/uv/) (recommended for Python dependency management)
- Node.js `18+` and `npm`

## Setup
1. Clone and enter the repository:
```bash
git clone https://github.com/trananh-jason/national_bank_challenge.git
cd national_bank_challenge
```

2. Install backend dependencies:
```bash
uv sync
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

## Run Locally
Start backend and frontend in separate terminals.

1. Terminal 1: start Flask backend (runs on `http://127.0.0.1:5000`):
```bash
cd /path/to/national_bank_challenge
uv run python main.py
```

2. Terminal 2: start frontend dev server:
```bash
cd /path/to/national_bank_challenge/frontend
npm run dev
```

3. Open the Vite URL shown in terminal (usually `http://127.0.0.1:5173`).

The frontend is configured to proxy `/api/*` requests to the Flask backend at `http://127.0.0.1:5000`.

## CSV Input Format
Upload a CSV with trade rows. Example columns:
```csv
timestamp,asset,side,quantity,entry_price,exit_price,profit_loss,balance
```

Notes:
- `profit_loss` is required for meaningful metrics.
- `balance` is optional but required for the balance-over-time chart.
- Sample files are available in `data/`:
  - `data/calm_trader.csv`
  - `data/loss_averse_trader.csv`
  - `data/revenge_trader.csv`
  - `data/overtrader.csv`
