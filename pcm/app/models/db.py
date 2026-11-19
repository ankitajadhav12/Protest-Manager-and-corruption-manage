from contextlib import contextmanager
from typing import Any, Optional
import mysql.connector
from mysql.connector import pooling
from flask import current_app

_pool: Optional[pooling.MySQLConnectionPool] = None


def get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        cfg = current_app.config
        _pool = pooling.MySQLConnectionPool(
            pool_name="pcm_mysql_pool",
            pool_size=10,
            pool_reset_session=True,
            host=cfg["MYSQL_HOST"],
            port=cfg["MYSQL_PORT"],
            user=cfg["MYSQL_USER"],
            password=cfg["MYSQL_PASSWORD"],
            database=cfg["MYSQL_DATABASE"],
            charset="utf8mb4",
            collation="utf8mb4_unicode_ci",
        )
    return _pool


@contextmanager
def get_cursor(dictionary: bool = True):
    conn = get_pool().get_connection()
    cursor = conn.cursor(dictionary=dictionary)
    try:
        yield conn, cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def fetch_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with get_cursor(dictionary=True) as (_, cur):
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_one(sql: str, params: tuple[Any, ...] = ()) -> Optional[dict[str, Any]]:
    with get_cursor(dictionary=True) as (_, cur):
        cur.execute(sql, params)
        return cur.fetchone()


def execute_query(sql: str, params: tuple[Any, ...] = ()) -> int:
    with get_cursor(dictionary=True) as (_, cur):
        cur.execute(sql, params)
        return cur.lastrowid
