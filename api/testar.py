import requests

BASE = "http://localhost:8000"

print("HEALTH:", requests.get(f"{BASE}/health").json())


def mostrar(titulo, r):
    print(f"\n== {titulo} -> HTTP {r.status_code}")
    d = r.json()
    if r.status_code == 200:
        print("resumo:", d["resumo"])
        print("avisos:", d["avisos"])
        print("células:", len(d["celulas"]), "| exemplo:", d["celulas"][:1])
    else:
        print(d)


# 1) Com detecções (formato FIRMS)
com_fogo = {
    "lat": -7.125, "lon": -44.525, "raio_km": 30, "data_ref": "2024-09-06",
    "deteccoes": [
        {"latitude": -7.13, "longitude": -44.52, "acq_date": "2024-09-04",
         "acq_time": 1620, "frp": 12.5, "confidence": "n"},
        {"latitude": -7.12, "longitude": -44.53, "acq_date": "2024-08-30",
         "acq_time": 1735, "frp": 8.1, "confidence": "h"},
    ],
}
mostrar("com detecções", requests.post(f"{BASE}/prever", json=com_fogo))

# 2) Região sem fogo recente: lista vazia + data_ref
sem_fogo = {"lat": -27.6, "lon": -48.6, "raio_km": 50,
            "data_ref": "2026-11-13", "deteccoes": []}
mostrar("sem detecções", requests.post(f"{BASE}/prever", json=sem_fogo))

# 3) Erro esperado: lista vazia sem data_ref
mostrar("vazio sem data_ref",
        requests.post(f"{BASE}/prever", json={"lat": -27.6, "lon": -48.6, "deteccoes": []}))
