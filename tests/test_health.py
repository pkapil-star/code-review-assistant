from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_root():
    """The root path answers either with the service identity or the dashboard shell."""
    response = client.get("/")
    assert response.status_code == 200

    if response.headers["content-type"].startswith("application/json"):
        assert response.json()["status"] == "ok"
    else:
        assert "<div id=\"root\"></div>" in response.text


def test_api_status_reports_configuration():
    response = client.get("/api/status")
    assert response.status_code == 200

    body = response.json()
    assert "connected" in body
    assert body["queue_backend"] in ("memory", "redis")


def test_api_rules_lists_the_implemented_rules():
    response = client.get("/api/rules")
    assert response.status_code == 200

    rules = {entry["rule"] for entry in response.json()}
    assert {"possible-secret", "bare-except", "missing-tests"} <= rules
