# -*- coding: utf-8 -*-
import os
import logging
import re
from datetime import datetime, timedelta
import pytz
import requests
from bs4 import BeautifulSoup
from apscheduler.schedulers.blocking import BlockingScheduler
from snapshot_utils import save_snapshot, load_snapshot, compare_snapshots

# Config
CLAN_URL = "https://www.dfprofiler.com/clan/view/1405"
BASE_URL = "https://www.dfprofiler.com"
FIREBASE_DB_URL = "https://dead-bb-default-rtdb.firebaseio.com/"
USER_AGENT = "Mozilla/5.0 (compatible; scraper/3.0)"
BRAZIL_TZ = pytz.timezone("America/Sao_Paulo")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

def parse_int(text):
    if not text:
        return 0
    s = "".join(ch for ch in text if ch.isdigit() or ch == '-')
    return int(s) if s and s != '-' else 0

def parse_profile(profile_url):
    try:
        r = requests.get(profile_url, headers={"User-Agent": USER_AGENT}, timeout=15)
        r.raise_for_status()
    except Exception as e:
        logging.error(f"Erro ao acessar perfil: {profile_url} - {e}")
        return {}

    soup = BeautifulSoup(r.text, "html.parser")
    data = {}
    
    for div in soup.find_all("div", class_=["col-md-6", "col-sm-3"]):
        h4 = div.find("h4")
        if h4:
            content_div = div.find("div", class_="display") or div.find("div", class_="pdata")
            if content_div:
                key = h4.get_text(strip=True).lower().replace(" ", "_").replace("?", "")
                val_text = content_div.get_text(strip=True)
                data[key] = val_text
                
    if not data:
        for div in soup.find_all("div", class_="col-md-6"):
            text_parts = list(div.stripped_strings)
            if len(text_parts) >= 2:
                key = text_parts[0].lower().replace(" ", "_").replace("?", "")
                val = "".join(text_parts[1:])
                data[key] = val
                
    return data

