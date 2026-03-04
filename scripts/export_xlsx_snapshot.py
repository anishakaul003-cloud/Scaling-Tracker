#!/usr/bin/env python3
"""Export all sheets from an XLSX file into public/data.json for snapshot UI."""

import json
import zipfile
from datetime import datetime
import xml.etree.ElementTree as ET

SRC = '/Users/pocketfm/Downloads/US Fantasy - Scaling Tracker.xlsx'
OUT = '/Users/pocketfm/Documents/New project/public/data.json'

NS_MAIN = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
NS_REL = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
RID_ATTR = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def col_index(ref):
    letters = ''
    for ch in ref:
        if ch.isalpha():
            letters += ch
        else:
            break
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1 if n else 0


def parse_xlsx(src_path):
    with zipfile.ZipFile(src_path, 'r') as z:
        wb_xml = ET.fromstring(z.read('xl/workbook.xml'))
        wb_rels_xml = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))

        rel_map = {}
        for rel in wb_rels_xml.findall('r:Relationship', NS_REL):
            rid = rel.attrib.get('Id')
            target = rel.attrib.get('Target', '')
            if target.startswith('/'):
                target_path = target.lstrip('/')
            else:
                target_path = 'xl/' + target if not target.startswith('xl/') else target
            rel_map[rid] = target_path

        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            sst_xml = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in sst_xml.findall('m:si', NS_MAIN):
                txt = []
                for t in si.findall('.//m:t', NS_MAIN):
                    txt.append(t.text or '')
                shared.append(''.join(txt))

        sheets_payload = []
        all_sheets = wb_xml.findall('m:sheets/m:sheet', NS_MAIN)

        for sheet in all_sheets:
            title = sheet.attrib.get('name', '')
            rid = sheet.attrib.get(RID_ATTR)
            path = rel_map.get(rid)
            if not path or path not in z.namelist():
                sheets_payload.append({'title': title, 'rows': []})
                continue

            root = ET.fromstring(z.read(path))
            rows = []

            for row in root.findall('m:sheetData/m:row', NS_MAIN):
                cells = {}
                row_max = -1
                for c in row.findall('m:c', NS_MAIN):
                    ref = c.attrib.get('r', '')
                    ci = col_index(ref)
                    ctype = c.attrib.get('t')
                    v = c.find('m:v', NS_MAIN)

                    if ctype == 's':
                        val = ''
                        if v is not None and v.text and v.text.isdigit():
                            idx = int(v.text)
                            if 0 <= idx < len(shared):
                                val = shared[idx]
                    elif ctype == 'inlineStr':
                        t = c.find('m:is/m:t', NS_MAIN)
                        val = t.text if t is not None and t.text else ''
                    elif ctype == 'b':
                        val = 'TRUE' if (v is not None and v.text == '1') else 'FALSE'
                    else:
                        val = v.text if v is not None and v.text is not None else ''

                    if val != '':
                        cells[ci] = str(val)
                        if ci > row_max:
                            row_max = ci

                if row_max >= 0:
                    arr = [''] * (row_max + 1)
                    for ci, val in cells.items():
                        arr[ci] = val
                    while arr and arr[-1] == '':
                        arr.pop()
                    rows.append(arr)
                else:
                    rows.append([])

            while rows and not rows[-1]:
                rows.pop()

            sheets_payload.append({'title': title, 'rows': rows})

        return sheets_payload


def main():
    sheets = parse_xlsx(SRC)
    payload = {
        'generatedAt': datetime.utcnow().isoformat() + 'Z',
        'sheets': sheets
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=True)
    print(f'wrote {OUT} with {len(sheets)} sheets')


if __name__ == '__main__':
    main()
