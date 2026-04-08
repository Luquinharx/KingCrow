# -*- coding: utf-8 -*-
import os
import logging
from datetime import datetime, timedelta
import pytz
import requests
from bs4 import BeautifulSoup
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

# Config
CLAN_URL = "https://www.dfprofiler.com/clan/view/1405"
FIREBASE_DB_URL = os.getenv("FIREBASE_DB_URL", "https://your-firebase-db.firebaseio.com/")
USER_AGENT = "Mozilla/5.0 (compatible; scraper/1.0)"
BRAZIL_TZ = pytz.timezone("America/Sao_Paulo")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def parse_int(text):
    if not text:
        return 0
    s = "".join(ch for ch in text if ch.isdigit())
    return int(s) if s else 0


def find_members_table(soup):
    for table in soup.find_all("table"):
        ths = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if any("username" in h or "name" in h for h in ths) or table.find("a"):
            return table, ths
    return None, None


def get_username_from_row(tr, headers):
    a = tr.find("a")
    if a and a.get_text(strip=True):
        return a.get_text(strip=True)
    tds = tr.find_all("td")
    for i, h in enumerate(headers):
        if ("username" in h or "name" in h) and i < len(tds):
            txt = tds[i].get_text(strip=True)
            if txt:
                return txt
    for td in tds:
        txt = td.get_text(strip=True)
        if txt:
            return txt
    return None


def find_weekly_loot_index(headers):
    for i, h in enumerate(headers):
        if "weekly" in h and "loot" in h:
            return i
    for i, h in enumerate(headers):
        if "weekly" in h or "loot" in h or "loots" in h:
            return i
    return None


def find_all_time_loot_index(headers):
    for i, h in enumerate(headers):
        if "all" in h and "loot" in h:
            return i
        if "all time" in h and "loot" in h:
            return i
    for i, h in enumerate(headers):
        if "all time" in h or ("all" in h and ("loot" in h or "loots" in h)):
            return i
    return None


def verify_db():
    root = FIREBASE_DB_URL.rstrip("/") + "/.json"
    try:
        r = requests.get(root, timeout=10)
    except Exception:
        logging.exception("Erro ao verificar Realtime DB")
        return False
    if r.status_code == 200:
        return True
    logging.error("Resposta ao verificar DB: %s %s", r.status_code, r.text[:200])
    return False


def date_key_for_now():
    """O 'dia' começa às 09:02 de Brasília.
    Coletas antes das 09:02 ainda pertencem ao dia anterior."""
    now = datetime.now(tz=BRAZIL_TZ)
    cutoff = now.replace(hour=9, minute=2, second=0, microsecond=0)
    if now < cutoff:
        day = (now - timedelta(days=1)).date()
    else:
        day = now.date()
    return day.isoformat()  # YYYY-MM-DD


