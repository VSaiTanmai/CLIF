"""
CLIF Consumer — Redpanda → ClickHouse High-Performance Ingestion Pipeline.

Production-grade multi-threaded consumer with:
  • Batch polling via consume() — up to 500 messages per call
  • Thread-pool based parallel deserialization and row building
  • Per-table concurrent flush via ThreadPoolExecutor
  • Optimized Kafka fetch settings (64KB min fetch, 50MB max)
  • Back-pressure aware batching with size + time triggers
  • Graceful shutdown with drain and final synchronous commit
  • Connection-pool pattern: one ClickHouseWriter per flush worker
  • Health metrics via StatsReporter with per-second rate tracking
  • Server-side UUID generation (event_id omitted from inserts)

Environment variables:
    KAFKA_BROKERS               comma-separated broker list
    CLICKHOUSE_HOST             ClickHouse HTTP host
    CLICKHOUSE_PORT             ClickHouse HTTP port
    CLICKHOUSE_USER             ClickHouse username
    CLICKHOUSE_PASSWORD         ClickHouse password
    CLICKHOUSE_DB               target database (default: clif_logs)
    CONSUMER_GROUP_ID           Kafka consumer group
    CONSUMER_BATCH_SIZE         max events per INSERT batch (default: 50000)
    CONSUMER_FLUSH_INTERVAL_SEC max seconds between flushes (default: 0.5)
    CONSUMER_MAX_RETRIES        retries on ClickHouse insert failure
    CONSUMER_POLL_BATCH         messages per consume() call (default: 500)
    CONSUMER_FLUSH_WORKERS      parallel flush threads (default: 4)
    CONSUMER_DESER_WORKERS      deserialization thread pool size (default: 8)
    LOG_LEVEL                   Python log level (DEBUG/INFO/WARNING/…)
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from threading import Event, Lock, Thread
from typing import Any

from confluent_kafka import Consumer, KafkaError, KafkaException
import clickhouse_connect

# ── Configuration ────────────────────────────────────────────────────────────

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "redpanda01:9092")
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse01")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "clif_admin")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "clif_secure_password_change_me")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "clif_logs")
CONSUMER_GROUP = os.getenv("CONSUMER_GROUP_ID", "clif-clickhouse-consumer")
BATCH_SIZE = int(os.getenv("CONSUMER_BATCH_SIZE", "50000"))
FLUSH_INTERVAL = float(os.getenv("CONSUMER_FLUSH_INTERVAL_SEC", "0.5"))
MAX_RETRIES = int(os.getenv("CONSUMER_MAX_RETRIES", "5"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Performance tuning knobs
POLL_BATCH = int(os.getenv("CONSUMER_POLL_BATCH", "500"))
FLUSH_WORKERS = int(os.getenv("CONSUMER_FLUSH_WORKERS", "4"))
DESER_WORKERS = int(os.getenv("CONSUMER_DESER_WORKERS", "8"))

# Topic → ClickHouse table mapping
TOPIC_TABLE_MAP: dict[str, str] = {
    "raw-logs": "raw_logs",
    "security-events": "security_events",
    "process-events": "process_events",
    "network-events": "network_events",
}

# Reverse map for fast stats lookups (table → topic)
_TABLE_TO_TOPIC: dict[str, str] = {v: k for k, v in TOPIC_TABLE_MAP.items()}

TOPICS = list(TOPIC_TABLE_MAP.keys())

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    format="%(asctime)s  %(levelname)-8s  [%(name)s]  %(message)s",
    level=getattr(logging, LOG_LEVEL, logging.INFO),
)
log = logging.getLogger("clif.consumer")

# ── Graceful shutdown ────────────────────────────────────────────────────────

_shutdown = Event()


def _handle_signal(sig: int, _frame: Any) -> None:
    log.warning("Received signal %s — initiating graceful shutdown …", sig)
    _shutdown.set()


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)

# ── Helpers ──────────────────────────────────────────────────────────────────

# Pre-compute the UTC timezone object once
_UTC = timezone.utc


def _now_str() -> str:
    """Return current UTC time as ClickHouse DateTime64 string."""
    return datetime.now(_UTC).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def _parse_timestamp(raw: str | None) -> str:
    """Return a ClickHouse-compatible DateTime64 string."""
    if not raw:
        return _now_str()
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    except (ValueError, AttributeError):
        return _now_str()


def _safe_str(val: Any, default: str = "") -> str:
    return str(val) if val is not None else default


def _safe_int(val: Any, default: int = 0) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _ensure_dict(meta: Any) -> dict:
    """Normalize metadata to a dict, handling str or None."""
    if meta is None:
        return {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            return {}
    if isinstance(meta, dict):
        return meta
    return {}


# ── Row builders (one per target table) ──────────────────────────────────────
# event_id / raw_log_event_id OMITTED — ClickHouse generates UUIDs server-side
# via DEFAULT generateUUIDv4() using hardware-accelerated intrinsics.


def _build_raw_log_row(msg: dict) -> list:
    meta = _ensure_dict(msg.get("metadata"))
    return [
        _parse_timestamp(msg.get("timestamp")),     # timestamp
        _now_str(),                                  # received_at
        _safe_str(msg.get("level"), "INFO"),         # level
        _safe_str(msg.get("source"), "unknown"),     # source
        _safe_str(msg.get("message")),               # message
        {str(k): str(v) for k, v in meta.items()},  # metadata
        _safe_str(meta.get("user_id")),              # user_id
        _safe_str(meta.get("ip_address"), "0.0.0.0"),# ip_address
        _safe_str(meta.get("request_id")),           # request_id
        "",                                          # anchor_tx_id
        "",                                          # anchor_batch_hash
    ]


def _build_security_event_row(msg: dict) -> list:
    meta = _ensure_dict(msg.get("metadata"))
    return [
        _parse_timestamp(msg.get("timestamp")),
        _safe_int(msg.get("severity"), 0),
        _safe_str(msg.get("category"), "unknown"),
        _safe_str(msg.get("source"), "unknown"),
        _safe_str(msg.get("description")),
        _safe_str(msg.get("user_id")),
        _safe_str(msg.get("ip_address"), "0.0.0.0"),
        _safe_str(msg.get("hostname")),
        _safe_str(msg.get("mitre_tactic")),
        _safe_str(msg.get("mitre_technique")),
        _safe_float(msg.get("ai_confidence")),
        _safe_str(msg.get("ai_explanation")),
        "",                                          # anchor_tx_id
        {str(k): str(v) for k, v in meta.items()},
    ]


def _build_process_event_row(msg: dict) -> list:
    meta = _ensure_dict(msg.get("metadata"))
    return [
        _parse_timestamp(msg.get("timestamp")),
        _safe_str(msg.get("hostname")),
        _safe_int(msg.get("pid")),
        _safe_int(msg.get("ppid")),
        _safe_int(msg.get("uid")),
        _safe_int(msg.get("gid")),
        _safe_str(msg.get("binary_path")),
        _safe_str(msg.get("arguments")),
        _safe_str(msg.get("cwd")),
        _safe_int(msg.get("exit_code"), -1),
        _safe_str(msg.get("container_id")),
        _safe_str(msg.get("pod_name")),
        _safe_str(msg.get("namespace")),
        _safe_str(msg.get("syscall")),
        _safe_int(msg.get("is_suspicious")),
        _safe_str(msg.get("detection_rule")),
        "",
        {str(k): str(v) for k, v in meta.items()},
    ]


def _build_network_event_row(msg: dict) -> list:
    meta = _ensure_dict(msg.get("metadata"))
    return [
        _parse_timestamp(msg.get("timestamp")),
        _safe_str(msg.get("hostname")),
        _safe_str(msg.get("src_ip"), "0.0.0.0"),
        _safe_int(msg.get("src_port")),
        _safe_str(msg.get("dst_ip"), "0.0.0.0"),
        _safe_int(msg.get("dst_port")),
        _safe_str(msg.get("protocol"), "TCP"),
        _safe_str(msg.get("direction"), "outbound"),
        _safe_int(msg.get("bytes_sent")),
        _safe_int(msg.get("bytes_received")),
        _safe_int(msg.get("duration_ms")),
        _safe_int(msg.get("pid")),
        _safe_str(msg.get("binary_path")),
        _safe_str(msg.get("container_id")),
        _safe_str(msg.get("pod_name")),
        _safe_str(msg.get("namespace")),
        _safe_str(msg.get("dns_query")),
        _safe_str(msg.get("geo_country")),
        _safe_int(msg.get("is_suspicious")),
        _safe_str(msg.get("detection_rule")),
        "",
        {str(k): str(v) for k, v in meta.items()},
    ]


# Column lists — event_id and raw_log_event_id OMITTED (server-generated UUIDs)
RAW_LOGS_COLUMNS = [
    "timestamp", "received_at", "level", "source", "message",
    "metadata", "user_id", "ip_address", "request_id",
    "anchor_tx_id", "anchor_batch_hash",
]
SECURITY_EVENTS_COLUMNS = [
    "timestamp", "severity", "category", "source", "description",
    "user_id", "ip_address", "hostname",
    "mitre_tactic", "mitre_technique", "ai_confidence", "ai_explanation",
    "anchor_tx_id", "metadata",
]
PROCESS_EVENTS_COLUMNS = [
    "timestamp", "hostname", "pid", "ppid", "uid", "gid",
    "binary_path", "arguments", "cwd", "exit_code",
    "container_id", "pod_name", "namespace", "syscall",
    "is_suspicious", "detection_rule", "anchor_tx_id", "metadata",
]
NETWORK_EVENTS_COLUMNS = [
    "timestamp", "hostname",
    "src_ip", "src_port", "dst_ip", "dst_port",
    "protocol", "direction", "bytes_sent", "bytes_received", "duration_ms",
    "pid", "binary_path", "container_id", "pod_name", "namespace",
    "dns_query", "geo_country", "is_suspicious", "detection_rule",
    "anchor_tx_id", "metadata",
]

TABLE_META: dict[str, dict] = {
    "raw_logs":        {"columns": RAW_LOGS_COLUMNS,        "builder": _build_raw_log_row},
    "security_events": {"columns": SECURITY_EVENTS_COLUMNS, "builder": _build_security_event_row},
    "process_events":  {"columns": PROCESS_EVENTS_COLUMNS,  "builder": _build_process_event_row},
    "network_events":  {"columns": NETWORK_EVENTS_COLUMNS,  "builder": _build_network_event_row},
}

# ── ClickHouse Writer Pool ──────────────────────────────────────────────────


class ClickHouseWriter:
    """
    Manages batched inserts into ClickHouse with connection resilience.
    Each writer owns a single HTTP connection. Create one per flush-worker
    thread to avoid contention on a shared socket.
    """

    def __init__(self, writer_id: int = 0) -> None:
        self._id = writer_id
        self.client = self._connect()

    def _connect(self):
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                client = clickhouse_connect.get_client(
                    host=CLICKHOUSE_HOST,
                    port=CLICKHOUSE_PORT,
                    username=CLICKHOUSE_USER,
                    password=CLICKHOUSE_PASSWORD,
                    database=CLICKHOUSE_DB,
                    connect_timeout=30,
                    send_receive_timeout=120,
                    compress=True,  # LZ4 wire compression
                    settings={
                        "async_insert": 1,
                        "wait_for_async_insert": 0,
                        "async_insert_busy_timeout_ms": 200,
                        "async_insert_max_data_size": 10485760,  # 10 MB
                    },
                )
                log.info(
                    "Writer-%d connected to ClickHouse %s:%s (attempt %d)",
                    self._id, CLICKHOUSE_HOST, CLICKHOUSE_PORT, attempt,
                )
                return client
            except Exception as exc:
                log.warning("Writer-%d connection attempt %d failed: %s", self._id, attempt, exc)
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(min(2 ** attempt, 30))
        raise RuntimeError("unreachable")

    def insert(self, table: str, columns: list[str], rows: list[list]) -> int:
        """Insert a batch of rows with retries. Returns row count on success."""
        row_count = len(rows)
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                self.client.insert(table, rows, column_names=columns)
                return row_count
            except Exception as exc:
                log.warning(
                    "Writer-%d insert into %s failed (attempt %d/%d, %d rows): %s",
                    self._id, table, attempt, MAX_RETRIES, row_count, exc,
                )
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(min(2 ** attempt, 15))
                try:
                    self.client = self._connect()
                except Exception:
                    pass
        return 0


class WriterPool:
    """
    Pool of ClickHouseWriter instances — one per flush worker thread.
    Eliminates socket contention by giving each thread its own connection.
    """

    def __init__(self, size: int) -> None:
        self._writers: list[ClickHouseWriter] = []
        self._lock = Lock()
        self._available: list[ClickHouseWriter] = []
        log.info("Initializing ClickHouse writer pool (size=%d) …", size)
        for i in range(size):
            w = ClickHouseWriter(writer_id=i)
            self._writers.append(w)
            self._available.append(w)

    def acquire(self) -> ClickHouseWriter:
        """Borrow a writer from the pool (blocking)."""
        while True:
            with self._lock:
                if self._available:
                    return self._available.pop()
            time.sleep(0.001)  # spin-wait with yield

    def release(self, writer: ClickHouseWriter) -> None:
        """Return a writer to the pool."""
        with self._lock:
            self._available.append(writer)


# ── Stats reporter ───────────────────────────────────────────────────────────


class StatsReporter(Thread):
    """Periodically logs ingestion stats with per-second throughput rates."""

    def __init__(self) -> None:
        super().__init__(daemon=True, name="stats-reporter")
        self._lock = Lock()
        self._counts: dict[str, int] = {t: 0 for t in TOPICS}
        self._errors: int = 0
        self._flush_count: int = 0
        self._flush_rows: int = 0
        self._last_total: int = 0
        self._last_time: float = time.monotonic()

    def record_messages(self, topic: str, count: int) -> None:
        with self._lock:
            self._counts[topic] = self._counts.get(topic, 0) + count

    def record_error(self, count: int = 1) -> None:
        with self._lock:
            self._errors += count

    def record_flush(self, rows: int) -> None:
        with self._lock:
            self._flush_count += 1
            self._flush_rows += rows

    def run(self) -> None:
        while not _shutdown.is_set():
            _shutdown.wait(15)
            with self._lock:
                total = sum(self._counts.values())
                now = time.monotonic()
                elapsed = now - self._last_time
                rate = (total - self._last_total) / max(elapsed, 0.001)
                self._last_total = total
                self._last_time = now
                log.info(
                    "Stats — total=%d  rate=%.0f msg/s  flushes=%d  flush_rows=%d  "
                    "errors=%d  %s",
                    total, rate, self._flush_count, self._flush_rows, self._errors,
                    "  ".join(f"{t}={c}" for t, c in self._counts.items()),
                )


# ── Batch deserializer ───────────────────────────────────────────────────────


def _deserialize_and_build(raw_msg) -> tuple[str, list] | None:
    """
    Full pipeline: deserialize a Kafka message → build a ClickHouse row.
    Returns (table_name, row) or None on error. Thread-safe / stateless.
    """
    if raw_msg is None:
        return None
    if raw_msg.error():
        if raw_msg.error().code() == KafkaError._PARTITION_EOF:
            return None
        return None

    topic = raw_msg.topic()
    table = TOPIC_TABLE_MAP.get(topic)
    if table is None:
        return None

    try:
        payload = json.loads(raw_msg.value())
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        return None

    builder = TABLE_META[table]["builder"]
    try:
        row = builder(payload)
        return (table, row)
    except Exception:
        return None


# ── Parallel flush ───────────────────────────────────────────────────────────


def _flush_table(
    writer_pool: WriterPool,
    table: str,
    columns: list[str],
    rows: list[list],
) -> int:
    """Flush a single table's rows using a pooled writer."""
    writer = writer_pool.acquire()
    try:
        return writer.insert(table, columns, rows)
    finally:
        writer_pool.release(writer)


