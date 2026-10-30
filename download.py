"""Download the latest 10-minute in-situ observation file from the KNMI Open Data API.

Usage: set KNMI_API_KEY, then `python download.py [output_dir]`.
"""
import os
import sys

import requests

BASE = "https://api.dataplatform.knmi.nl/open-data/v1/datasets/10-minute-in-situ-meteorological-observations/versions/1.0/files"
key = os.environ["KNMI_API_KEY"]
out = sys.argv[1] if len(sys.argv) > 1 else "."
headers = {"Authorization": key}

listing = requests.get(BASE, headers=headers, params={"maxKeys": 1, "orderBy": "created", "sorting": "desc"})
listing.raise_for_status()
filename = listing.json()["files"][0]["filename"]

url = requests.get(f"{BASE}/{filename}/url", headers=headers)
url.raise_for_status()
data = requests.get(url.json()["temporaryDownloadUrl"])
data.raise_for_status()

path = os.path.join(out, filename)
with open(path, "wb") as f:
    f.write(data.content)
print(path)
