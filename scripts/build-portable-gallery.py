"""Build a single-file phone gallery; screenshots remain original PNG bytes."""
from pathlib import Path
import base64
import html

root = Path(__file__).resolve().parents[1] / 'docs/ui-gallery'
source = root / '2026-09-06-organization-rebuild'
output = root / 'phone/index.html'
cards = []
for path in sorted(source.glob('*.png'), key=lambda p: ('home' not in p.stem, p.name)):
    name = path.stem.replace('mocha-', '').replace('paper-', '').replace('-', ' ').title()
    theme = 'Catppuccin Mocha' if path.stem.startswith('mocha') else 'Paper'
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    cards.append(f'<figure><figcaption><span>{theme}</span><h2>{html.escape(name)}</h2></figcaption><img src="data:image/png;base64,{encoded}" alt="{html.escape(name)} in {theme}, actual iPhone simulator screenshot" width="1320" height="2868"></figure>')
page = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Glassleaf — portable phone gallery</title>
<style>
:root{font-family:system-ui,sans-serif;color:#21332a;background:#f5f5f0;--surface:#fff;--muted:#5e6a62;--line:#d9dfd8}*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1100px;margin:auto;padding:24px}header{padding-top:40px}header p{max-width:620px;line-height:1.6;color:var(--muted)}.brand{font-size:12px;letter-spacing:2px;font-weight:700}h1{font-size:clamp(30px,6vw,44px);letter-spacing:-1.5px;margin:16px 0}main{display:grid;grid-template-columns:minmax(0,1fr);gap:24px}figure{margin:0;border:1px solid var(--line);border-radius:18px;background:var(--surface);overflow:hidden}figcaption{padding:18px}figcaption span{font-size:12px;color:var(--muted)}h2{font-size:18px;margin:6px 0 0}img{display:block;width:100%;height:auto}footer{color:var(--muted);font-size:12px;line-height:1.6}@media(min-width:650px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1000px){main{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:500px){header,main,footer{padding:20px 16px}}@media(prefers-color-scheme:dark){:root{color:#cdd6f4;background:#1e1e2e;--surface:#242436;--muted:#bac2de;--line:#45475a}}
</style></head><body><header><div class="brand">GLASSLEAF / SEPTEMBER 6, 2026</div><h1>The latest Glassleaf.</h1><p>17 original iPhone captures from the organization rebuild, in Paper and Catppuccin Mocha. Every image is embedded in this file. Save this HTML to keep the gallery offline.</p></header><main>'''
page += ''.join(cards)
page += '''</main><footer>iPhone 17 Pro Max · iOS 26.5 Simulator · Original sample books. These are app screenshots, not a browser version of the app. No image server, scripts, or internet connection are needed once this file is downloaded.</footer></body></html>'''
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(page)
print(f'{output}: {len(cards)} embedded images, {output.stat().st_size / 1024 / 1024:.1f} MiB')