def _flush_all_parallel(
    writer_pool: WriterPool,
    buffers: dict[str, list[list]],
    stats: StatsReporter,
    flush_executor: ThreadPoolExecutor,
) -> None:
    """
    Flush all non-empty buffers in parallel using the writer pool.
    Each table gets its own thread + dedicated ClickHouse connection.
    Buffers are snapshot-and-cleared so the main loop can resume immediately.
    """
    tasks = {}
    for table, rows in buffers.items():
        if not rows:
            continue
        # Snapshot and clear — main loop can resume filling immediately
        snapshot = list(rows)
        rows.clear()
        columns = TABLE_META[table]["columns"]
        future = flush_executor.submit(
            _flush_table, writer_pool, table, columns, snapshot,
        )
        tasks[future] = (table, len(snapshot))

    if not tasks:
        return

    total_flushed = 0
    for future in as_completed(tasks):
        table, count = tasks[future]
        try:
            flushed = future.result()
            total_flushed += flushed
            log.debug("Flushed %d rows → %s", flushed, table)
        except Exception as exc:
            log.error("Failed to flush %d rows → %s: %s", count, table, exc)
            stats.record_error(count)

    if total_flushed > 0:
        stats.record_flush(total_flushed)


# ── Main consumer loop ──────────────────────────────────────────────────────


