import csv
import json
import os
import re
import requests

def normalize(text):
    return re.sub(r"\s+", " ", text.strip().lower())

# Flexible target headers including "email" and "email address"
target_headers = [
    "no.", "student id", "student name", "gender", "nationality",
    "email", "email address", "visa", "current location", "remark", "pass / repeat"
]

def header_cell_matches(cell_norm):
    for th in target_headers:
        if th in cell_norm:
            return True
    return False

worksheet_urls = [
    "https://docs.google.com/spreadsheets/d/1JHeB3TyLtTBcjOvn6a2_c8sunnw6_BLE/edit?gid=1893191386",
    "https://docs.google.com/spreadsheets/d/1JHeB3TyLtTBcjOvn6a2_c8sunnw6_BLE/edit?gid=1805299145"
]

spreadsheet_id = "1JHeB3TyLtTBcjOvn6a2_c8sunnw6_BLE"
output_dir = "C:/Users/ACER/AI TEACHING SYSTEM/GOOGLE SHEETS EXTRACTOR"
output_path = os.path.join(output_dir, f"Sheets Data Extractor {spreadsheet_id}.json")

all_data = []

print(f"\nProcessing spreadsheet ID: {spreadsheet_id} with {len(worksheet_urls)} worksheets")

for url in worksheet_urls:
    gid_match = re.search(r"gid=(\d+)", url)
    gid = gid_match.group(1) if gid_match else "0"
    print(f"📅 Fetching worksheet with gid={gid} ...")

    csv_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"

    try:
        response = requests.get(csv_url)
        response.raise_for_status()
        with open("temp.csv", "w", newline="", encoding="utf-8") as f:
            f.write(response.text)

        with open("temp.csv", "r", encoding="utf-8") as f:
            reader = list(csv.reader(f))

        i = 0
        while i < len(reader):
            row = reader[i]
            normalized_row = [normalize(cell) for cell in row]
            if any(header_cell_matches(cell) for cell in normalized_row):
                # Found header row
                header = row
                i += 1
                while i < len(reader):
                    next_row = reader[i]
                    normalized_next = [normalize(cell) for cell in next_row]
                    if any(header_cell_matches(cell) for cell in normalized_next):
                        # Next header block found
                        break
                    if len(next_row) < len(header):
                        next_row += [""] * (len(header) - len(next_row))
                    entry = dict(zip(header, next_row))

                    filtered_entry = {
                        k.strip(): entry.get(k, "").strip()
                        for k in header
                        if header_cell_matches(normalize(k)) and entry.get(k, "").strip()
                    }

                    if filtered_entry:
                        all_data.append(filtered_entry)
                    i += 1
            else:
                i += 1

    except Exception as e:
        print(f"⚠️ Failed to fetch data for gid={gid}: {e}")

if all_data:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Done! Extracted {len(all_data)} rows total.")
    print(f"📄 Output saved to: {output_path}")
else:
    print(f"\n⚠️ No data extracted for spreadsheet ID {spreadsheet_id}")
