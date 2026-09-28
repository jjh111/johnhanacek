#!/usr/bin/env python3
"""ATS parse check for a built resume PDF.

Simulates what an automated parser sees (pdftotext, both modes) and diffs it
against Assets/resume.json. Exit 1 on any FAIL, so it can gate a submission.

  python3 scripts/check-resume-parse.mjs <pdf> [--lane=productDesigner]

Lane defaults to designEngineer (the public/unsuffixed lane). The lane is
verified by HEADLINE + SUMMARY, not by filename.
"""
import json, re, subprocess, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.local/out/resume-apply-productDesigner.pdf')
    lane = 'designEngineer'
    for a in sys.argv[2:]:
        if a.startswith('--lane='):
            lane = a.split('=', 1)[1]
    src = json.load(open(os.path.join(ROOT, 'Assets/resume.json')))
    priv_path = os.path.join(ROOT, '.local/private.json')
    priv = json.load(open(priv_path)) if os.path.exists(priv_path) else {}

    def pdftotext(mode):
        args = ['pdftotext']
        if mode == 'layout':
            args.append('-layout')
        args += [pdf, '-']
        return subprocess.run(args, capture_output=True, text=True, check=True).stdout

    raw = pdftotext('raw')
    layout = pdftotext('layout')
    fails = []

    def check(name, ok, detail=''):
        print(f"{'OK ' if ok else 'FAIL'} {name}" + (f" — {detail}" if detail and not ok else ''))
        if not ok:
            fails.append(name)

    # --- PDF integrity -------------------------------------------------
    try:
        from pypdf import PdfReader
        r = PdfReader(pdf)
        check('PDF opens and is non-empty', len(r.pages) >= 1)
        text_layer = r.pages[0].extract_text() or ''
        check('has text layer (not scanned image)', len(text_layer) > 500)
    except Exception as e:
        check('PDF opens via pypdf', False, str(e))
        print('\nUNRECOVERABLE — cannot parse PDF'); sys.exit(1)

    mode = os.path.basename(pdf)
    one_page = 'long' not in mode and 'cv' not in mode
    if one_page:
        check('one page', len(r.pages) == 1, f'{len(r.pages)} pages')

    # --- lane identity --------------------------------------------------
    lane_def = src['lanes'].get(lane, {})
    expected_headline = (lane_def.get('headline') or src['basics']['headline']).upper()
    check(f'headline matches {lane} lane', expected_headline in raw.upper(), f'expected "{expected_headline}"')
    summary_frag = lane_def.get('summary', '')[:60]
    if summary_frag:
        check(f'summary matches {lane} lane', summary_frag in raw, f'expected "{summary_frag}..."')

    # --- contact block ---------------------------------------------------
    basics = src['basics']
    for frag, name in [
        (basics['email'], 'email'),
        (priv.get('phone', ''), 'phone (from private overlay)'),
        ('johnhanacek.com', 'website'),
        ('linkedin.com/in/johnhanacek', 'LinkedIn'),
        ('github.com/jjh111', 'GitHub'),
        (basics['workMode'], 'work mode'),
        (basics['citizenship'], 'citizenship'),
    ]:
        if frag:
            check(name, frag.lower() in raw.lower())

    # --- wording rules ---------------------------------------------------
    check('no em-dashes', '—' not in raw)  # en-dashes in date ranges are fine
    check('no "desgin" typo', 'desgin' not in raw.lower())
    check('no self-assessment "not mockups"', 'not mockups' not in raw.lower())

    # --- dates -----------------------------------------------------------
    check("no bare 'now' as end date", not re.search(r'\d{4}–now', raw))
    check('open roles read –Present', not re.search(r'\d{4}–now', raw) and ('–Present' in raw or '2024–Present' in raw))

    # --- structure: header→bullet association (raw mode) ------------------
    # The DESIGNED one-page modes keep the right-aligned flexbox date column,
    # which fragments raw text order (headers detach from bullets). That is a
    # known cosmetic parse artifact for humans; the ATS twin is the parse-safe
    # upload. Only the ATS twin and the long CV must pass the gap checks.
    strict_structure = 'ats' in os.path.basename(pdf).lower() or 'long' in os.path.basename(pdf).lower()
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    orgs = src['work']
    for w in orgs:
        org_key = w['org'].split(' (')[0].split(',')[0].strip()
        hits = [i for i, l in enumerate(lines) if org_key in l]
        check(f'org present: {org_key}', bool(hits))
        if not hits or w.get('compressed'):
            continue
        hi = hits[0]
        # first bullet of this role should appear within 5 lines after the header
        first_bullet = (w.get('onePage') or [h['text'] for h in w.get('highlights', [])[:1]])
        if first_bullet:
            probe = first_bullet[0][:40]
            b_hits = [i for i, l in enumerate(lines) if probe in l]
            if b_hits:
                gap = min(abs(b - hi) for b in b_hits)
                if strict_structure:
                    check(f'{org_key}: header→first bullet gap ≤5 (got {gap})', gap <= 5,
                          'raw-mode paint order detaches bullets from their header')
                else:
                    print(f' --  {org_key}: header→bullet gap {gap} (informational, designed PDF)')

    # --- education: thesis attributed to the right school -----------------
    # Same strictness split: the designed one-page fragment raw education order.
    ma_i = next((i for i, l in enumerate(lines) if 'Georgetown University' in l), None)
    thesis_i = next((i for i, l in enumerate(lines) if 'As We May Sketch' in l), None)
    ba_i = next((i for i, l in enumerate(lines) if 'UC San Diego' in l), None)
    if ma_i is not None and thesis_i is not None and ba_i is not None:
        if strict_structure:
            check('Georgetown thesis lines between MA and BA lines (not after BA)', ma_i < thesis_i < ba_i,
                  f'MA@{ma_i} thesis@{thesis_i} BA@{ba_i}')
        else:
            print(f' --  thesis@{thesis_i} MA@{ma_i} BA@{ba_i} (informational, designed PDF)')

    # --- awards: each year+keyword pair on adjacent text -------------------
    for a in src['awards']:
        frag = (a.get('short') or a['title']).split(':')[0][:25]
        check(f"award: {a['year']} {frag}", frag in raw)

    # --- skills keyword coverage -------------------------------------------
    # Line-wrap proof: "LM Studio" can break across lines as "LM\nStudio",
    # so normalize whitespace before matching.
    pdf_text = re.sub(r'\s+', ' ', raw.lower())
    missing = []
    for t in src['skills']['tools']:
        name = t['name']
        tier = t.get('tier', '')
        # only daily/shipped tiers are expected on the page
        if tier in ('daily', 'shipped'):
            key = name.split(' (')[0].split(' /')[0].lower()
            if key not in pdf_text:
                missing.append(name)
    check('all daily/shipped tools present', not missing, f'missing: {missing}')

    # --- ATS twin agreement (if checking the apply PDF) --------------------
    print()
    if fails:
        print(f'{len(fails)} FAILURE(S)')
        sys.exit(1)
    print('ALL PASS')

if __name__ == '__main__':
    main()
