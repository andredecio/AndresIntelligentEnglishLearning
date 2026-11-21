import os
import json
# AMENDED SO THAT YOU JUST NEED THE LATEST 'ALL THE STUDENTS' FILE ASWELL AS THE ONES YOU JUST CREATED
# Directory with your JSON files
input_dir = r"C:\Users\ACER\AI TEACHING SYSTEM\GOOGLE SHEETS EXTRACTOR"

# List of filenames to merge (make sure .json extension is included)
filenames = [
    "Sheets Data Extractor 1NS1FxWMR5C8IyjMls_aQ8TNBj0aZjCz6.json",
    "ALL THE STUDENTS 01-05-2026 Duplicates Removed.json"
]

merged_data = []

for filename in filenames:
    file_path = os.path.join(input_dir, filename)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                # Filter entries with non-blank "Email" or "Email Address"
                filtered_entries = [
                    entry for entry in data
                    if (
                        ("Email" in entry and entry["Email"] and str(entry["Email"]).strip())
                        or ("Email Address" in entry and entry["Email Address"] and str(entry["Email Address"]).strip())
                    )
                ]
                merged_data.extend(filtered_entries)
            else:
                print(f"⚠️ Warning: File {filename} does not contain a JSON list.")
    except Exception as e:
        print(f"⚠️ Could not read {filename}: {e}")

# Output path for the merged file
output_path = os.path.join(input_dir, "ALL THE STUDENTS 12-07-2026.json")
with open(output_path, "w", encoding="utf-8") as f_out:
    json.dump(merged_data, f_out, ensure_ascii=False, indent=2)

print(f"\n✅ Merged {len(filenames)} files.")
print(f"📄 Output contains {len(merged_data)} entries with non-blank email addresses.")
print(f"💾 Saved to: {output_path}")
