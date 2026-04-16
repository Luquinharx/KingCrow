# Salva e carrega snapshots locais para backup e comparação
import json
import os
from datetime import datetime

BACKUP_DIR = os.path.join(os.path.dirname(__file__), 'snapshots')
os.makedirs(BACKUP_DIR, exist_ok=True)

def save_snapshot(data, tag):
    today = datetime.now().strftime('%Y-%m-%d')
    path = os.path.join(BACKUP_DIR, f'{tag}_{today}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path

def load_snapshot(tag):
    today = datetime.now().strftime('%Y-%m-%d')
    path = os.path.join(BACKUP_DIR, f'{tag}_{today}.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def compare_snapshots(old, new):
    """Retorna True se houver diferença, False se igual."""
    return old != new
