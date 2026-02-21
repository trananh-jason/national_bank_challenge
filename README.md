# National Bank Challenge
Repository for the National Bank hackathon project.

## Setup

### Prerequisites
- Python `3.13+`
- `uv` for Python environment and dependency management
- Node.js `18+` and `npm` (for the frontend app)

### 1. Clone the repository
```bash
git clone <https://github.com/trananh-jason/national_bank_challenge.git>
cd national_bank_challenge
```

### 2. Set up Python dependencies
```bash
uv sync
```

### 3. Run the Python entrypoint
```bash
uv run python main.py
```

### Optional: Enable OpenAI-powered coaching
The app now includes an AI coaching endpoint at `/api/ai/coach`.

- If `OPENAI_API_KEY` is set, the backend uses OpenAI for structured coaching output.
- If no API key is present, it falls back to a local heuristic model so the feature still works.

```bash
export OPENAI_API_KEY="your_api_key_here"
# Optional override (default: gpt-4.1-mini)
export OPENAI_MODEL="gpt-4.1-mini"
```

### 4. Set up and run the frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs with Vite and prints the local URL in your terminal.

## Contributing

### Workflow
1. Create a feature branch from `main`.
```bash
git checkout -b feat/short-description
```
2. Make your changes in small, focused commits.
3. Run relevant checks before opening a PR.
```bash
# Python
uv run python main.py

# Frontend
cd frontend
npm run dev
```
4. Push your branch and open a pull request.

### Pull Request Guidelines
- Describe what changed and why.
- Include test/verification steps in the PR description.
- Add screenshots for UI changes.
- Keep PRs small and reviewable when possible.
