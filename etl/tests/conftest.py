"""Garante que `healthmap_etl` e os scripts `ingest_*.py` sejam importaveis
sem depender de instalacao (mesmo truque de sys.path usado pelos proprios
scripts de ingestao)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
