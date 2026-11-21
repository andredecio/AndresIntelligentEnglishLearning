import json

# Input and output file names
input_file = "ALL THE STUDENTS 12-07-2026.json"
output_file = "ALL THE STUDENTS 12-07-2026 Duplicates Removed.json"

# Load data from the JSON file
with open(input_file, "r", encoding="utf-8") as f:
    students = json.load(f)

# Use a set to track seen emails
seen_emails = set()
unique_students = []

for student in students:
    email = student.get("Email", "").strip().lower()
    if email and email not in seen_emails:
        seen_emails.add(email)
        unique_students.append(student)

# Write the deduplicated data to a new file
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(unique_students, f, indent=2, ensure_ascii=False)

print(f"✅ Removed duplicates. {len(unique_students)} unique entries saved to '{output_file}'.")
