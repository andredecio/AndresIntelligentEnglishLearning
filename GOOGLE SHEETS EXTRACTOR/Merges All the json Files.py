import os
import json

# Directory with your JSON files
input_dir = r"C:\Users\ACER\AI TEACHING SYSTEM\GOOGLE SHEETS EXTRACTOR"

# List of filenames to merge (make sure .json extension is included)
filenames = [
    "Sheets Data Extractor 12dMe7FqJI3X6ks11AEmtECREIvT3yvBaeBcDVNmyjW0.json",
    "Sheets Data Extractor 1-HeX-CGd7xRSuNsOPB-WHl5LltBjGpk3hjn3eRCb5BQ.json",
    "Sheets Data Extractor 17gaMRKsseZkG6nszSePtis-geWss5X1vxUBDcU2LPjY.json",
    "Sheets Data Extractor 1Am0MDRp8tzfdcq_XD6nZ5sinCClAfzif.json",
    "Sheets Data Extractor 1AVzn2svdlySagC6srQsGtapb-UNIzOonkuiCBKSHWQA.json",
    "Sheets Data Extractor 1xlwlodM49AQC_S1O7r-pp4pyIDsq8w6W.json",
    "Sheets Data Extractor 1DERy3f717PPpqFlcT7rJa39kNb2ggNCP1kFoQh9HFCU.json",
    "Sheets Data Extractor 1YaQDxMdmzRhIXv_BBOcysvBlyR9bsTpX.json",
    "Sheets Data Extractor 1E2BvbLSA8wHqRqAz32t5XPtRxWPDeT9nFpAYaiziMzc.json",
    "Sheets Data Extractor 1a8qCCy2pFn4XMhybw20hfDRnz3LcJm41.json",
    "Sheets Data Extractor 1a8qCCy2pFn4XMhybw20hfDRnz3LcJm41.json",
    "Sheets Data Extractor 1IO5LlxcKnOh31vEv6pqTJrqSEZQ-azNZ.json",
    "Sheets Data Extractor 1JHeB3TyLtTBcjOvn6a2_c8sunnw6_BLE.json",
    "Sheets Data Extractor 1l6I1ibF3GRFmrNzs2xMUlPDZ1u5ckO2tyQJSubxtl7I.json",
    "Sheets Data Extractor 1p136MGnW_cFZ5NQq8aG1SqW3DuKiLHXN.json",
    "Sheets Data Extractor 1poxYmgzZVCsuQGkxSxzdusK-3eEpActx.json",
    "Sheets Data Extractor 1R5-cMTFT1oJqn1nP-6DcAEPVHyT0Nlna.json",
    "Sheets Data Extractor 1t3EptC2lvbP3iLuxJJL99BvXVp2SV6wd.json",
    "Sheets Data Extractor 1t7hFU7yEeRke3_ZlYon7qp-cOgDRGYXh.json",
    "Sheets Data Extractor 1uZe1syNNCE93XXu0os3xV3dTukh2yZPj.json",
    "Sheets Data Extractor 1VvNN097VKeHXYQ8MMdOXKNrbWlqlhgD7.json",
    "students_data_ 1386QD26js9JaBAmgpbIDDWAdE5fdeEvzC-pK8RJz0PQ.json",
    "students_data_1-AAzm2VQuzOf_jluNAr6d-9QtfSYxL4K2r6YiBw-gqg.json",
    "students_data_1IlFQHPfAGqZk8-aLVO7o1LagS3AMoXI-iNko_z87ymk.json",
    "students_data_1UMrEq3m0Je5fTH6_ukoT9hIa733B5zF2.json",
    "students_data_1wWmitskKFh-Aon_SlAdd-qw2YpZEsFt9yAuQHQjVu6M.json",
    "students_data_18M7Qzest9pTd0qX6F3P1d3cnmY1FhICogCTR-eXWd1g.json"
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
output_path = os.path.join(input_dir, "ALL THE STUDENTS 11-08-2025.json")
with open(output_path, "w", encoding="utf-8") as f_out:
    json.dump(merged_data, f_out, ensure_ascii=False, indent=2)

print(f"\n✅ Merged {len(filenames)} files.")
print(f"📄 Output contains {len(merged_data)} entries with non-blank email addresses.")
print(f"💾 Saved to: {output_path}")