def scrape_and_push():
    logging.info("Iniciando scrape...")
    try:
        resp = requests.get(CLAN_URL, headers={"User-Agent": USER_AGENT}, timeout=20)
        resp.raise_for_status()
    except Exception:
        logging.exception("Erro ao buscar a pagina do cla")
        return
        
    soup = BeautifulSoup(resp.text, "html.parser")
    table = None
    for t in soup.find_all("table"):
        if t.find("a", href=re.compile(r"/profile/view/")):
            table = t
            break
            
    if not table:
        logging.error("Tabela nao encontrada")
        return
        
    members = []
    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) > 3:
            a = tds[1].find("a", href=re.compile(r"/profile/view/"))
            if a:
                name = a.get_text(strip=True)
                clan_rank = tds[3].get_text(strip=True)
                if name:
                    members.append({
                        "username": name, 
                        "url": BASE_URL + a["href"],
                        "rank": clan_rank
                    })
        
    now_iso = datetime.now(tz=BRAZIL_TZ).isoformat()
    profiles_data = {}

    # Carrega snapshot anterior para comparação
    prev_snapshot = load_snapshot('profiles') or {}

    for m in members:
        pdata = parse_profile(m["url"])
        safe_username_key = requests.utils.requote_uri(m["username"]).replace(".", "%2E")

        raw_weekly_ts = parse_int(pdata.get("weekly_ts", "0"))
        raw_clan_weekly_ts = parse_int(pdata.get("clan_weekly_ts", "0"))

        raw_weekly_loots = parse_int(pdata.get("weekly_loots", "0"))
        raw_clan_weekly_loots = parse_int(pdata.get("clan_weekly_loots", "0"))

        # Corrige daily loot: se o usuário não estava no snapshot anterior, dailyLoot = 0
        prev_user = prev_snapshot.get(safe_username_key)
        if prev_user is None:
            daily_loot = 0
        else:
            prev_all_time_loot = prev_user.get("all_time_loots", 0)
            curr_all_time_loot = parse_int(pdata.get("all_time_loots", "0"))
            daily_loot = max(0, curr_all_time_loot - prev_all_time_loot)

        user_data = {
            "username": m["username"],
            "rank": m["rank"],
            "collected_at": now_iso,

            "weekly_ts": raw_weekly_ts,
            "clan_weekly_ts": raw_clan_weekly_ts,
            "all_time_ts": parse_int(pdata.get("all_time_ts", "0")),
            "total_exp": parse_int(pdata.get("total_exp", "0")),

            "weekly_loots": raw_weekly_loots,
            "all_time_loots": parse_int(pdata.get("all_time_loots", "0")),
            "clan_weekly_loots": raw_clan_weekly_loots,
            "all_time_clan_loots": parse_int(pdata.get("all_time_clan_loots", "0")),

            "last_clan_join": pdata.get("last_clan_join", ""),
            "daily_loot": daily_loot
        }

        profiles_data[safe_username_key] = user_data

    # Salva snapshot local para backup
    save_snapshot(profiles_data, 'profiles')

    # Só envia para o Firebase se houve alteração
    prof_url = FIREBASE_DB_URL.rstrip("/") + "/profiles.json"
    if compare_snapshots(prev_snapshot, profiles_data):
        try:
            r_prof = requests.put(prof_url, json=profiles_data, timeout=20)
            r_prof.raise_for_status()
            logging.info(f"Salvo com sucesso: {len(profiles_data)} perfis no Firebase.")
        except Exception as e:
            logging.error(f"Erro CRITICO ao salvar perfis no Firebase ({prof_url}): {e}")
    else:
        logging.info("Nenhuma alteração detectada, não foi necessário atualizar o Firebase.")
    
    adjusted_time = datetime.now(tz=BRAZIL_TZ) - timedelta(hours=8)
    today_str = adjusted_time.strftime("%Y-%m-%d")
    
    daily_url = FIREBASE_DB_URL.rstrip("/") + f"/daily/{today_str}.json"
    try:
        resp = requests.get(daily_url, timeout=10)
        daily_json = resp.json()
        if not daily_json:
            logging.info(f"Criando snapshot diário para {today_str}")
            requests.put(daily_url, json=profiles_data, timeout=20)
    except Exception as e:
        logging.error(f"Erro no daily snapshot: {e}")

    start_of_week = adjusted_time - timedelta(days=adjusted_time.weekday())
    week_str = start_of_week.strftime("%Y-%m-%d")
    
    weekly_url = FIREBASE_DB_URL.rstrip("/") + f"/weekly/{week_str}.json"
    try:
        resp = requests.get(weekly_url, timeout=10)
        weekly_json = resp.json()
        if not weekly_json:
            logging.info(f"Criando snapshot semanal para {week_str}")
            requests.put(weekly_url, json=profiles_data, timeout=20)
    except Exception as e:
        logging.error(f"Erro no weekly snapshot: {e}")

    logging.info("Scrape concluído.")

if __name__ == "__main__":
    from apscheduler.triggers.cron import CronTrigger
    scrape_and_push()
    scheduler = BlockingScheduler()
    # Executa a cada 10 minutos cravados paras as viradas de hora e dia (00, 10, 20... incluindo 08:00)
    trigger_10min = CronTrigger(minute='0,10,20,30,40,50', timezone=BRAZIL_TZ)
    # Garante o snapshot de fechamento do dia as 07:59, cravando o máximo de pontos para o dia anterior
    trigger_end_of_day = CronTrigger(hour=7, minute=59, timezone=BRAZIL_TZ)
    
    scheduler.add_job(scrape_and_push, trigger_10min)
    scheduler.add_job(scrape_and_push, trigger_end_of_day)
    logging.info("Agendado: a cada 10 min (0, 10, 20...) e fechamento diário às 07:59.")
    scheduler.start()
