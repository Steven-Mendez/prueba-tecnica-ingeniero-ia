"""Rutas de la API: planificador, fuente de datos, explorador, ventas, precisión y planes."""

from tests.conftest import GOLDEN_BY_MODEL

API = "/api/factory-order"


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_calculate_with_defaults(client):
    r = client.post(f"{API}/calculate", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["kpis"]["total_units"] == 341
    assert len(body["order"]) == 11
    assert len(body["sensitivity"]["scenarios"]) == 9
    assert body["notebook_check"]["matches"] is True
    assert body["calendar"]["window_label"] == "oct-2026"
    assert body["correction"]["available"] is True and body["correction"]["applied"] is False
    assert all(len(h["points"]) == 18 for h in body["history"])


def test_parameters_round_trip(client):
    body = client.get(f"{API}/parameters").json()
    assert body["derived"]["lead_time_days"] == 104
    assert body["catalog"]["rules"]["Yaris"] == {"min_order": 16, "lot_multiple": 8}
    assert body["cutoff_options"][0]["cutoff_date"] == "2026-09-30"
    again = client.post(f"{API}/calculate", json=body["parameters"])
    assert again.json()["kpis"]["total_units"] == 341


def test_invalid_parameters_are_422(client):
    r = client.post(f"{API}/calculate", json={"overrides": {"Supra": {"forced_order": 4}}})
    assert r.status_code == 422 and "Modelos desconocidos" in r.json()["detail"]
    assert client.post(f"{API}/calculate", json={"demand_multiplier": -1}).status_code == 422
    assert client.post(f"{API}/calculate", json={"unknown_field": 1}).status_code == 422


def test_no_upload_endpoints(client):
    # Los datos llegan por ETL: la API no acepta archivos
    assert client.post("/api/factory-order/datasets", files={"file": ("a.xlsx", b"x")}).status_code in (
        404,
        405,
    )
    paths = client.get("/api/openapi.json").json()["paths"]
    assert not any("upload" in p or "datasets" in p for p in paths)


def test_export_csv_equals_notebook_output(client):
    r = client.post(f"{API}/export/model", json={})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="pedido_2026-10_por_modelo.csv"' in r.headers["content-disposition"]
    assert r.text == GOLDEN_BY_MODEL.read_text(encoding="utf-8")


def test_data_status(client):
    body = client.get("/api/data/status").json()
    assert body["data_cutoff"] == "2026-09-30"
    assert body["last_error"] is None
    assert body["reconciliation_differences"] == 0
    sheets = {s["key"]: s for s in body["sheets"]}
    assert sheets["sales"]["rows"] == 4683 and sheets["sales"]["clean_rows"] == 4665
    assert set(sheets) == {
        "sales",
        "inventory",
        "leads",
        "orders",
        "economics",
        "communications",
    }  # el Diccionario es documentación del Excel, no una hoja de datos
    assert client.post("/api/data/refresh").status_code == 200


def test_sheet_explorer(client):
    page = client.get(
        "/api/data/sheets/sales", params={"q": "hilux", "page_size": 5, "sort": "Fecha", "desc": True}
    ).json()
    assert page["total"] > 0 and len(page["rows"]) == 5
    keys = [c["key"] for c in page["columns"]]
    assert (
        "special_fleet" in keys and next(c for c in page["columns"] if c["key"] == "special_fleet")["derived"]
    )
    dates = [row[keys.index("Fecha")] for row in page["rows"]]
    assert dates == sorted(dates, reverse=True)

    # Solo la versión limpia: las 4683 líneas del Excel menos los duplicados
    status = client.get("/api/data/status").json()
    clean_rows = next(s for s in status["sheets"] if s["key"] == "sales")["clean_rows"]
    assert client.get("/api/data/sheets/sales").json()["total"] == clean_rows < 4683

    lost = client.get("/api/data/sheets/leads", params={"flag": "no_availability", "model": "Rush"}).json()
    assert lost["total"] > 0
    assert client.get("/api/data/sheets/nope").status_code == 404
    assert client.get("/api/data/sheets/sales", params={"sort": "nope"}).status_code == 422


def test_sales_overview(client):
    body = client.get("/api/sales/overview").json()
    assert body["filters"]["date_from"] == "2025-10-01" and body["filters"]["date_to"] == "2026-09-30"
    assert body["kpis"]["units"] == 1577  # venta del último año sin flotas especiales (01_eda)
    assert body["kpis"]["lost_units"] == 315
    assert len(body["monthly"]) == 12
    assert sum(m["units"] for m in body["monthly"]) == body["kpis"]["units"]
    assert sum(g["units"] for g in body["by_model"]) == body["kpis"]["units"]

    hilux = client.get("/api/sales/overview", params={"models": ["Hilux"]}).json()
    assert hilux["kpis"]["units"] == 414 and [g["key"] for g in hilux["by_model"]] == ["Hilux"]


def test_accuracy(client):
    body = client.get(f"{API}/accuracy").json()
    assert len(body["cycles"]) == 6
    assert body["correction_cycles"] == 6
    assert 0 < body["wape"] < 0.5
    assert body["next_cycle_closes"] == "2026-11-12"
    assert all(c["actual_order"] is not None for c in body["cycles"])


def test_learned_correction_changes_the_order(client):
    body = client.post(f"{API}/calculate", json={"learned_correction": True}).json()
    assert body["correction"]["applied"] is True
    assert body["baseline"]["total_units"] == 341
    assert body["kpis"]["total_units"] != 341


def test_plans_lifecycle(client):
    created = client.post(f"{API}/plans", json={"name": "Ventana oct-2026", "parameters": {}})
    assert created.status_code == 201
    plan = created.json()
    assert plan["total_units"] == 341 and plan["status"] == "draft"
    assert plan["tracking"]["state"] == "pending"  # el horizonte empieza en feb-2027

    past = client.post(
        f"{API}/plans", json={"name": "Validación ene-2026", "parameters": {"cutoff_date": "2025-12-31"}}
    ).json()
    assert past["tracking"]["state"] == "closed" and past["tracking"]["wape"] is not None

    updated = client.patch(f"{API}/plans/{plan['id']}", json={"status": "sent"}).json()
    assert updated["status"] == "sent"
    assert [p["id"] for p in client.get(f"{API}/plans").json()][:2] == [past["id"], plan["id"]]
    assert client.delete(f"{API}/plans/{plan['id']}").status_code == 204
    assert client.get(f"{API}/plans/{plan['id']}").status_code == 404


def test_future_window_counts_saved_plan_as_transit(client):
    """Planificar enero con datos a septiembre: el pedido guardado de octubre llega antes y cuenta como tránsito."""
    options = client.get(f"{API}/parameters").json()["cutoff_options"]
    future = [o for o in options if o["kind"] == "future"]
    assert [o["window_close"] for o in future] == ["2027-01-29", "2027-04-30", "2027-07-30"]
    assert all(o["cutoff_date"] == "2026-09-30" for o in future)

    january = {"window_close": "2027-01-29"}
    without = client.post(f"{API}/calculate", json=january).json()
    assert without["window_kind"] == "future"
    assert without["missing_pipeline_windows"] == ["oct-2026"]
    assert any("Sin plan guardado para la ventana oct-2026" in w for w in without["warnings"])

    plan = client.post(f"{API}/plans", json={"name": "Pedido oct-2026", "parameters": {}}).json()
    with_plan = client.post(f"{API}/calculate", json=january).json()
    assert [p["id"] for p in with_plan["pipeline"]] == [plan["id"]]
    assert with_plan["missing_pipeline_windows"] == []
    assert with_plan["kpis"]["previous_window_units"] == 341
    assert with_plan["kpis"]["total_units"] < without["kpis"]["total_units"]
    hilux = {r["model"]: r for r in with_plan["order"]}["Hilux"]
    hilux_before = {r["model"]: r for r in without["order"]}["Hilux"]
    assert hilux["in_transit"] == hilux_before["in_transit"] + 42

    # La ventana actual no cambia y ahora sabe qué plan tiene guardado
    current = client.post(f"{API}/calculate", json={}).json()
    assert current["kpis"]["total_units"] == 341 and current["pipeline"] == []
    assert [p["id"] for p in current["window_plans"]] == [plan["id"]]
    client.delete(f"{API}/plans/{plan['id']}")
