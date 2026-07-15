"""Run as: python debug_scrape.py   (from backend/ directory)"""
import sys, traceback, json
sys.path.insert(0, '.')
from agent.scraper import _scrape_with_playwright, _parse_html_table

for label, url in [
    ('llm-stats TTS', 'https://llm-stats.com/leaderboards/best-text-to-speech-ai'),
]:
    print(f'\n=== {label} ===')
    try:
        pw = _scrape_with_playwright(url)
        table_html    = pw.get("table_html", "")
        rendered_html = pw.get("rendered_html", "")
        body_text     = pw.get("body_text", "")
        status        = pw.get("status", 0)

        print(f'  status={status}')
        print(f'  table_html len={len(table_html)}')
        print(f'  rendered_html len={len(rendered_html)}')
        print(f'  body_text len={len(body_text)}')

        if table_html:
            rows = _parse_html_table(table_html)
            print(f'  table_html rows={len(rows)}')
            if rows:
                print(f'  row0={json.dumps(rows[0], ensure_ascii=False)[:300]}')

        if rendered_html:
            rows2 = _parse_html_table(rendered_html)
            print(f'  rendered_html rows={len(rows2)}')
            if rows2:
                print(f'  row0={json.dumps(rows2[0], ensure_ascii=False)[:300]}')
            else:
                # show tables count
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(rendered_html, "html.parser")
                tables = soup.find_all("table")
                print(f'  tables in rendered_html: {len(tables)}')
                for i, t in enumerate(tables[:3]):
                    rows_t = t.find_all("tr")
                    print(f'    table[{i}]: {len(rows_t)} rows')
                    if rows_t:
                        hdrs = [td.get_text(strip=True) for td in rows_t[0].find_all(["th","td"])]
                        print(f'    headers: {hdrs[:8]}')

        if body_text:
            print(f'  body_text[:600]={body_text[:600]!r}')

    except Exception:
        traceback.print_exc()
