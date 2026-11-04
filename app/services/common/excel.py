"""Lectura del Excel de cada caso."""

import io
import zipfile
from pathlib import Path

import pandas as pd

from app.services.common.errors import DataError


def read_excel(source: bytes | Path) -> dict[str, pd.DataFrame]:
    """Lee todas las hojas. Lanza DataError si el archivo no es un .xlsx legible."""
    if isinstance(source, bytes):
        if not source.startswith(b"PK"):
            raise DataError("El archivo no es un Excel .xlsx válido.")
        buffer: io.BytesIO | Path = io.BytesIO(source)
    else:
        if not source.is_file():
            raise DataError(f"No existe el archivo {source}.", status_code=404)
        buffer = source
    try:
        return pd.read_excel(buffer, sheet_name=None)
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as exc:
        raise DataError(f"No se pudo leer el Excel: {exc}") from None
