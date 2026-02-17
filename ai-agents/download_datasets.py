"""
Download real-world security datasets for CLIF ML training.

Datasets:
1. CICIDS-2017: Modern IDS dataset from Canadian Institute for Cybersecurity
   - 2.8M+ flows, 78 features, labeled (Benign + 14 attack types)
   - Source: UNB / various mirrors
2. UNSW-NB15: Network intrusion dataset from UNSW Canberra
   - 2.5M records, 49 features, 9 attack categories + normal
"""
import os
import sys
import urllib.request
import zipfile
import time
import hashlib

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# ── CICIDS-2017 ──────────────────────────────────────────────────────────
# The CSVs are hosted on multiple mirrors. We'll try several.
CICIDS_URLS = [
    # Kaggle-derived mirror (individual day files combined)
    ("https://raw.githubusercontent.com/karthik-vellore-revature/Intrusion-Detection/main/all_data.csv", "cicids2017_all.csv"),
]

# ── UNSW-NB15 ────────────────────────────────────────────────────────────
# Training/test sets from the official UNSW source
UNSW_URLS = [
    ("https://raw.githubusercontent.com/InitRoot/UNSW_NB15_Dataset_Analysis/master/UNSW_NB15_training-set.csv", "unsw_nb15_train.csv"),
    ("https://raw.githubusercontent.com/InitRoot/UNSW_NB15_Dataset_Analysis/master/UNSW_NB15_testing-set.csv", "unsw_nb15_test.csv"),
]

# ── NSL-KDD (as fallback — small, reliable) ──────────────────────────────
NSL_KDD_URLS = [
    ("https://raw.githubusercontent.com/defcom17/NSL_KDD/master/KDDTrain+.txt", "nsl_kdd_train.txt"),
    ("https://raw.githubusercontent.com/defcom17/NSL_KDD/master/KDDTest+.txt", "nsl_kdd_test.txt"),
]


def download_file(url, dest_path, desc=""):
    """Download with progress reporting."""
    if os.path.exists(dest_path):
        size = os.path.getsize(dest_path)
        if size > 1000:
            print(f"  ✔ Already exists: {os.path.basename(dest_path)} ({size:,} bytes)")
            return True

    print(f"  ↓ Downloading {desc or os.path.basename(dest_path)}...")
    print(f"    URL: {url[:80]}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 CLIF-ML/1.0"})
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=300) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            with open(dest_path, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 1024)  # 1MB chunks
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = downloaded / total * 100
                        print(f"\r    {downloaded:,}/{total:,} bytes ({pct:.0f}%)", end="", flush=True)
                    else:
                        print(f"\r    {downloaded:,} bytes", end="", flush=True)
        elapsed = time.perf_counter() - t0
        size = os.path.getsize(dest_path)
        print(f"\n  ✔ Done: {size:,} bytes in {elapsed:.1f}s")
        return True
    except Exception as e:
        print(f"\n  ✗ Failed: {e}")
        if os.path.exists(dest_path):
            os.remove(dest_path)
        return False


def main():
    print("=" * 70)
    print("CLIF ML Dataset Downloader")
    print("=" * 70)
    
    results = {}
    
    # 1. UNSW-NB15 (most reliable, good size)
    print("\n[1/3] UNSW-NB15 Dataset")
    print("-" * 40)
    unsw_ok = True
    for url, fname in UNSW_URLS:
        dest = os.path.join(DATA_DIR, fname)
        if not download_file(url, dest, fname):
            unsw_ok = False
    results["UNSW-NB15"] = unsw_ok
    
    # 2. NSL-KDD (small, always works)
    print("\n[2/3] NSL-KDD Dataset")
    print("-" * 40)
    nsl_ok = True
    for url, fname in NSL_KDD_URLS:
        dest = os.path.join(DATA_DIR, fname)
        if not download_file(url, dest, fname):
            nsl_ok = False
    results["NSL-KDD"] = nsl_ok
    
    # 3. CICIDS-2017 (large, may fail)
    print("\n[3/3] CICIDS-2017 Dataset")
    print("-" * 40)
    cicids_ok = False
    for url, fname in CICIDS_URLS:
        dest = os.path.join(DATA_DIR, fname)
        if download_file(url, dest, fname):
            cicids_ok = True
            break
    results["CICIDS-2017"] = cicids_ok
    
    # Summary
    print("\n" + "=" * 70)
    print("DOWNLOAD SUMMARY")
    print("=" * 70)
    for name, ok in results.items():
        status = "✔ Available" if ok else "✗ Failed"
        print(f"  {name:20s} {status}")
    
    # Show data directory contents
    print(f"\nData directory: {DATA_DIR}")
    total_size = 0
    for f in sorted(os.listdir(DATA_DIR)):
        fp = os.path.join(DATA_DIR, f)
        if os.path.isfile(fp):
            sz = os.path.getsize(fp)
            total_size += sz
            print(f"  {f:40s} {sz:>12,} bytes")
    print(f"  {'TOTAL':40s} {total_size:>12,} bytes ({total_size/1024/1024:.1f} MB)")


if __name__ == "__main__":
    main()
