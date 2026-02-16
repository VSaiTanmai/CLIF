"""
CLIF Sysmon Live EPS Demo
===========================
Continuously produces Sysmon-style events across all 4 Kafka topics
at a configurable EPS rate so the dashboard displays live throughput.

Usage:
    python run_sysmon_eps_demo.py [--eps 500] [--duration 120]

Ctrl+C to stop early.
"""
from __future__ import annotations
import argparse, json, os, random, sys, time, uuid
from datetime import datetime, timezone
from confluent_kafka import Producer

BROKER = os.getenv("BROKER", "localhost:19092,localhost:29092,localhost:39092")

PRODUCER_CONFIG = {
    "bootstrap.servers": BROKER,
    "linger.ms": 5,
    "batch.num.messages": 10_000,
    "batch.size": 1_048_576,
    "compression.type": "lz4",
    "acks": "all",
    "enable.idempotence": True,
}

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

# ── Event generators ─────────────────────────────────────────────────────────

MITRE = [
    ("T1055", "defense-evasion"), ("T1003.001", "credential-access"),
    ("T1547.001", "persistence"), ("T1059.001", "execution"),
    ("T1218.011", "defense-evasion"), ("T1070.004", "defense-evasion"),
    ("T1021.001", "lateral-movement"), ("T1078", "initial-access"),
]

BINARIES = [
    "C:\\Windows\\System32\\cmd.exe", "C:\\Windows\\System32\\powershell.exe",
    "C:\\Windows\\System32\\svchost.exe", "C:\\Windows\\System32\\certutil.exe",
    "C:\\Windows\\System32\\rundll32.exe", "C:\\Windows\\System32\\mshta.exe",
    "C:\\Windows\\System32\\wscript.exe", "C:\\Users\\admin\\malware.exe",
]

HOSTNAMES = [f"WIN-SYSMON-{i:02d}" for i in range(20)]

def gen_security():
    t = random.choice(MITRE)
    return json.dumps({
        "timestamp": now_iso(),
        "severity": random.randint(1, 4),
        "category": t[1],
        "source": "sysmon",
        "description": f"Sysmon EID {random.choice([6,8,9,10,12,15,24,25])} detection on {random.choice(HOSTNAMES)}",
        "user_id": f"CORP\\user_{random.randint(1,50)}",
        "ip_address": f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",
        "hostname": random.choice(HOSTNAMES),
        "mitre_tactic": t[1],
        "mitre_technique": t[0],
        "ai_confidence": 0.0,
        "ai_explanation": "",
        "metadata": {"sysmon_event_id": str(random.choice([6,8,9,10,12,15,24,25])), "original_source_type": "sysmon"},
    }).encode()

def gen_process():
    bp = random.choice(BINARIES)
    suspicious = 1 if "certutil" in bp or "malware" in bp or "mshta" in bp else 0
    return json.dumps({
        "timestamp": now_iso(),
        "hostname": random.choice(HOSTNAMES),
        "pid": random.randint(1000, 65000),
        "ppid": random.randint(1, 2000),
        "uid": 0, "gid": 0,
        "binary_path": bp,
        "arguments": f"{bp.split(chr(92))[-1]} /c echo test",
        "cwd": "C:\\Windows\\System32",
        "exit_code": -1,
        "container_id": "", "pod_name": "", "namespace": "",
        "syscall": "CreateProcess",
        "is_suspicious": suspicious,
        "detection_rule": "lolbin_certutil" if "certutil" in bp else "",
        "metadata": {"sysmon_event_id": "1", "original_source_type": "sysmon"},
    }).encode()

