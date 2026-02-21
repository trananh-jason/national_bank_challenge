import io
from typing import Any

import pandas as pd
from flask import Flask, jsonify, request

app = Flask(__name__)


def _clean_nan(value: Any) -> Any:
    if pd.isna(value):
        return None
    return value


@app.route("/api/data", methods=["POST"])
def parse_uploaded_csv():
    csv_file = request.files.get("file")
    if csv_file is None:
        return jsonify({"error": "Missing file field. Submit multipart form-data with key 'file'."}), 400

    page_raw = request.args.get("page")
    per_page_raw = request.args.get("per_page")
    use_pagination = page_raw is not None or per_page_raw is not None

    page = 1
    per_page = 0
    if use_pagination:
        try:
            page = int(page_raw if page_raw is not None else 1)
            per_page = int(per_page_raw if per_page_raw is not None else 100)
        except ValueError:
            return jsonify({"error": "page and per_page must be integers."}), 400

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

    if use_pagination:
        start = (page - 1) * per_page
        end = start + per_page
        frame = df.iloc[start:end].copy()
    else:
        frame = df.copy()

    frame = frame.where(pd.notna(frame), None)

    records = [
        {col: _clean_nan(value) for col, value in row.items()}
        for row in frame.to_dict(orient="records")
    ]

    response_page = page if use_pagination else 1
    response_per_page = per_page if use_pagination else len(df)

    return jsonify(
        {
            "total": len(df),
            "page": response_page,
            "per_page": response_per_page,
            "columns": df.columns.tolist(),
            "data": records,
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
