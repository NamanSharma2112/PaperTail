"""Database session setup.

DATABASE_URL selects the database. PostgreSQL is the deployment target
(postgresql+psycopg://user:pass@host/db); the default is a local SQLite file so the
API runs with no setup.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker



def normalise_url(url: str) -> str:
    """Accept the postgres:// and postgresql:// URLs that hosting providers hand out
    (Aiven, Heroku, Supabase, Neon) and use the psycopg 3 driver for them."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = normalise_url(os.environ.get("DATABASE_URL") or "sqlite:///./papertrail.db")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
# pool_pre_ping: hosted databases close idle connections; check before reuse.
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
