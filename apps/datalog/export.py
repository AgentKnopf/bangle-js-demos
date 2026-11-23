#!/usr/bin/env python3
"""Download Data logger recordings from a Bangle.js 2 over Bluetooth LE.

    python3 export.py list                      # recordings on the watch
    python3 export.py get log.20261123-1015     # -> log-20261123-1015.csv
    python3 export.py get log.20261123-1015 --raw
    python3 export.py convert log.txt           # raw log file (e.g. from the IDE) -> CSV

Open "Export (PC)" on the watch first. BLE commands need `pip install bleak`;
`convert` needs nothing beyond Python 3.8.
"""
import argparse
import asyncio
import json
import sys

NUS_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # PC -> watch
NUS_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # watch -> PC

CSV_HEADER = "t_ms,type,accel_x,accel_y,accel_z,hr_bpm,hr_conf,pressure_hpa,temp_c,heading_deg,steps,label"
COLS = {"a": [2, 3, 4], "h": [5, 6], "p": [7, 8], "m": [9], "s": [10]}


def to_csv(lines):
    """Raw log lines (header, samples, optional trailer) -> CSV text."""
    label, out = "", [CSV_HEADER]
    for line in lines:
        line = line.rstrip("\r\n")
        if line.startswith("{"):
            try:
                h = json.loads(line)
                if "v" in h:
                    label = h.get("label") or ""
            except ValueError:
                pass
            continue
        p = line.split(",")
        if len(p) != 5 or p[1] not in COLS:
            continue
        row = [p[0], p[1]] + [""] * 9 + [label]
        for i, c in enumerate(COLS[p[1]]):
            row[c] = p[2 + i]
        out.append(",".join(row))
    return "\n".join(out) + "\n"


def complete_lines(text):
    """Split text into lines, dropping a last line with no newline (cut off by a reset)."""
    parts = text.split("\n")
    return parts[:-1]


async def request(cmd, name_prefix="Bangle", timeout=10.0):
    from bleak import BleakClient, BleakScanner  # imported here so `convert` works without bleak

    dev = await BleakScanner.find_device_by_filter(lambda d, ad: (d.name or "").startswith(name_prefix), timeout=timeout)
    if dev is None:
        sys.exit("No device named %s* found" % name_prefix)
    buf, lines, done = "", [], asyncio.Event()

    def on_rx(_, data):
        nonlocal buf
        buf += data.decode("latin-1")
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            line = line.rstrip("\r")
            if line == "END":
                done.set()
            elif not done.is_set():
                lines.append(line)

    async with BleakClient(dev) as client:
        await client.start_notify(NUS_RX, on_rx)
        data = (cmd + "\n").encode()
        for i in range(0, len(data), 20):
            await client.write_gatt_char(NUS_TX, data[i:i + 20], response=False)
        last = -1
        while not done.is_set():  # keep waiting while lines keep arriving
            if len(lines) == last:
                sys.exit("No END from the watch - is it in Export mode?")
            last = len(lines)
            try:
                await asyncio.wait_for(done.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                pass
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    g = sub.add_parser("get")
    g.add_argument("name")
    g.add_argument("-o", "--out")
    g.add_argument("--raw", action="store_true", help="save the log verbatim instead of CSV")
    c = sub.add_parser("convert")
    c.add_argument("file")
    c.add_argument("-o", "--out")
    a = ap.parse_args()

    if a.cmd == "convert":
        with open(a.file, newline="") as f:
            text = to_csv(complete_lines(f.read()))
        if a.out:
            open(a.out, "w", newline="").write(text)
        else:
            sys.stdout.write(text)
        return
    if a.cmd == "list":
        for line in asyncio.run(request("LIST")):
            if line.startswith("F "):
                f = json.loads(line[2:])
                print("%-22s %8d bytes" % (f["name"], f["bytes"]))
        return
    lines = asyncio.run(request("GET " + a.name))
    if lines and lines[0].startswith("ERR "):
        sys.exit(lines[0])
    out = a.out or a.name.replace("log.", "log-", 1) + (".txt" if a.raw else ".csv")
    with open(out, "w", newline="") as f:
        f.write("\n".join(lines) + "\n" if a.raw else to_csv(lines))
    print("saved %s (%d lines)" % (out, len(lines)))


if __name__ == "__main__":
    main()