def gen_network():
    is_dns = random.random() < 0.3
    return json.dumps({
        "timestamp": now_iso(),
        "hostname": random.choice(HOSTNAMES),
        "src_ip": f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",
        "src_port": random.randint(49152, 65535),
        "dst_ip": "8.8.8.8" if is_dns else f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}",
        "dst_port": 53 if is_dns else random.choice([80, 443, 8080, 8443]),
        "protocol": "DNS" if is_dns else "TCP",
        "direction": "outbound",
        "bytes_sent": random.randint(100, 50000),
        "bytes_received": random.randint(100, 100000),
        "duration_ms": random.randint(1, 5000),
        "pid": random.randint(1000, 65000),
        "binary_path": "C:\\Windows\\System32\\svchost.exe",
        "container_id": "", "pod_name": "", "namespace": "",
        "dns_query": f"{''.join(random.choices('abcdef0123456789', k=8))}.example.com" if is_dns else "",
        "geo_country": random.choice(["US", "CN", "RU", "DE", "GB", ""]),
        "is_suspicious": 0, "detection_rule": "",
        "metadata": {"sysmon_event_id": "22" if is_dns else "3", "original_source_type": "sysmon"},
    }).encode()

def gen_raw():
    msgs = [
        "File created: C:\\Users\\admin\\Downloads\\payload.exe by explorer.exe",
        "Named pipe created: \\\\pipe\\sysmon_pipe by cmd.exe",
        "File deleted [archived]: C:\\temp\\evidence.docx by powershell.exe",
        "Sysmon EventID 2: File creation time modified: C:\\Windows\\Temp\\backdoor.dll",
        "Sysmon EventID 26: File deleted: C:\\Users\\admin\\cleanup.bat",
    ]
    return json.dumps({
        "timestamp": now_iso(),
        "level": random.choice(["INFO", "WARNING", "INFO", "INFO"]),
        "source": "sysmon",
        "message": random.choice(msgs),
        "metadata": {"sysmon_event_id": str(random.choice([11, 17, 23, 2, 26])), "original_source_type": "sysmon"},
    }).encode()

# ── Topic → generator mapping (25% each) ────────────────────────────────────

TOPIC_GEN = [
    ("security-events", gen_security),
    ("process-events", gen_process),
    ("network-events", gen_network),
    ("raw-logs", gen_raw),
]

def main():
    parser = argparse.ArgumentParser(description="CLIF Sysmon Live EPS Demo")
    parser.add_argument("--eps", type=int, default=500, help="Target events/sec (default: 500)")
    parser.add_argument("--duration", type=int, default=120, help="Duration in seconds (default: 120)")
    args = parser.parse_args()

    target_eps = args.eps
    duration = args.duration
    batch_size = max(10, target_eps // 10)  # ~10 batches per second

    p = Producer(PRODUCER_CONFIG)
    errors = []
    def _cb(err, msg):
        if err:
            errors.append(err)

    print(f"🚀 Starting Sysmon live producer: {target_eps} EPS for {duration}s")
    print(f"   Dashboard: http://localhost:3000/dashboard")
    print(f"   Live Feed: http://localhost:3000/live-feed")
    print(f"   Press Ctrl+C to stop\n")

    total = 0
    start = time.monotonic()
    interval = 1.0 / (target_eps / batch_size)

    try:
        while time.monotonic() - start < duration:
            batch_start = time.monotonic()

            for _ in range(batch_size):
                topic, gen = random.choice(TOPIC_GEN)
                p.produce(topic, gen(), callback=_cb)
                total += 1

            p.poll(0)

            # Pace to target EPS
            elapsed = time.monotonic() - batch_start
            sleep_time = interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

            # Status update every 2 seconds
            wall = time.monotonic() - start
            if total % (target_eps * 2) < batch_size:
                actual_eps = total / max(wall, 0.001)
                print(f"  [{wall:6.1f}s] {total:>10,} events | {actual_eps:,.0f} EPS | errors: {len(errors)}")

    except KeyboardInterrupt:
        print("\n  Stopping...")

    p.flush(30)
    wall = time.monotonic() - start
    actual_eps = total / max(wall, 0.001)
    print(f"\n✅ Done: {total:,} events in {wall:.1f}s ({actual_eps:,.0f} avg EPS)")
    if errors:
        print(f"   ⚠ {len(errors)} delivery errors")

if __name__ == "__main__":
    main()
