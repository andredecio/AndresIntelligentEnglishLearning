import csv
import json
import os
import re
import requests

def normalize(text):
    return re.sub(r"\s+", " ", text.strip().lower())

# Accept if at least 1 of these headers is present
target_headers = [
    "no.", "student id", "student name", "gender", "nationality",
    "email", "visa", "current location", "remark", "pass / repeat"
]

worksheet_urls = [
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=867695831#gid=867695831",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=470444176#gid=470444176",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=1818090343#gid=1818090343",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=1630448716#gid=1630448716",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=1779388132#gid=1779388132",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=621108455#gid=621108455",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=239273954#gid=239273954",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=399726370#gid=399726370",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=1530799846#gid=1530799846",
    "https://docs.google.com/spreadsheets/d/1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W/edit?gid=541567689#gid=541567689"
]

spreadsheet_id = "1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W"
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

        # Look through the first 15 rows to find the header row
        header_row_index = -1
        for i, row in enumerate(rows[:15]):
            normalized_row = [normalize(cell) for cell in row]
            if any(th in normalized_row for th in target_headers):
                header_row_index = i
                break

        if header_row_index == -1:
            print(f"⚠️ Could not find any target column in top 15 rows for gid={gid}")
            continue

        header = rows[header_row_index]
        data_rows = rows[header_row_index + 1:]

        for row in data_rows:
            if len(row) < len(header):
                row += [""] * (len(header) - len(row))
            entry = dict(zip(header, row))
            filtered_entry = {
                k.strip(): entry.get(k, "").strip()
                for k in header
                if normalize(k) in target_headers and entry.get(k, "").strip()
            }
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
