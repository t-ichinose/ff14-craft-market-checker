"""
GitHub Release Asset Manager for FF14 Craft Market Checker.

Solves GitHub API CDN cache-inconsistency (ghost cache) and gh CLI --clobber 404 bugs.
Provides robust download and upload operations directly via GitHub REST API with:
- Direct release ID resolution (avoiding stale tag cache)
- Graceful 404 handling on DELETE (idempotent removal)
- Automatic retry on upload conflicts (HTTP 422)
- Integrity and requirement verification
"""

import os
import sys
import argparse
import time
from typing import List, Optional, Dict, Any
import httpx

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)

GITHUB_API_BASE = "https://api.github.com"
GITHUB_UPLOADS_BASE = "https://uploads.github.com"

def get_auth_headers(token: Optional[str]) -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ff14-craft-market-checker-pipeline",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

def get_repo(cli_repo: Optional[str]) -> str:
    repo = cli_repo or os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        raise ValueError("Repository must be provided via --repo or GITHUB_REPOSITORY environment variable.")
    return repo

def get_token() -> Optional[str]:
    return os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")

def fetch_release_by_tag_or_create(client: httpx.Client, repo: str, tag: str, title: str, notes: str) -> Dict[str, Any]:
    url = f"{GITHUB_API_BASE}/repos/{repo}/releases/tags/{tag}"
    resp = client.get(url)
    if resp.status_code == 200:
        rel_data = resp.json()
        rel_id = rel_data["id"]
        # Always fetch via Release ID directly to bypass stale CDN tag caches
        id_resp = client.get(f"{GITHUB_API_BASE}/repos/{repo}/releases/{rel_id}")
        if id_resp.status_code == 200:
            return id_resp.json()
        return rel_data
    
    if resp.status_code == 404:
        print(f"📦 Release with tag '{tag}' not found. Creating new release...")
        create_url = f"{GITHUB_API_BASE}/repos/{repo}/releases"
        payload = {
            "tag_name": tag,
            "name": title,
            "body": notes,
            "draft": False,
            "prerelease": False
        }
        create_resp = client.post(create_url, json=payload)
        create_resp.raise_for_status()
        return create_resp.json()
    
    resp.raise_for_status()
    return {}

def download_assets(repo: str, tag: str, target_dir: str, required_files: List[str], allow_missing: bool = False):
    token = get_token()
    headers = get_auth_headers(token)
    os.makedirs(target_dir, exist_ok=True)
    
    with httpx.Client(headers=headers, timeout=60.0, follow_redirects=True) as client:
        tag_url = f"{GITHUB_API_BASE}/repos/{repo}/releases/tags/{tag}"
        resp = client.get(tag_url)
        if resp.status_code == 404:
            if allow_missing:
                print(f"⚠️ Release '{tag}' not found, skipping download (allow_missing=True).")
                return
            raise FileNotFoundError(f"Release '{tag}' not found in {repo}!")
        resp.raise_for_status()
        rel_data = resp.json()
        rel_id = rel_data["id"]

        # Fetch latest asset list using release ID to avoid tag cache anomalies
        id_resp = client.get(f"{GITHUB_API_BASE}/repos/{repo}/releases/{rel_id}")
        if id_resp.status_code == 200:
            rel_data = id_resp.json()
        
        assets = rel_data.get("assets", [])
        print(f"📥 Found {len(assets)} assets in release '{tag}' (Release ID: {rel_id}):")
        
        downloaded = set()
        for asset in assets:
            name = asset["name"]
            size = asset["size"]
            download_url = asset["browser_download_url"]
            dest_path = os.path.join(target_dir, name)
            
            print(f"  ⬇️ Downloading {name} ({size:,} bytes) ...", end="", flush=True)
            t0 = time.time()
            with client.stream("GET", download_url) as r:
                r.raise_for_status()
                with open(dest_path, "wb") as f:
                    for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
            elapsed = time.time() - t0
            actual_size = os.path.getsize(dest_path)
            print(f" done in {elapsed:.1f}s ({actual_size:,} bytes)")
            downloaded.add(name)
        
        if required_files:
            missing = [req for req in required_files if req not in downloaded or not os.path.exists(os.path.join(target_dir, req))]
            if missing:
                err_msg = f"❌ Required files missing from release '{tag}': {missing}"
                print(err_msg, file=sys.stderr)
                if not allow_missing:
                    sys.exit(1)
        
        print("✨ Download complete.")

