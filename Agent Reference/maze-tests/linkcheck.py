#!/usr/bin/env python3
"""Check that every local href/src/source/poster/url() in the site's HTML resolves to a real file."""
import re, sys, os, urllib.parse

ROOT = os.environ.get("SITE_ROOT", os.getcwd())
pages = [f for f in os.listdir(ROOT) if f.endswith(".html")]
pages += ["fish-demo/index.html", "Assets/JH-brand-styleguide.html",
          "Assets/DemosPlayground/test-llm.html", "Assets/DemosPlayground/test-vision.html"]

ATTR = re.compile(r'(?:href|src|poster)\s*=\s*["\']([^"\']+)["\']', re.I)
CSSURL = re.compile(r'url\(\s*["\']?([^"\')\s]+)["\']?\s*\)')

bad, checked = [], 0
for page in pages:
    path = os.path.join(ROOT, page)
    if not os.path.exists(path):
        bad.append((page, "(page itself missing)")); continue
    html = open(path, encoding="utf-8", errors="replace").read()
    refs = set(ATTR.findall(html)) | set(CSSURL.findall(html))
    base = os.path.dirname(path)
    for ref in refs:
        r = ref.strip()
        if not r or r.startswith(("http://", "https://", "//", "mailto:", "tel:", "#", "data:", "javascript:", "blob:")):
            continue
        r = urllib.parse.unquote(r.split("#")[0].split("?")[0])
        if not r:
            continue
        target = os.path.normpath(os.path.join(ROOT if r.startswith("/") else base, r.lstrip("/")))
        checked += 1
        if not os.path.exists(target):
            bad.append((page, ref))

# also check JSON manifests reference real files
import json
chunks = json.load(open(os.path.join(ROOT, "Assets/search-chunks.json")))
items = chunks if isinstance(chunks, list) else chunks.get("chunks", [])
for c in items:
    for k in ("image", "video", "model3d", "url"):
        v = c.get(k) if isinstance(c, dict) else None
        if v and not v.startswith("http"):
            t = os.path.normpath(os.path.join(ROOT, urllib.parse.unquote(v.lstrip("./").split("#")[0])))
            checked += 1
            if not os.path.exists(t):
                bad.append(("search-chunks.json", v))

print(f"checked {checked} local refs across {len(pages)} pages")
if bad:
    print(f"BROKEN ({len(bad)}):")
    for p, r in sorted(set(bad)):
        print(f"  {p}: {r}")
    sys.exit(1)
print("ALL OK")
