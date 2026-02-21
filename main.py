import pandas as pd
from flask import Flask, jsonify

app = Flask(__name__)
@app.route("/")

def load_csv(file_path):
    try:
        # Read CSV file
        df = pd.read_csv(file_path, skiprows=1, header=0)
        
        # Display basic information
        # timestamp,asset,side,quantity,entry_price,exit_price,profit_loss,balance
        print("\nCSV Loaded Successfully!\n")
        print("First 5 rows:")
        print(df)
        
        print("\nDataset Info:")
        print(df.info())
        
        print("\nSummary Statistics:")
        print(df.describe())
        return df

    except FileNotFoundError:
        print("File not found. " + file_path)
    except pd.errors.EmptyDataError:
        print("CSV file is empty.")
    except Exception as e:
        print(f"Unexpected error: {e}")


def get_data(data):
    return jsonify(data)

if __name__ == "__main__":
    file_path = input("Enter path to your CSV file: ")
    data = load_csv(file_path)

