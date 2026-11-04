import os, sys, tempfile
_TMP = tempfile.mkdtemp(prefix="munki-test-")
os.environ["MUNKI_DATA_DIR"] = _TMP
os.environ.pop("META_API_KEY", None); os.environ.pop("MODEL_API_KEY", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c
