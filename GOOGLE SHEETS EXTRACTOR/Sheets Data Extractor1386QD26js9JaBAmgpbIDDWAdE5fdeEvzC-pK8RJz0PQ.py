import csv
import json
import os
import re
import requests
from urllib.parse import urlparse, parse_qs

# Target headers to extract
target_headers = [
    "No.", "Student ID", "Student Name", "Gender", "Nationality",
    "Email", "Visa", "Current Location", "Remark", "PASS / REPEAT"
]

# List of URLs to individual worksheets
worksheet_urls = [
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=1446348085",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=236055447",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=1748502392",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=606659186",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=1374223258",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=1238367699",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=385633538",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=763757733",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=5852405",
    "https://docs.google.com/spreadsheets/d/1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ/edit?gid=256190806"
]

# Group by spreadsheet ID
spreadsheet_id = "1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ"
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
            reader = csv.reader(f)
            rows = list(reader)

        header_row_index = -1
        for i, row in enumerate(rows[:10]):
            if all(h in row for h in target_headers):
                header_row_index = i
                break

        if header_row_index == -1:
            print(f"⚠️ Could not find header row containing all target columns for gid={gid}")
            continue

        header = rows[header_row_index]
        data_rows = rows[header_row_index + 1:]

        for row in data_rows:
            if len(row) < len(header):
                row += [""] * (len(header) - len(row))
            entry = dict(zip(header, row))
            filtered_entry = {k.strip(): entry.get(k, "").strip() for k in target_headers if k in entry and entry[k]}
            if filtered_entry:
                all_data.append(filtered_entry)

    except Exception as e:
        print(f"⚠️ Failed to fetch data for gid={gid}: {e}")

if all_data:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Done! Extracted {len(all_data)} rows total.")
    print(f"📄 Output saved to: {output_path}")
else:
    print(f"\n⚠️ No data extracted for spreadsheet ID {spreadsheet_id}")