def scrape_and_push():
    logging.info("Iniciando scrape agendado (salvando snapshot diário/hourly)")
    try:
        resp = requests.get(CLAN_URL, headers={"User-Agent": USER_AGENT}, timeout=20)
        resp.raise_for_status()
    except Exception:
        logging.exception("Erro ao buscar a página do clã")
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    table, headers = find_members_table(soup)
    if not table:
        logging.error("Tabela de membros não encontrada")
        return
    tbody = table.find("tbody")
    if not tbody:
        logging.error("tbody da tabela não encontrado")
        return

    if not verify_db():
        logging.error("Realtime DB inacessível. Abortando envio.")
        return

    all_time_idx = find_all_time_loot_index(headers or [])
    rows = tbody.find_all("tr")
    now_iso = datetime.now(tz=BRAZIL_TZ).isoformat()
    date_key = date_key_for_now()

    # endpoint for daily snapshots
    daily_base = FIREBASE_DB_URL.rstrip("/") + f"/daily/{date_key}"
    # store hourly snapshots under /daily/{YYYY-MM-DD}/hourly/{HH-MM}/{user}.json
    hour_key = datetime.now(tz=BRAZIL_TZ).strftime("%H-%M")
    hourly_base = FIREBASE_DB_URL.rstrip("/") + f"/daily/{date_key}/hourly/{hour_key}"
    raw_base = FIREBASE_DB_URL.rstrip("/") + "/members_scrapes"
    # endpoint for weekly aggregates
    week_key = None
    def get_week_key(dt=None):
        d = dt or datetime.now(tz=BRAZIL_TZ).date()
        y, w, _ = d.isocalendar()
        return f"{y}-{w:02d}"

    sent = 0
    for tr in rows:
        username = get_username_from_row(tr, headers or [])
        if not username:
            continue
        cols = tr.find_all("td")
        # extract all-time loot value
        all_time_loot = 0
        nums_by_index = []
        if all_time_idx is not None and all_time_idx < len(cols):
            all_time_loot = parse_int(cols[all_time_idx].get_text(strip=True))
        else:
            texts = [td.get_text(strip=True) for td in cols]
            nums = [parse_int(t) for t in texts if any(ch.isdigit() for ch in t)]
            all_time_loot = nums[0] if nums else 0

        # build index->num map to allow fallback selection if needed
        for i, td in enumerate(cols):
            txt = td.get_text(strip=True)
            nums_by_index.append((i, parse_int(txt)))

        # validate against previous day's value; if current < previous, try to pick another numeric column
        # safe username for urls
        safe_username_key = requests.utils.requote_uri(username)

        prev_date = (datetime.now(tz=BRAZIL_TZ).date() - timedelta(days=1)).isoformat()
        try:
            prev_url = FIREBASE_DB_URL.rstrip('/') + f"/daily/{prev_date}/{safe_username_key}.json"
            prev_r = requests.get(prev_url, timeout=10)
            if prev_r.status_code == 200 and prev_r.text and prev_r.text != 'null':
                prev_json = prev_r.json() or {}
                prev_val = int(prev_json.get('alltimeloot', 0))
            else:
                prev_val = None
        except Exception:
            prev_val = None

        if prev_val is not None and all_time_loot < prev_val:
            # try to find a numeric column in the row that is >= prev_val
            candidate = None
            for idx, val in nums_by_index:
                if val >= prev_val:
                    if candidate is None or val > candidate[1]:
                        candidate = (idx, val)
            if candidate:
                logging.info("Detected decreasing alltimeloot for %s (cur=%s prev=%s). Using column index %s value %s", username, all_time_loot, prev_val, candidate[0], candidate[1])
                all_time_loot = candidate[1]
            else:
                logging.warning("alltimeloot for %s is lower than previous (%s < %s) and no candidate numeric column found", username, all_time_loot, prev_val)

        # save hourly snapshot under /daily/{YYYY-MM-DD}/hourly/{HH-MM}/{username}
        hourly_url = hourly_base + f"/{safe_username_key}.json"
        # also update daily latest snapshot under /daily/{YYYY-MM-DD}/{username}
        daily_url = daily_base + f"/{safe_username_key}.json"

        # compute daily gain: today - yesterday (if yesterday exists) otherwise today - base
        try:
            if prev_val is not None:
                daily_gain = all_time_loot - prev_val
            else:
                base_date = '2026-02-23'
                base_url = FIREBASE_DB_URL.rstrip('/') + f"/daily/{base_date}/{safe_username_key}.json"
                base_r = requests.get(base_url, timeout=10)
                base_val = 0
                if base_r.status_code == 200 and base_r.text and base_r.text != 'null':
                    base_json = base_r.json() or {}
                    base_val = int(base_json.get('alltimeloot', 0))
                daily_gain = all_time_loot - base_val
        except Exception:
            daily_gain = 0

        payload_daily = {"alltimeloot": all_time_loot, "collected_at": now_iso, "daily_gain": daily_gain, "hour": hour_key}
        try:
            # write hourly snapshot
            r_hour = requests.put(hourly_url, json=payload_daily, timeout=15)
            r_hour.raise_for_status()
            # update daily latest (overwrites to represent latest closing within the day)
            r1 = requests.put(daily_url, json=payload_daily, timeout=15)
            r1.raise_for_status()
        except Exception:
            logging.exception("Falha ao gravar snapshot diário user=%s", username)
            continue

        # also keep raw per-run log (push)
        try:
            r2 = requests.post(raw_base + ".json", json={"username": username, "alltimeloot": all_time_loot, "collected_at": now_iso, "daily_gain": daily_gain}, timeout=15)
            r2.raise_for_status()
        except Exception:
            logging.exception("Falha ao gravar raw entry user=%s", username)

        sent += 1

        # compute weekly aggregate relative to base date (2026-02-23)
        try:
            # compute weekly aggregate as difference between successive week closings
            base_date = datetime.strptime('2026-02-23', '%Y-%m-%d').date()
            today_date = datetime.now(tz=BRAZIL_TZ).date()
            days_since_base = (today_date - base_date).days
            if days_since_base >= 0:
                week_index = days_since_base // 7  # 0 = before first full week
                # closure date for this week (relative to base)
                closure_date = base_date + timedelta(days=week_index * 7)
                prev_closure_date = base_date + timedelta(days=max(0, (week_index - 1) * 7))

                closure_str = closure_date.isoformat()
                prev_closure_str = prev_closure_date.isoformat()

                safe = requests.utils.requote_uri(username)
                # helper to get value for a date or nearest earlier date
                def get_value_for_date(dstr):
                    url = FIREBASE_DB_URL.rstrip('/') + f"/daily/{dstr}/{safe}.json"
                    try:
                        r = requests.get(url, timeout=8)
                        if r.status_code == 200 and r.text and r.text != 'null':
                            j = r.json() or {}
                            return int(j.get('alltimeloot', 0))
                    except Exception:
                        return None
                    return None

                closure_val = get_value_for_date(closure_str)
                # if closure value not found (missing snapshot), try to find latest available <= closure by stepping back
                if closure_val is None:
                    for back in range(0, 7):
                        d = closure_date - timedelta(days=back)
                        v = get_value_for_date(d.isoformat())
                        if v is not None:
                            closure_val = v
                            closure_str = d.isoformat()
                            break

                prev_val = get_value_for_date(prev_closure_str)
                if prev_val is None:
                    for back in range(0, 7):
                        d = prev_closure_date - timedelta(days=back)
                        v = get_value_for_date(d.isoformat())
                        if v is not None:
                            prev_val = v
                            prev_closure_str = d.isoformat()
                            break

                weekly_value = None
                if closure_val is not None and prev_val is not None:
                    weekly_value = closure_val - prev_val

                week_key = get_week_key()
                weekly_url = FIREBASE_DB_URL.rstrip('/') + f"/weekly/{week_key}/{safe}.json"
                payload_weekly = {"weekly_loot": (weekly_value if weekly_value is not None else 0), "closing_date": closure_str, "prev_closing_date": prev_closure_str, "updated_at": now_iso}
                try:
                    wr = requests.put(weekly_url, json=payload_weekly, timeout=15)
                    wr.raise_for_status()
                except Exception:
                    logging.exception("Falha ao gravar weekly aggregate for user=%s", username)
        except Exception:
            logging.exception("Erro ao calcular weekly aggregate for user=%s", username)

    logging.info("Scrape agendado concluído. Snapshots gravados: %d de %d linhas (date=%s)", sent, len(rows), date_key)


if __name__ == "__main__":
    scheduler = BlockingScheduler()
    # roda a cada hora no minuto 02 (ex.: 00:02, 01:02, 02:02...) horário de Brasília
    trigger = CronTrigger(minute=2, timezone=BRAZIL_TZ)
    scheduler.add_job(scrape_and_push, trigger)
    logging.info("Agendado: toda hora no minuto 02 (America/Sao_Paulo). Iniciando scheduler...")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        pass
