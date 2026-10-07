"""Download pinned, checksum-verified API documentation. Not needed to run the LMS."""
import concurrent.futures
import hashlib
import json
import time
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
inventory=json.loads((ROOT/'docs/source-inventory.json').read_text())

def retrieve(item):
    dest=ROOT/item['localPath']
    if dest.exists(): data=dest.read_bytes()
    else:
        for attempt in range(3):
            try:
                data=urllib.request.urlopen(f'https://raw.githubusercontent.com/{item["repository"]}/{item["commit"]}/{item["path"]}',timeout=45).read()
                break
            except Exception:
                if attempt==2: raise
                time.sleep(1)
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(data)
    actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    if actual!=item['sha']: raise ValueError('Source blob mismatch: '+item['path'])
    return len(data)

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    results=list(pool.map(retrieve,inventory))
print(json.dumps({'pages':len(results),'bytes':sum(results)}))
