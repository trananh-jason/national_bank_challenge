import io
import json
import os
import re
from typing import Any

import pandas as pd
from flask import Flask, jsonify, request

app = Flask(__name__)


def _clean_nan(value: Any) -> Any:
    if pd.isna(value):
        return None
    return value


def _to_float(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if parsed == parsed else fallback
    except (TypeError, ValueError):
        return fallback


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _extract_sentiment(notes: str) -> dict[str, Any]:
    tokens = re.findall(r"[a-zA-Z']+", notes.lower())
    if not tokens:
        return {"label": "neutral", "score": 0.5, "evidence": "No trader notes provided."}

    positive_words = {
        "calm",
        "disciplined",
        "patient",
        "confident",
        "consistent",
        "plan",
        "focused",
        "clear",
    }
    negative_words = {
        "panic",
        "anxious",
        "revenge",
        "frustrated",
        "fear",
        "greedy",
        "impulsive",
        "angry",
        "stressed",
        "fomo",
    }

    pos = sum(1 for token in tokens if token in positive_words)
    neg = sum(1 for token in tokens if token in negative_words)
    raw = pos - neg
    score = _clip((raw + 6) / 12, 0.0, 1.0)

    if score > 0.65:
        label = "positive"
    elif score < 0.4:
        label = "negative"
    else:
        label = "neutral"

    if pos == 0 and neg == 0:
        evidence = "Sentiment inferred from neutral wording."
    else:
        evidence = f"Positive markers: {pos}, negative markers: {neg}."

    return {"label": label, "score": round(score, 2), "evidence": evidence}


def _risk_tier(score: float) -> str:
    if score >= 75:
        return "Aggressive"
    if score >= 45:
        return "Balanced"
    return "Conservative"


def _heuristic_ai_coach(payload: dict[str, Any]) -> dict[str, Any]:
    metrics = payload.get("metrics", {}) if isinstance(payload.get("metrics"), dict) else {}
    insights = payload.get("insights", []) if isinstance(payload.get("insights"), list) else []
    trader_notes = str(payload.get("trader_notes", "") or "").strip()

    total_trades = _to_float(metrics.get("totalTrades"))
    win_rate = _to_float(metrics.get("winRate"))
    avg_profit = _to_float(metrics.get("avgProfit"))
    avg_loss = _to_float(metrics.get("avgLoss"))
    point_factor = _to_float(metrics.get("pointFactor"))
    total_pnl = _to_float(metrics.get("profitLoss"))

    severity_penalty = 0.0
    for insight in insights:
        if not isinstance(insight, dict):
            continue
        severity = str(insight.get("severity", "")).lower()
        if severity == "high":
            severity_penalty += 14
        elif severity == "medium":
            severity_penalty += 6
        elif severity == "low":
            severity_penalty += 2

    profitability_score = _clip((point_factor - 0.8) * 35, 0, 35)
    consistency_score = _clip((win_rate - 40) * 0.6, 0, 25)
    note_sentiment = _extract_sentiment(trader_notes)
    sentiment_score = _clip(note_sentiment["score"] * 20, 0, 20)
    activity_penalty = 8 if total_trades > 600 else 0
    risk_score = _clip(
        profitability_score + consistency_score + sentiment_score - severity_penalty - activity_penalty,
        0,
        100,
    )
    risk_tier = _risk_tier(risk_score)

    loss_to_win_ratio = avg_loss / max(avg_profit, 1e-6)
    optimization_suggestions: list[str] = []
    if loss_to_win_ratio > 1.4:
        optimization_suggestions.append(
            "Keep losses smaller: set your stop before entry and exit quickly when your plan is broken."
        )
    if win_rate < 50:
        optimization_suggestions.append(
            "Be more selective: take only your best setups and skip trades that do not fully match your checklist."
        )
    if point_factor < 1.2:
        optimization_suggestions.append(
            "Aim for larger winners than losers, such as a 1.5:1 reward-to-risk target."
        )
    if not optimization_suggestions:
        optimization_suggestions.append(
            "You are in a stable zone. Keep your rules simple and review your trades weekly for small improvements."
        )

    future_triggers = [
        "After 2 losses in a row, you may try to win it back too fast. Take a 15-minute break before the next trade.",
        "In fast markets, you may increase size too quickly. Keep your next trade at your normal size.",
    ]
    if note_sentiment["label"] == "negative":
        future_triggers.append(
            "Your notes sound stressed. Pause and trade only when your checklist is fully met."
        )

    coaching_prompts = [
        "Before this trade, how strong was the setup on a 1 to 5 scale?",
        "Did you choose your size using your rules, or based on emotion?",
        "What exact sign tells you this trade idea is wrong?",
    ]

    summary = (
        f"Current profile is {risk_tier.lower()} risk with {win_rate:.1f}% win rate and "
        f"{point_factor:.2f} point factor. "
        f"{'Performance is net positive.' if total_pnl >= 0 else 'Performance is currently negative.'}"
    )

    return {
        "summary": summary,
        "sentiment": note_sentiment,
        "risk_profile": {
            "score": round(risk_score, 1),
            "tier": risk_tier,
            "rationale": "Score blends profitability, consistency, behavioral severity, and note sentiment.",
        },
        "optimization_suggestions": optimization_suggestions[:3],
        "future_bias_triggers": future_triggers[:3],
        "coaching_prompts": coaching_prompts,
        "source": "heuristic",
    }


def _openai_ai_coach(payload: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI
    except ImportError:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

    schema = {
        "name": "trading_coach_response",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "sentiment": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string", "enum": ["positive", "neutral", "negative"]},
                        "score": {"type": "number"},
                        "evidence": {"type": "string"},
                    },
                    "required": ["label", "score", "evidence"],
                    "additionalProperties": False,
                },
                "risk_profile": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "number"},
                        "tier": {"type": "string"},
                        "rationale": {"type": "string"},
                    },
                    "required": ["score", "tier", "rationale"],
                    "additionalProperties": False,
                },
                "optimization_suggestions": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
                "future_bias_triggers": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
                "coaching_prompts": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 5},
            },
            "required": [
                "summary",
                "sentiment",
                "risk_profile",
                "optimization_suggestions",
                "future_bias_triggers",
                "coaching_prompts",
            ],
            "additionalProperties": False,
        },
        "strict": True,
    }

    try:
        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model=model,
            input=[
                {
                    "role": "system",
                        "content": (
                        "You are a trading coach for students. Use simple language, avoid jargon, and give clear next steps. "
                        "Use the payload to detect emotional bias signals, score risk profile, and suggest practical actions."
                    ),
                },
                {"role": "user", "content": json.dumps(payload)},
            ],
            text={"format": {"type": "json_schema", "name": schema["name"], "schema": schema["schema"], "strict": True}},
        )
        content = response.output_text
        parsed = json.loads(content)
        parsed["source"] = f"openai:{model}"
        return parsed
    except Exception:
        return None