def upload_assets(repo: str, tag: str, file_paths: List[str], title: str, notes: str):
    token = get_token()
    if not token:
        raise ValueError("GH_TOKEN or GITHUB_TOKEN environment variable is required to upload assets.")
    
    valid_files = [p for p in file_paths if os.path.exists(p)]
    if not valid_files:
        print("⚠️ No valid files found to upload.")
        return

    headers = get_auth_headers(token)

    with httpx.Client(headers=headers, timeout=120.0) as client:
        release = fetch_release_by_tag_or_create(client, repo, tag, title, notes)
        rel_id = release["id"]
        print(f"🚀 Preparing to upload {len(valid_files)} files to release '{tag}' (ID: {rel_id}) in {repo}")

        for file_path in valid_files:
            filename = os.path.basename(file_path)
            file_size = os.path.getsize(file_path)
            print(f"\n📦 Processing {filename} ({file_size:,} bytes)...")

            # Retry loop for deletion + upload
            max_retries = 3
            success = False
            for attempt in range(1, max_retries + 1):
                # 1. Fetch current assets via ID
                current_rel = client.get(f"{GITHUB_API_BASE}/repos/{repo}/releases/{rel_id}").json()
                existing_asset = None
                for a in current_rel.get("assets", []):
                    if a["name"] == filename:
                        existing_asset = a
                        break

                # 2. Delete existing asset if present
                if existing_asset:
                    asset_id = existing_asset["id"]
                    print(f"  🗑️ Existing asset found (ID: {asset_id}). Deleting...", end="", flush=True)
                    del_resp = client.delete(f"{GITHUB_API_BASE}/repos/{repo}/releases/assets/{asset_id}")
                    if del_resp.status_code in (204, 200):
                        print(" deleted.")
                    elif del_resp.status_code == 404:
                        print(" already deleted (404 ignored).")
                    else:
                        print(f" warning: delete returned HTTP {del_resp.status_code}")
                    # Brief pause to allow storage convergence
                    time.sleep(1.0)

                # 3. Upload new asset
                upload_url = f"{GITHUB_UPLOADS_BASE}/repos/{repo}/releases/{rel_id}/assets?name={filename}"
                content_type = "application/gzip" if filename.endswith(".gz") else ("application/json" if filename.endswith(".json") else "application/octet-stream")
                upload_headers = {
                    **headers,
                    "Content-Type": content_type,
                    "Content-Length": str(file_size)
                }

                print(f"  ⬆️ Uploading {filename} (Attempt {attempt}/{max_retries})...", end="", flush=True)
                t0 = time.time()
                with open(file_path, "rb") as f:
                    file_content = f.read()
                
                up_resp = client.post(upload_url, headers=upload_headers, content=file_content)
                elapsed = time.time() - t0

                if up_resp.status_code == 201:
                    print(f" successfully uploaded in {elapsed:.1f}s!")
                    success = True
                    break
                elif up_resp.status_code == 422:
                    print(f" ⚠️ Conflict (HTTP 422: already exists). Retrying deletion...")
                    time.sleep(2.0)
                else:
                    print(f" ❌ Failed with HTTP {up_resp.status_code}: {up_resp.text}")
                    if attempt == max_retries:
                        up_resp.raise_for_status()
                    time.sleep(2.0)

            if not success:
                raise RuntimeError(f"Failed to upload {filename} after {max_retries} attempts.")

    print("\n✨ All assets uploaded successfully!")

def main():
    parser = argparse.ArgumentParser(description="Robust GitHub Release Asset Manager")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # download subcommand
    dl_parser = subparsers.add_parser("download", help="Download assets from a release")
    dl_parser.add_argument("--repo", help="owner/repo (defaults to GITHUB_REPOSITORY env)")
    dl_parser.add_argument("--tag", default="data-latest", help="Release tag name")
    dl_parser.add_argument("--dir", required=True, help="Destination directory")
    dl_parser.add_argument("--required", nargs="*", default=[], help="Required asset filenames")
    dl_parser.add_argument("--allow-missing", action="store_true", help="Do not fail if release or assets do not exist yet")

    # upload subcommand
    up_parser = subparsers.add_parser("upload", help="Upload assets to a release")
    up_parser.add_argument("--repo", help="owner/repo (defaults to GITHUB_REPOSITORY env)")
    up_parser.add_argument("--tag", default="data-latest", help="Release tag name")
    up_parser.add_argument("--title", default="Latest Market Data", help="Release title")
    up_parser.add_argument("--notes", default="Automated data assets for FF14 Craft Market Checker", help="Release notes")
    up_parser.add_argument("--files", nargs="+", required=True, help="Files to upload")

    args = parser.parse_args()
    repo = get_repo(args.repo)

    if args.command == "download":
        download_assets(
            repo=repo,
            tag=args.tag,
            target_dir=args.dir,
            required_files=args.required,
            allow_missing=args.allow_missing
        )
    elif args.command == "upload":
        upload_assets(
            repo=repo,
            tag=args.tag,
            file_paths=args.files,
            title=args.title,
            notes=args.notes
        )

if __name__ == "__main__":
    main()
