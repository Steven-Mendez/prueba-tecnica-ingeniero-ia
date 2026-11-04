"""La API del Caso 2 responde lo esperado y las rutas del Caso 1 siguen intactas."""

import io

import pandas as pd

from tests.conftest import GOLDEN_QUEUE

DAY = "2026-09-15"


def test_data_status(client):
    r = client.get("/api/renewals/data/status")
    assert r.status_code == 200
    body = r.json()
    sheets = {s["key"]: s for s in body["sheets"]}
    assert set(sheets) == {"renewals", "calls", "team"}
    assert sheets["renewals"]["rows"] == 25_351 and sheets["renewals"]["clean_rows"] == 25_200
    assert sheets["calls"]["rows"] == 78_058
    assert sheets["team"]["clean_rows"] == 7
    assert body["staffing_change_date"] == "2025-12-01"
    assert body["policies"] == 25_200 and body["months"] == 13
    assert body["duplicates_removed"] == 151 and body["invalid_phones"] == 522
    assert len(body["quality"]) == 9
    assert client.post("/api/renewals/data/refresh").status_code == 200


def test_sheet_explorer(client):
    r = client.get("/api/renewals/data/sheets/renewals", params={"q": "CAP-DH", "page_size": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["filter_label"] == "Gestor" and body["models"] == [f"G0{i}" for i in range(1, 8)]
    assert body["model_column"] == "Gestor" and len(body["rows"]) == 5
    keys = [c["key"] for c in body["columns"]]
    assert "lead_days" in keys and "Póliza" in keys
    assert (
        client.get("/api/renewals/data/sheets/renewals", params={"model": "G03", "page_size": 1}).json()[
            "total"
        ]
        == 4687
    )
    r = client.get("/api/renewals/data/sheets/renewals", params={"flag": "valid_phone", "page_size": 1})
    assert r.json()["total"] == 25_200 - 522
    r = client.get(
        "/api/renewals/data/sheets/calls",
        params={"model": "G03", "sort": "Fecha y hora", "desc": True, "page_size": 2},
    )
    assert r.status_code == 200 and r.json()["rows"][0][2] == "G03"
    assert client.get("/api/renewals/data/sheets/team").json()["total"] == 7
    assert client.get("/api/renewals/data/sheets/nope").status_code == 404
    assert client.get("/api/renewals/data/sheets/renewals", params={"sort": "nope"}).status_code == 422
    assert client.get("/api/renewals/data/sheets/renewals", params={"flag": "Ramo"}).status_code == 422


def test_parameters_defaults(client):
    r = client.get("/api/renewals/parameters")
    assert r.status_code == 200
    body = r.json()
    assert body["parameters"] == {
        "open_days": 14,
        "deadline_days": 8,
        "daily_capacity": 250,
        "agents": 5,
        "grace_days": 7,
        "target_window_share": 0.7,
        "automatic_channel_rate": None,
    }
    assert body["derived"]["default_day"] == DAY
    assert len(body["derived"]["team"]) == 7


def test_simulate(client):
    r = client.post("/api/renewals/simulate", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["stats"]["policies"] == 14_146
    assert round(body["impact"]["floor_month"]) == 28_615
    assert len(body["capacity"]) > 200
    assert body["notebook_check"]["matches"] is True
    assert body["baseline"] is None
    r = client.post("/api/renewals/simulate", json={"daily_capacity": 200})
    assert r.status_code == 200 and r.json()["baseline"] is not None
    assert client.post("/api/renewals/simulate", json={"open_days": 8, "deadline_days": 8}).status_code == 422
    assert client.post("/api/renewals/simulate", json={"nope": 1}).status_code == 422


def test_queue_default_day(client):
    r = client.post("/api/renewals/queue", params={"day": DAY}, json={})
    assert r.status_code == 200
    body = r.json()
    assert body["total_pending"] == 116 and body["total_logged"] == 0
    assert body["rows"][0]["policy"] == "CAP-DH-111156" and body["rows"][0]["agent"] == "G04"
    assert sum(a["pending"] for a in body["by_agent"]) == 116
    assert body["capacity_per_agent"] == 50
    assert body["notebook_check"]["matches"] is True
    r = client.post("/api/renewals/queue", params={"day": DAY, "agent": "G04"}, json={})
    assert all(row["agent"] == "G04" for row in r.json()["rows"]) and r.json()["rows"]
    assert client.post("/api/renewals/queue", params={"day": DAY, "agent": "G99"}, json={}).status_code == 404
    assert client.post("/api/renewals/queue", params={"day": "2026-09-12"}, json={}).status_code == 422
    assert client.post("/api/renewals/queue", json={}).status_code == 422  # falta el día


def test_export_csv_equals_notebook_output(client):
    r = client.post("/api/renewals/queue/export", params={"day": DAY}, json={})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="cola_renovaciones_2026-09-15.csv"' in r.headers["content-disposition"]
    assert r.text == GOLDEN_QUEUE.read_text(encoding="utf-8")


def test_day_overview(client):
    r = client.post("/api/renewals/day", params={"day": DAY}, json={})
    assert r.status_code == 200
    body = r.json()
    assert body["capacity"] == 250 and body["pending_first_contacts"] == 116
    assert len(body["routed_today"]) == 3 and 0 <= body["load_share"] <= 2
    assert len(body["metrics"]) == 7


def test_contacts_lifecycle(client):
    body = {"policy": "CAP-DH-111156", "agent": "G04", "result": "Cotización enviada", "day": DAY}
    r = client.post("/api/renewals/contacts", json=body)
    assert r.status_code == 201, r.text
    contact = r.json()
    assert contact["in_window"] is True and contact["effective"] is True and contact["days_to_expiry"] == 12

    queue = client.post("/api/renewals/queue", params={"day": DAY}, json={}).json()
    assert queue["total_pending"] == 115 and queue["total_logged"] == 1
    row = next(x for x in queue["rows"] if x["policy"] == "CAP-DH-111156")
    assert row["status"] == "logged" and row["last_result"] == "Cotización enviada"
    assert row["contact_id"] == contact["id"]
    assert queue["logged"]["count"] == 1 and queue["logged"]["in_window_share"] == 1.0
    g04 = next(a for a in queue["by_agent"] if a["agent"] == "G04")
    assert g04["logged"] == 1 and g04["in_window_share"] == 1.0
    # Antes de ese día la póliza sigue pendiente
    earlier = client.post("/api/renewals/queue", params={"day": "2026-09-14"}, json={}).json()
    assert all(x["status"] == "pending" for x in earlier["rows"])

    assert len(client.get("/api/renewals/contacts", params={"day": DAY, "agent": "G04"}).json()) == 1
    assert (
        client.get("/api/renewals/contacts", params={"policy": "CAP-DH-111156"}).json()[0]["id"]
        == contact["id"]
    )

    full = client.post("/api/renewals/queue/export", params={"day": DAY}, json={}).text
    assert full == GOLDEN_QUEUE.read_text(encoding="utf-8")  # sigue byte a byte aunque haya registros
    pending = client.post("/api/renewals/queue/export", params={"day": DAY, "pending_only": True}, json={})
    assert pending.text.count("\n") == 116 and "CAP-DH-111156" not in pending.text

    detail = client.post("/api/renewals/policies/CAP-DH-111156", params={"day": DAY}, json={}).json()
    assert detail["in_queue_today"] is True and detail["row"]["status"] == "logged"
    assert len(detail["contacts"]) == 1 and "fecha límite" in detail["explanation"]
    assert detail["message_whatsapp"] is None and detail["calls"][0]["attempt_no"] == 1

    assert client.delete(f"/api/renewals/contacts/{contact['id']}").status_code == 204
    assert client.post("/api/renewals/queue", params={"day": DAY}, json={}).json()["total_pending"] == 116
    assert client.delete(f"/api/renewals/contacts/{contact['id']}").status_code == 404

    assert client.post("/api/renewals/contacts", json={**body, "result": "Otro"}).status_code == 422
    assert client.post("/api/renewals/contacts", json={**body, "policy": "CAP-XX-1"}).status_code == 422
    assert client.post("/api/renewals/contacts", json={**body, "agent": "G99"}).status_code == 422
    assert client.post("/api/renewals/contacts", json={**body, "day": "2026-09-12"}).status_code == 422


def test_policy_detail_automatic_channel(client):
    # Una domiciliada del periodo de 5 gestores: va al canal automático y tiene mensaje
    sheet = client.get(
        "/api/renewals/data/sheets/renewals",
        params={"q": "Domiciliado", "date_from": "2026-01-01", "page_size": 1},
    ).json()
    policy = sheet["rows"][0][[c["key"] for c in sheet["columns"]].index("Póliza")]
    detail = client.post(f"/api/renewals/policies/{policy.lower()}", params={"day": DAY}, json={}).json()
    assert detail["channel"].startswith("Canal automático") and detail["in_queue_today"] is False
    assert detail["message_whatsapp"] and "vence el" in detail["message_whatsapp"]
    assert detail["message_email"].startswith("Asunto:")
    assert client.post("/api/renewals/policies/NOPE", params={"day": DAY}, json={}).status_code == 404


def test_notebook_queue(client):
    r = client.get("/api/renewals/notebook-queue")
    assert r.status_code == 200
    assert r.json()["rows"] == 116 and r.json()["day"] == DAY
    df = pd.read_csv(io.StringIO(GOLDEN_QUEUE.read_text(encoding="utf-8")))
    assert r.json()["total_score"] == round(float(df["Score (USD)"].sum()), 2)


def test_caso1_routes_untouched(client):
    status = client.get("/api/data/status").json()
    assert "models" in status and "reconciliation_differences" in status
    page = client.get("/api/data/sheets/sales", params={"page_size": 1}).json()
    assert page["filter_label"] == "Modelo"
    assert client.post("/api/factory-order/calculate", json={}).json()["kpis"]["total_units"] == 341