def _heuristic_chat_reply(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message", "") or "").strip()
    metrics = payload.get("metrics", {}) if isinstance(payload.get("metrics"), dict) else {}
    trader_notes = str(payload.get("trader_notes", "") or "").strip()
    sentiment = _extract_sentiment(trader_notes)
    point_factor = _to_float(metrics.get("pointFactor"))
    win_rate = _to_float(metrics.get("winRate"))

    lower_message = message.lower()
    if any(keyword in lower_message for keyword in ["loss", "losing", "drawdown", "down bad"]):
        reply = (
            "Focus on loss control first: decide your stop before entry, keep trade size consistent, "
            "and take a 15-minute break after two losses in a row."
        )
    elif any(keyword in lower_message for keyword in ["win", "improve", "better", "performance"]):
        reply = (
            "To improve results, take fewer but better trades and aim for bigger winners than losers, like 1.5:1."
        )
    elif any(keyword in lower_message for keyword in ["risk", "size", "position", "lot size"]):
        reply = (
            "Set trade size from your max loss rule, not from confidence. Keep size steady and do not increase it after emotional streaks."
        )
    elif any(keyword in lower_message for keyword in ["fomo", "panic", "emotion", "stress", "anxious"]):
        reply = (
            "When emotions spike, use one pause rule: no new trade until you can explain entry, stop, and target in one calm sentence."
        )
    elif any(keyword in lower_message for keyword in ["strategy", "setup", "plan", "checklist"]):
        reply = (
            "Keep your plan simple: one setup, one trigger, one stop rule, and one risk size. Simpler plans are easier to follow."
        )
    elif any(keyword in lower_message for keyword in ["confidence", "mindset", "discipline"]):
        reply = (
            "Build confidence from process, not outcome. Judge yourself by rule-following first, then by profit."
        )
    else:
        question_echo = message[:120] if message else "your question"
        reply = (
            f"For '{question_echo}', start with a simple rule-based answer: define entry, stop, and target before trading, "
            "then review if you followed the plan."
        )

    if any(keyword in lower_message for keyword in ["weather", "movie", "recipe", "history", "math", "code"]):
        reply = (
            "I can answer basic general questions, but full ChatGPT-style responses require OpenAI mode. "
            "Set OPENAI_API_KEY to enable broad, high-quality answers."
        )

    context = (
        f"Current stats: win rate {win_rate:.1f}%, point factor {point_factor:.2f}, "
        f"note sentiment {sentiment['label']}."
    )
    return {"reply": f"{reply} {context}", "source": "heuristic"}


def _openai_chat_reply(payload: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI
    except ImportError:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    message = str(payload.get("message", "") or "").strip()
    history = payload.get("history", [])
    if not isinstance(history, list):
        history = []

    safe_history = []
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "user"))
        content = str(item.get("content", ""))
        if role not in {"user", "assistant"}:
            continue
        if not content.strip():
            continue
        safe_history.append({"role": role, "content": content})

    prompt_payload = {
        "metrics": payload.get("metrics", {}),
        "insights": payload.get("insights", []),
        "trader_notes": payload.get("trader_notes", ""),
    }

    input_content = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant like ChatGPT inside a bias-detector app. "
                "You can answer general questions on any topic. "
                "When the question is about trading behavior, use the provided metrics/insights and give practical, clear guidance. "
                "Use simple language and avoid unnecessary jargon."
            ),
        },
        {"role": "user", "content": f"Context:\n{json.dumps(prompt_payload)}"},
    ]
    input_content.extend(safe_history)
    input_content.append({"role": "user", "content": message})

    try:
        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model=model,
            input=input_content,
        )
        reply = (response.output_text or "").strip()
        if not reply:
            return None
        return {"reply": reply, "source": f"openai:{model}"}
    except Exception:
        return None


