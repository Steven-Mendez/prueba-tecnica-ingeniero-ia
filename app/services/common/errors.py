"""Error común de datos y parámetros."""


class DataError(Exception):
    """Problema en los datos o en los parámetros que el usuario puede corregir (la API responde 422)."""

    def __init__(self, detail: str, status_code: int = 422):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
