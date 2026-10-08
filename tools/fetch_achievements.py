"""
Scrape all Aion 2 achievements from aion2.app into web/public/achievements.json (served to the UI).

IDs come from sitemap-db.xml (3xxxxxxxx = Elyos, 4xxxxxxxx = Asmodian, mirrored).
DE detail pages /de/db/achievements/<id> are parsed from the rendered HTML.
EN names/categories come from the paginated EN list (/db/achievements?page=N, 60 per page);
EN detail pages only with --en (doubles the run time).

Polite: one request per second, browser User-Agent, retry with backoff, every page cached
under data/cache_aion2app/ so reruns don't refetch. /api/ is never touched (robots.txt).

Usage:  python fetch_achievements.py [--en] [--out ../web/public/achievements.json]
"""

import argparse
import bisect
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BASE = "https://aion2.app"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data", "cache_aion2app")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")
_last = 0.0


def fetch(path):
    """GET BASE+path, cached on disk, at most one request per second."""
    global _last
    fn = os.path.join(CACHE, re.sub(r"[^\w.-]+", "_", path.strip("/")) + ".html")
    if os.path.exists(fn):
        with open(fn, encoding="utf-8") as f:
            return f.read()
    assert "/api/" not in path
    for attempt in range(5):
        time.sleep(max(0.0, _last + 1.0 - time.time()))
        _last = time.time()
        try:
            req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept-Language": "de,en"})
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode("utf-8")
            break
        except (urllib.error.URLError, TimeoutError) as e:
            if isinstance(e, urllib.error.HTTPError) and e.code == 404:
                return None
            wait = 2 ** attempt * 2
            print(f"  {path}: {e} - retry in {wait}s", file=sys.stderr)
            time.sleep(wait)
    else:
        raise RuntimeError(f"giving up on {path}")
    os.makedirs(CACHE, exist_ok=True)
    with open(fn, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def achievement_ids():
    xml = fetch("/sitemap-db.xml")
    return sorted(set(re.findall(r"aion2\.app/db/achievements/(\d{9})<", xml)))


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def num(s):
    return int(s.replace(",", "").replace(".", ""))


ITEM_RE = re.compile(r'<a [^>]*href="/(?:de/)?db/items/(\d+)">.*?border-(\w+)-500.*?truncate[^"]*">(.*?)</a>', re.S)
TITLE_RE = re.compile(r'href="/(?:de/)?db/titles/(\d+)">.*?mr-1">Title</span>(.*?)</span>(.*?)</a>', re.S)
STAT_RE = re.compile(r'text-\[#8b949e\]">([^<]+)<span[^>]*> ?([+-][\d.,%]+)</span>')
CURRENCY_RE = re.compile(r'<span class="[^"]*text-amber-700[^"]*">([^<]*?)<span[^>]*> ×([\d,]+)</span></span>')
# Border colour of the item icon = item grade
ITEM_GRADE = {"gray": "common", "green": "rare", "blue": "legend", "amber": "unique", "teal": "special",
              "orange": "epic", "purple": "mythic", "red": "mythic"}


def parse_rewards(s):
    rewards = {}
    for label, n in CURRENCY_RE.findall(s):
        key = re.sub(r"^\W+", "", text(label)).lower() or "currency"
        rewards[key] = num(n)
    for iid, color, inner in ITEM_RE.findall(s):
        m = re.search(r" ×([\d,]+)</span>", inner)
        rewards.setdefault("items", []).append({
            "id": int(iid), "name": text(inner.split("<span")[0]),
            "count": num(m.group(1)) if m else 1, "grade": ITEM_GRADE.get(color, color)})
    for tid, name, rest in TITLE_RE.findall(s):
        rewards["title"] = {"id": int(tid), "name": text(name),
                            "stats": {text(k): v for k, v in STAT_RE.findall(rest)}}
    return rewards


def parse_detail(page):
    page = re.sub(r"<script.*?</script>|<!-- -->", "", page, flags=re.S)
    page = page[page.find("<h1"):page.find("Game client")]
    head, _, body = page.partition("<section")
    a = {
        "name": text(re.search(r"<h1[^>]*>(.*?)</h1>", head).group(1)),
        "faction_label": text(re.search(r'tracking-wide px-1\.5[^"]*">(.*?)</span>', head).group(1)),
        "category": text(re.search(r'bg-gray-100 dark:bg-\[#1d2d44\][^"]*">(.*?)</span>', head).group(1)).split(" ", 1)[-1],
        "grade": text(re.search(r"Grade: <span[^>]*>(.*?)</span>", head).group(1)),
        "description": text((re.search(r"<p [^>]*mt-3\">(.*?)</p>", head) or re.match("()", "")).group(1)),
        "tiers": [],
    }
    for blk in body.split('<div class="border border-gray-200')[1:]:
        hdr, _, rew = blk.partition('<div class="flex flex-wrap gap-1 p-2">')
        a["tiers"].append({
            "tier": int(re.search(r'tabular-nums">(\d+)</span>', hdr).group(1)),
            "name": text(re.search(r'font-medium[^"]*truncate">(.*?)</span>', hdr).group(1)),
            "objective": text(re.search(r'block text-\[11px\][^"]*">(.*?)</span>', hdr).group(1)),
            "goal": num(re.search(r"Goal ([\d,.]+)", hdr).group(1)),
            "rewards": parse_rewards(rew),
        })
    return a


def parse_list(page):
    """EN list page -> {id: (name, category, first objective)}."""
    out = {}
    for aid, body in re.findall(r'href="/db/achievements/(\d{9})">(.*?)</a>', page, re.S):
        body = body.replace("<!-- -->", "")
        spans = [text(s) for s in re.findall(r"<span[^>]*>([^<]*)</span>", body)]
        out[aid] = {"name": spans[0], "category": spans[2].split(" ", 1)[-1], "objective": spans[3]}
    return out


def en_list():
    out, page = {}, 1
    while True:
        got = parse_list(fetch(f"/db/achievements?page={page}") or "")
        if not got or set(got) <= set(out):
            return out
        out.update(got)
        page += 1


# --- objective type ----------------------------------------------------------------------------
# The site exposes no objective type / target ids, so the type is derived from the DE objective
# text (first matching rule wins). Tags mark content that needs groups, other players or skill.
DUNGEONS_RX = ["Kraohöhle", "Draupnir", "Uruguguschlucht", "Luftinsel", "Feuertempel", "Grimmhornhöhle"]
OBJECTIVE_RULES = [
    ("PCLevel", r"^Erreiche Stufe \d"),
    ("Login", r"Logge dich"),
    ("PlayTime", r"Spiele insg\."),
    ("ItemLevel", r"Gegenstandsstufe"),
    ("Daevanion", r"Daevanion"),
    ("Social", r"Legion – |Freund"),
    ("Pet", r"Pet|Kenntnis|Spezies"),
    ("Quest", r"[Qq]uest|[Gg]esuche"),
    ("DungeonClear", r"^Schließe .*(Erkundung|Eroberung|Abgrundsveredelung|Dungeons|Garnison)"),
    ("Death", r"^Stirb"),
    ("KillPlayer", r"Spieler"),
    ("KillFieldBoss", r"Feld-Boss|Berüchtigtes Feld-Monster"),
    ("KillNpc", r"^Besiege"),
    ("Invasion", r"Invasion"),
    ("MiniGame", r"Shugofesta|^Nimm .* teil|Ginsengmarken"),
    ("DungeonTask", r"^(Aktiviere|Lege dich).*(" + "|".join(DUNGEONS_RX) + ")"),
    ("Explore", r"Besuche|Kibelisk|Monolith|Windpfad|Drachenwind|zeit$|Raumzeit|Kuben|Spuren des"),
    ("Craft", r"Herstellung|^Stelle .* her"),
    ("Gather", r"[Ss]ammel|Sammle .*erfolgreich|Essenzextraktion"),
    ("Collect", r"^Sammle|^Erhalte .*Ausrüstungsteile"),
    ("Enhance", r"Verbessere|Verstärke|Binde|Seelenbindung|Extrahiere|Götterstein"),
    ("Economy", r"Kinah|Handelsgilde|Lager|Kisk|Essen|Verwandlung"),
]
DUNGEONS = ["Kraohöhle", "Draupnir", "Uruguguschlucht", "Vakrons Luftinsel", "Feuertempel", "Grimmhornhöhle",
            "Abgrundsveredelung: Ludra", "Versiegelte", "Garnison", "Expeditions"]
REGIONS = ["Verteron", "Altgard", "Reshanta", "Insel der Ewigkeit", "Rubininsel"]
TAG_RULES = {"dungeon": "|".join(DUNGEONS), "pvp": r"Spieler|Invasion", "boss": r"Boss|Berüchtigt",
             "timed": r"innerhalb von", "deathless": r"ohne zu sterben", "solo": r"Solo",
             "high_grade": r"Einzigartig|Episch|Makellos|\+1[05]|Meister|Drakonisch"}


def classify(objective):
    otype = next((t for t, rx in OBJECTIVE_RULES if re.search(rx, objective)), "Other")
    tags = [t for t, rx in TAG_RULES.items() if re.search(rx, objective)]
    m = re.match(r"\[(.+?)\]", objective)
    target = (m.group(1) if m else
              next((d for d in DUNGEONS if d in objective), None) or
              (re.search(r"(?:Feld-Boss|Feld-Monster) (.+)$", objective) or re.match("()", "")).group(1) or None)
    region = next((r for r in REGIONS if r in objective), None)
    return otype, tags, target, region


# --- difficulty --------------------------------------------------------------------------------
# difficulty = TYPE_BASE[type]                     effort/access of the activity (0-60)
#            + 35 * volume percentile           tier goal vs. all tier goals of the same type
#            + sum(TAG_BONUS[tag])              timed / deathless / solo / dungeon / pvp / boss / high grade
#            + GRADE_BONUS[grade]               achievement grade (currently all "Gewöhnlich")
# clamped to 0..100. An achievement's difficulty is that of its final tier (full completion);
# "difficulty_first" is the first tier (what you can get quickly).
TYPE_BASE = {"Social": 5, "PCLevel": 10, "Login": 10, "PlayTime": 15, "Explore": 15, "Quest": 20, "MiniGame": 20,
        "Death": 20, "Economy": 25, "KillNpc": 25, "Gather": 30, "Pet": 30, "Collect": 35, "Craft": 35,
        "Daevanion": 35, "Enhance": 40, "ItemLevel": 40, "DungeonClear": 40, "DungeonTask": 35, "KillFieldBoss": 40,
        "Invasion": 45, "KillPlayer": 55, "Other": 30}
TAG_BONUS = {"dungeon": 10, "pvp": 10, "boss": 5, "timed": 15, "deathless": 10, "solo": 15, "high_grade": 10}
GRADE_BONUS = {"Gewöhnlich": 0, "Selten": 5, "Legendär": 10, "Einzigartig": 15, "Episch": 20}


def score_difficulty(achievements):
    goals = {}
    for a in achievements:
        for t in a["tiers"]:
            goals.setdefault(a["objective_type"], []).append(t["goal"])
    for g in goals.values():
        g.sort()
    for a in achievements:
        g = goals[a["objective_type"]]
        for t in a["tiers"]:
            pct = (bisect.bisect_left(g, t["goal"]) + bisect.bisect_right(g, t["goal"])) / 2 / len(g)
            tags = classify(t["objective_de"])[1]
            d = (TYPE_BASE[a["objective_type"]] + 35 * pct + sum(TAG_BONUS[x] for x in tags)
                 + GRADE_BONUS.get(a["grade"], 0))
            t["difficulty"] = max(0, min(100, round(d)))
        a["difficulty"] = a["tiers"][-1]["difficulty"] if a["tiers"] else 0
        a["difficulty_first"] = a["tiers"][0]["difficulty"] if a["tiers"] else 0


def build(aid, de, en_row, en_detail):
    first = de["tiers"][0]["objective"] if de["tiers"] else de["description"]
    otype, tags, target, region = classify(first)
    tags = sorted({x for t in de["tiers"] for x in classify(t["objective"])[1]} | set(tags))
    tiers = []
    for i, t in enumerate(de["tiers"]):
        row = {"tier": t["tier"], "name_de": t["name"], "objective_de": t["objective"]}
        if en_detail and i < len(en_detail["tiers"]):
            row.update(name_en=en_detail["tiers"][i]["name"], objective_en=en_detail["tiers"][i]["objective"])
        elif i == 0 and en_row:
            row["objective_en"] = en_row["objective"]
        row.update(goal=t["goal"], objective_type=classify(t["objective"])[0], rewards=t["rewards"])
        tiers.append(row)
    kina = sum(t["rewards"].get("kina", 0) for t in tiers)
    titles = [t["rewards"]["title"]["name"] for t in tiers if "title" in t["rewards"]]
    return {
        "id": int(aid),
        "name_de": de["name"],
        "name_en": (en_detail or {}).get("name") or (en_row or {}).get("name"),
        "faction": "Elyos" if aid[0] == "3" else "Asmodian",
        "mirror_id": int(("4" if aid[0] == "3" else "3") + aid[1:]),
        "category_de": de["category"],
        "category_en": (en_row or {}).get("category"),
        "grade": de["grade"],
        "description_de": de["description"],
        "objective_type": otype,
        "target": target,
        "region": region,
        "tags": tags,
        "tier_count": len(tiers),
        "final_goal": tiers[-1]["goal"] if tiers else None,
        "total_kina": kina,
        "titles": titles,
        "tiers": tiers,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--en", action="store_true", help="also fetch EN detail pages (tier texts, ~11 min)")
    ap.add_argument("--out", default=os.path.join(ROOT, "web", "public", "achievements.json"))
    args = ap.parse_args()
    t0 = time.time()
    ids = achievement_ids()
    print(f"{len(ids)} achievement ids")
    en_rows = en_list()
    print(f"{len(en_rows)} EN names from list pages")
    out = []
    for i, aid in enumerate(ids, 1):
        de = parse_detail(fetch(f"/de/db/achievements/{aid}"))
        en = parse_detail(fetch(f"/db/achievements/{aid}")) if args.en else None
        out.append(build(aid, de, en_rows.get(aid), en))
        if i % 50 == 0:
            print(f"  {i}/{len(ids)}", flush=True)
    # Mirrored Asmodian entries take the Elyos objective type so both factions score alike.
    by_id = {a["id"]: a for a in out}
    for a in out:
        twin = by_id.get(a["mirror_id"])
        if a["faction"] == "Asmodian" and twin:
            a["objective_type"] = twin["objective_type"]
    score_difficulty(out)
    doc = {"source": "aion2.app", "fetched": datetime.date.today().isoformat(), "count": len(out),
           "difficulty_formula": "see tools/fetch_achievements.py (TYPE_BASE + 35*volume pct + tag bonus)",
           "achievements": out}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    types = {}
    for a in out:
        types[a["objective_type"]] = types.get(a["objective_type"], 0) + 1
    print(f"wrote {len(out)} achievements to {args.out} in {time.time() - t0:.0f}s")
    print("objective types:", dict(sorted(types.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
