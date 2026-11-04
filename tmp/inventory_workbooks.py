from __future__ import annotations

import json
from pathlib import Path
from openpyxl import load_workbook

FILES = [
    Path(r"E:\CSR_Downloads\AAAMaster_updated (1).xlsm"),
    Path(r"C:\Users\rajes\Downloads\CSR_Annexure_Data_Top1000_FY21-FY25.xlsx"),
]


def compact(value):
    if value is None:
        return None
    text = str(value).strip()
    return text[:180] if text else None


result = []
for file in FILES:
    wb = load_workbook(file, read_only=True, data_only=False, keep_vba=file.suffix.lower() == ".xlsm")
    item = {"path": str(file), "size": file.stat().st_size, "sheets": []}
    for ws in wb.worksheets:
        preview = []
        for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 8), values_only=True):
            preview.append([compact(v) for v in row[: min(ws.max_column, 40)]])
        item["sheets"].append({
            "name": ws.title,
            "rows": ws.max_row,
            "cols": ws.max_column,
            "preview": preview,
        })
    wb.close()
    result.append(item)

print(json.dumps(result, ensure_ascii=True, indent=2))
