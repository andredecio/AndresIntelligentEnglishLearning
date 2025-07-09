import requests
import csv
import json
import os
import re

target_headers = [
    'student name',
    'gender',
    'nationality',
    'email',
    'current ciep level'
]

def safe_normalize(header):
    if not header:
        return ''
    return header.strip().lower()

def extract_spreadsheet_id(url):
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url)
    if match:
        return match.group(1)
    else:
        raise ValueError(f"Invalid Google Sheets URL: {url}")

def extract_gid(url):
    match = re.search(r"gid=([0-9]+)", url)
    if match:
        return match.group(1)
    else:
        raise ValueError(f"No gid found in URL: {url}")

def find_header_row(csv_lines, target_headers, max_rows=15):
    import csv
    best_row_num = None
    best_match_count = 0

    for i in range(min(max_rows, len(csv_lines))):
        row = next(csv.reader([csv_lines[i]]))
        normalized_row = [h.strip().lower() for h in row]

        match_count = sum(1 for h in normalized_row if h in target_headers)

        if match_count > best_match_count:
            best_match_count = match_count
            best_row_num = i + 1  # 1-based

        if match_count == len(target_headers):
            break

    if best_row_num is None:
        raise ValueError("No header row found matching target headers")

    return best_row_num

def fetch_worksheet_csv(spreadsheet_id, gid):
    export_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"
    response = requests.get(export_url)
    if response.status_code != 200:
        print(f"⚠️ Failed to fetch gid {gid} (HTTP {response.status_code})")
        return None
    return response.content.decode('utf-8')

def extract_data_from_csv(csv_content, target_headers):
    lines = csv_content.splitlines()
    HEADER_ROW_NUMBER = find_header_row(lines, target_headers)
    header_row = lines[HEADER_ROW_NUMBER - 1]
    data_rows = lines[HEADER_ROW_NUMBER:]
    import csv
    raw_headers = next(csv.reader([header_row]))
    reader = csv.DictReader(data_rows, fieldnames=raw_headers)

    extracted = []
    for row in reader:
        entry = {}
        for key in row:
            if safe_normalize(key) in target_headers:
                entry[key.strip()] = (row[key] or '').strip()
        if any(entry.values()):
            extracted.append(entry)
    return extracted

def main():
    worksheet_urls = [
        "https://docs.google.com/spreadsheets/d/1UMrEq3m0Je5fTH6_ukoT9hIa733B5zF2/edit?gid=812020416#gid=812020416",
        "https://docs.google.com/spreadsheets/d/1UMrEq3m0Je5fTH6_ukoT9hIa733B5zF2/edit?gid=1743212177#gid=1743212177",
        "https://docs.google.com/spreadsheets/d/1UMrEq3m0Je5fTH6_ukoT9hIa733B5zF2/edit?gid=365189748#gid=365189748",
        "https://docs.google.com/spreadsheets/d/1UMrEq3m0Je5fTH6_ukoT9hIa733B5zF2/edit?gid=599717644#gid=599717644",
        "https://docs.google.com/spreadsheets/d/1UMrEq3m0Je5fTH6_ukoT9hIa733B5zF2/edit?gid=934287071#gid=934287071",
        "https://docs.google.com/spreadsheets/d/1UMrEq3m0Je5fTH6_ukoT9hIa733B5zF2/edit?gid=120090925#gid=120090925",
    ]

    # Group worksheet URLs by spreadsheet_id
    sheets_to_gids = {}
    for url in worksheet_urls:
        sid = extract_spreadsheet_id(url)
        gid = extract_gid(url)
        sheets_to_gids.setdefault(sid, []).append(gid)

    output_dir = r"C:\Users\ACER\AI TEACHING SYSTEM\GOOGLE SHEETS EXTRACTOR"
    os.makedirs(output_dir, exist_ok=True)

    for spreadsheet_id, gids in sheets_to_gids.items():
        print(f"\nProcessing spreadsheet: {spreadsheet_id}")
        all_entries = []

        for gid in gids:
            print(f"📥 Fetching worksheet gid {gid} ...")
            csv_content = fetch_worksheet_csv(spreadsheet_id, gid)
            if not csv_content:
                continue
            try:
                extracted = extract_data_from_csv(csv_content, target_headers)
                print(f"   → Extracted {len(extracted)} rows from gid {gid}")
                for e in extracted:
                    e['_worksheet_gid'] = gid
                all_entries.extend(extracted)
            except Exception as e:
                print(f"⚠️ Error processing gid {gid}: {e}")

        output_filename = f"students_data_{spreadsheet_id}.json"
        output_path = os.path.join(output_dir, output_filename)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(all_entries, f, ensure_ascii=False, indent=2)

        print(f"\n✅ Done! Extracted total {len(all_entries)} rows from spreadsheet {spreadsheet_id}")
        print(f"📄 Output saved to: {output_path}")

if __name__ == "__main__":
    main()
