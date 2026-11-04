"""Munki configuration — env-driven, safe defaults. Meta API is OPTIONAL:
without META_API_KEY every feature runs on deterministic fallbacks and
labels its output source='fallback'. No key is ever read from a file."""
import os
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("MUNKI_DATA_DIR", os.path.join(BASE_DIR, "data"))
DB_PATH = os.path.join(DATA_DIR, "munki.db")
SEED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data")
META_API_KEY = os.environ.get("META_API_KEY") or os.environ.get("MODEL_API_KEY", "")
META_API_BASE_URL = os.environ.get("META_API_BASE_URL", "https://api.meta.ai/v1")
META_MODEL = os.environ.get("META_MODEL", "muse-spark-1.3")
os.makedirs(DATA_DIR, exist_ok=True)
