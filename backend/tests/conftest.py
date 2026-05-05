"""Shared pytest fixtures."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    """In-process FastAPI client. Doesn't require a running uvicorn."""
    return TestClient(app)