def main() -> None:
    log.info(
        "Starting CLIF consumer  brokers=%s  group=%s  batch=%d  flush=%.1fs  "
        "poll_batch=%d  flush_workers=%d  deser_workers=%d",
        KAFKA_BROKERS, CONSUMER_GROUP, BATCH_SIZE, FLUSH_INTERVAL,
        POLL_BATCH, FLUSH_WORKERS, DESER_WORKERS,
    )

    # ── Initialize writer pool (one connection per flush worker) ──
    writer_pool = WriterPool(size=FLUSH_WORKERS)

    stats = StatsReporter()
    stats.start()

    # ── Kafka consumer with optimized fetch settings ──
    consumer = Consumer({
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": CONSUMER_GROUP,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
        # ── Fetch tuning: batch at the broker to reduce round-trips ──
        "fetch.min.bytes": 65536,                # 64 KB — wait for a decent batch
        "fetch.max.bytes": 52428800,             # 50 MB — max per fetch response
        "max.partition.fetch.bytes": 1048576,    # 1 MB per partition
        "fetch.wait.max.ms": 200,                # max 200ms broker-side wait
        # ── Session / poll tuning ──
        "session.timeout.ms": 30000,
        "max.poll.interval.ms": 300000,
        "heartbeat.interval.ms": 10000,
        # ── Consumer prefetch buffer ──
        "queued.min.messages": 10000,
        "queued.max.messages.kbytes": 131072,    # 128 MB prefetch buffer
        # ── Partition EOF is not an error ──
        "enable.partition.eof": False,
    })
    consumer.subscribe(TOPICS)
    log.info("Subscribed to topics: %s", TOPICS)

    # ── Thread pools ──
    deser_pool = ThreadPoolExecutor(
        max_workers=DESER_WORKERS, thread_name_prefix="deser",
    )
    flush_pool = ThreadPoolExecutor(
        max_workers=FLUSH_WORKERS, thread_name_prefix="flush",
    )

    # Per-table row buffers
    buffers: dict[str, list[list]] = {table: [] for table in TABLE_META}
    last_flush = time.monotonic()
    total_buffered = 0

    try:
        while not _shutdown.is_set():
            # ── Batch poll: up to POLL_BATCH messages in one syscall ──
            messages = consumer.consume(num_messages=POLL_BATCH, timeout=0.5)

            if not messages:
                # No messages — check time-based flush
                if time.monotonic() - last_flush >= FLUSH_INTERVAL and total_buffered > 0:
                    _flush_all_parallel(writer_pool, buffers, stats, flush_pool)
                    consumer.commit(asynchronous=True)
                    total_buffered = 0
                    last_flush = time.monotonic()
                continue

            # ── Parallel deserialization + row building ──
            batch_len = len(messages)
            if batch_len >= 50:
                # Worth parallelizing for large batches
                results = list(deser_pool.map(_deserialize_and_build, messages))
            else:
                # Small batch — inline to avoid thread overhead
                results = [_deserialize_and_build(m) for m in messages]

            # ── Distribute rows into per-table buffers ──
            msg_count = 0
            error_count = 0
            topic_counts: dict[str, int] = defaultdict(int)

            for result in results:
                if result is None:
                    error_count += 1
                    continue
                table, row = result
                buffers[table].append(row)
                msg_count += 1
                topic_counts[_TABLE_TO_TOPIC.get(table, "")] += 1

            total_buffered += msg_count

            # Update stats
            for topic, count in topic_counts.items():
                if topic:
                    stats.record_messages(topic, count)
            if error_count > 0:
                stats.record_error(error_count)

            # ── Size-based flush ──
            if total_buffered >= BATCH_SIZE:
                _flush_all_parallel(writer_pool, buffers, stats, flush_pool)
                consumer.commit(asynchronous=True)
                total_buffered = 0
                last_flush = time.monotonic()
                continue

            # ── Time-based flush ──
            if time.monotonic() - last_flush >= FLUSH_INTERVAL:
                _flush_all_parallel(writer_pool, buffers, stats, flush_pool)
                consumer.commit(asynchronous=True)
                total_buffered = 0
                last_flush = time.monotonic()

    except KeyboardInterrupt:
        log.info("Interrupted.")
    finally:
        log.info("Draining remaining buffers …")
        _flush_all_parallel(writer_pool, buffers, stats, flush_pool)
        try:
            consumer.commit(asynchronous=False)  # final commit is synchronous
        except Exception:
            pass
        consumer.close()
        deser_pool.shutdown(wait=True, cancel_futures=False)
        flush_pool.shutdown(wait=True, cancel_futures=False)
        log.info("Consumer shut down cleanly.")


if __name__ == "__main__":
    main()
