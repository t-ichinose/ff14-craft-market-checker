from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
import os

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
os.makedirs(DB_DIR, exist_ok=True)
DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'ff14_craft.db')}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30.0}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Ensure SQLite uses WAL mode, busy timeout, and normal synchronous mode."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA busy_timeout=10000;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
