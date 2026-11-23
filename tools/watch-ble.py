#!/usr/bin/env python3
"""BLE UART transport. JSON job on stdin; acknowledged results on stdout."""
import asyncio
import json
import secrets
import sys

UART = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # central writes
RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # central receives


def diagnose(error, installing=False):
    raw = str(error)
    text = (type(error).__name__ + " " + raw + " " + str(getattr(error, "reason", ""))).lower()
    if "org.bluez" in text and "serviceunknown" in text:
        hint = "Linux Bluetooth service unavailable. Install/start BlueZ (bluetoothd) in the local desktop session; containers may not have access to the host system D-Bus."
    elif any(s in text for s in ("poweredoff", "powered off", "turned off", "notready", "powered_off", "no powered", "no bluetooth", "no_bluetooth", "no such adapter")):
        hint = "Bluetooth is off or unavailable. Turn on the adapter and the watch's Bluetooth."
    elif any(s in text for s in ("permission", "denied", "notauthorized", "not authorized", "unauthorized", "notpermitted")):
        hint = "Bluetooth permission denied. Allow the terminal/AI host in macOS Bluetooth privacy settings, or check Linux BlueZ/D-Bus policy and Windows app permissions."
    elif "not found" in text:
        hint = "Watch not found. Bring it nearby, enable Bluetooth/connectable mode and rescan. A watch already connected to Gadgetbridge, the Web IDE or another app may not advertise; disconnect those first."
    else:
        hint = "BLE connection/console failed. Check Bluetooth power and permissions. The watch may already be connected to Gadgetbridge, the Web IDE or another app: disconnect it there, exit export mode, then rescan. A timeout cannot identify the cause reliably."
    if installing:
        hint += " Upload interrupted or unverified: files may be partial. Do not launch the app. Reconnect, rerun the complete install, and require every readback plus final Storage listing to pass. User data is not rolled back."
    return hint + " Details: " + (raw or type(error).__name__)


class Console:
    def __init__(self, client, timeout):
        self.client = client
        self.timeout = timeout
        self.buffer = ""
        self.changed = asyncio.Event()
        self.writable = asyncio.Event()
        self.writable.set()
        self.disconnected = False

    def receive(self, _sender, data):
        for byte in data:
            if byte == 19:  # Espruino XOFF
                self.writable.clear()
            elif byte == 17:  # XON
                self.writable.set()
            else:
                self.buffer += chr(byte)
        if len(self.buffer) > 2_000_000:
            self.buffer = self.buffer[-1_000_000:]
        self.changed.set()

    def lost(self, _client):
        self.disconnected = True
        self.changed.set()
        self.writable.set()

    async def send(self, data):
        # 20-byte packets work without negotiating an increased MTU on all backends.
        for offset in range(0, len(data), 20):
            await asyncio.wait_for(self.writable.wait(), self.timeout)
            if self.disconnected:
                raise ConnectionError("Watch disconnected during write")
            await self.client.write_gatt_char(TX, data[offset:offset + 20], response=False)
            await asyncio.sleep(0.01)

    async def command(self, step):
        marker = "__WATCH_" + secrets.token_hex(8) + "__"
        code = ("(function(){try{var r=eval(" + json.dumps(step["code"], ensure_ascii=True) +
                ");print(" + json.dumps(marker) +
                "+JSON.stringify({ok:true,value:r===undefined?null:r}));}catch(e){print(" +
                json.dumps(marker) + "+JSON.stringify({ok:false,error:String(e)}));}})()")
        self.buffer = ""
        self.changed.clear()
        await self.send(("\x10" + code + "\n").encode("ascii"))
        while True:
            start = self.buffer.find(marker)
            if start >= 0 and "\n" in self.buffer[start:]:
                end = self.buffer.index("\n", start)
                response = json.loads(self.buffer[start + len(marker):end].strip())
                output = self.buffer[:start]
                self.buffer = self.buffer[end + 1:]
                if output.strip("\r\n> "):
                    print(json.dumps({"console": output}), flush=True)
                if not response["ok"]:
                    raise RuntimeError(step["label"] + ": " + response["error"])
                if step.get("expectTrue") and response.get("value") is not True:
                    raise RuntimeError(step["label"] + ": readback/check failed: " + str(response))
                print(json.dumps({"step": step["label"], **response}), flush=True)
                return
            if self.disconnected:
                raise ConnectionError("Watch disconnected before acknowledgement: " + step["label"])
            await self.changed.wait()
            self.changed.clear()


async def execute(job, scanner, client_type):
    # Scan first, then pass BLEDevice (important for CoreBluetooth UUIDs).
    found = await asyncio.wait_for(
        scanner.discover(timeout=job["timeout"], return_adv=True, service_uuids=[UART]),
        job["timeout"] + 5)
    watches = [(device, adv) for device, adv in found.values()]
    if job["command"] == "scan":
        for device, adv in watches:
            print(json.dumps({"device": device.address, "name": adv.local_name or device.name, "rssi": adv.rssi}), flush=True)
        if not watches:
            raise RuntimeError("Watch not found in scan")
        return
    matches = [d for d, _ in watches if d.address.lower() == job["device"].lower()]
    if not matches:
        raise RuntimeError("Watch not found: " + job["device"])
    client = client_type(matches[0], timeout=job["timeout"],
                         disconnected_callback=lambda c: console.lost(c))
    console = Console(client, job["timeout"])
    try:
        await asyncio.wait_for(client.connect(), job["timeout"])
        await asyncio.wait_for(client.start_notify(RX, console.receive), job["timeout"])
        # End an unfinished REPL line, but do not reset the running app.
        await asyncio.wait_for(console.send(b"\x03\x10\n"), job["timeout"])
        await asyncio.sleep(0.2)
        for step in job["steps"]:
            try:
                await asyncio.wait_for(console.command(step), job["timeout"])
            except asyncio.TimeoutError:
                raise TimeoutError("Timed out waiting for " + step["label"]) from None
            if step.get("delay"):
                await asyncio.sleep(step["delay"])
        if job["listen"]:
            end = asyncio.get_running_loop().time() + job["listen"]
            while asyncio.get_running_loop().time() < end:
                if console.disconnected:
                    raise ConnectionError("Watch disconnected while listening")
                if console.buffer.strip("\r\n> "):
                    print(json.dumps({"console": console.buffer}), flush=True)
                    console.buffer = ""
                await asyncio.sleep(0.1)
            if console.buffer.strip("\r\n> "):
                print(json.dumps({"console": console.buffer}), flush=True)
    finally:
        failed = sys.exc_info()[0] is not None
        try:
            await asyncio.wait_for(client.disconnect(), job["timeout"])
        except Exception as error:
            if not failed:
                raise
            print("watch: Disconnect cleanup also failed: " + str(error), file=sys.stderr)
    print(json.dumps({"disconnected": True}), flush=True)


def main():
    job = json.load(sys.stdin)
    try:
        from bleak import BleakClient, BleakScanner
        asyncio.run(execute(job, BleakScanner, BleakClient))
    except ImportError as error:
        print("watch: Install Python BLE dependencies with your venv's python -m pip install -r tools/requirements-watch.txt. " + str(error), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("watch: Cancelled. An upload may be partial; rerun the complete install before launching.", file=sys.stderr)
        return 130
    except Exception as error:
        print("watch: " + diagnose(error, job["command"] == "install"), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
