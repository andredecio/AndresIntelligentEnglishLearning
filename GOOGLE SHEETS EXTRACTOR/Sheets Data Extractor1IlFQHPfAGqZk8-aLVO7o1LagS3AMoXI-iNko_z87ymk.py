import requests
import csv
import json
import os
from io import StringIO

# Target columns you care about (case-insensitive match)
TARGET_HEADERS = [
    "Student Name",
    "Gender",
    "Nationality",
    "Email",
    "Current CIEP Level"
]

# List of full worksheet URLs (each includes gid)
worksheet_urls = [
    "https://docs.google.com/spreadsheets/d/1IlFQHPfAGqZk8-aLVO7o1LagS3AMoXI-iNko_z87ymk/edit?gid=218770755",
    "https://docs.google.com/spreadsheets/d/1IlFQHPfAGqZk8-aLVO7o1LagS3AMoXI-iNko_z87ymk/edit?gid=1403060717",
    "https://docs.google.com/spreadsheets/d/1IlFQHPfAGqZk8-aLVO7o1LagS3AMoXI-iNko_z87ymk/edit?gid=1942191579"
]

# Output directory
OUTPUT_DIR = r"C:\Users\ACER\AI TEACHING SYSTEM\GOOGLE SHEETS EXTRACTOR"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def normalize_header(h):
    return h.strip().lower() if h else ""

def extract_sheet_id_and_gid(url):
    parts = url.split("/")
    spreadsheet_id = parts[5]
    gid_part = url.split("gid=")[-1]
    return spreadsheet_id, gid_part

# Group data by spreadsheet ID
spreadsheet_data = {}

for url in worksheet_urls:
    spreadsheet_id, gid = extract_sheet_id_and_gid(url)
    print(f"\n📥 Fetching worksheet with gid={gid} ...")

    export_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"
    resp = requests.get(export_url)

    if resp.status_code != 200:
        print(f"⚠️ Failed to fetch data for gid={gid}")
        continue

    content = resp.content.decode("utf-8", errors="ignore")
    rows = list(csv.reader(StringIO(content)))

    # Detect the correct header row (row that contains at least 3 target headers)
    header_row_index = -1
    for i, row in enumerate(rows[:20]):  # Check up to first 20 rows
        normalized = [normalize_header(cell) for cell in row]
        hits = sum(1 for h in TARGET_HEADERS if normalize_header(h) in normalized)
        if hits >= 3:
            header_row_index = i
            break

    if header_row_index == -1:
        print("⚠️ No valid header row found.")
        continue

    headers = rows[header_row_index]
    print(f"   → Detected headers: {headers}")

    data_rows = rows[header_row_index + 1:]
    filtered_csv_data = "\n".join([",".join(row) for row in data_rows])
    csv_stream = StringIO(filtered_csv_data)
    dict_reader = csv.DictReader(csv_stream, fieldnames=headers)

    extracted_rows = []
    for row in dict_reader:
        clean_row = {}
        for k, v in row.items():
            if normalize_header(k) in [normalize_header(h) for h in TARGET_HEADERS]:
                if k and v:
                    clean_row[k.strip()] = v.strip()
        if clean_row:
            extracted_rows.append(clean_row)

    if spreadsheet_id not in spreadsheet_data:
        spreadsheet_data[spreadsheet_id] = []
    spreadsheet_data[spreadsheet_id].extend(extracted_rows)

# Write each spreadsheet's data to a separate output file
for spreadsheet_id, rows in spreadsheet_data.items():
    output_path = os.path.join(
        OUTPUT_DIR,
        f"students_data_{spreadsheet_id}.json"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Saved {len(rows)} rows to: {output_path}")