@app.route("/api/data", methods=["POST"])
def parse_uploaded_csv():
    csv_file = request.files.get("file")
    if csv_file is None:
        return jsonify({"error": "Missing file field. Submit multipart form-data with key 'file'."}), 400

    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 100))

    if page < 1 or per_page < 1:
        return jsonify({"error": "page and per_page must be positive integers."}), 400

    try:
        content = csv_file.read()
        if not content:
            return jsonify({"error": "Uploaded file is empty."}), 400

        decoded = content.decode("utf-8-sig")
        df = pd.read_csv(io.StringIO(decoded))
    except UnicodeDecodeError:
        return jsonify({"error": "Unable to decode file as UTF-8 CSV."}), 400
    except pd.errors.EmptyDataError:
        return jsonify({"error": "CSV file is empty."}), 400
    except Exception as exc:
        return jsonify({"error": f"Failed to parse CSV: {exc}"}), 400

    start = (page - 1) * per_page
    end = start + per_page
    paginated = df.iloc[start:end].copy()
    paginated = paginated.where(pd.notna(paginated), None)

    records = [
        {col: _clean_nan(value) for col, value in row.items()}
        for row in paginated.to_dict(orient="records")
    ]

    return jsonify(
        {
            "total": len(df),
            "page": page,
            "per_page": per_page,
            "columns": df.columns.tolist(),
            "data": records,
        }
    )


@app.route("/api/ai/coach", methods=["POST"])
def ai_coach():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Expected JSON body."}), 400

    model_response = _openai_ai_coach(payload)
    if model_response is None:
        model_response = _heuristic_ai_coach(payload)

    return jsonify(model_response)


@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Expected JSON body."}), 400

    message = str(payload.get("message", "") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    model_response = _openai_chat_reply(payload)
    if model_response is None:
        model_response = _heuristic_chat_reply(payload)

    return jsonify(model_response)


if __name__ == "__main__":
    app.run(debug=True)
