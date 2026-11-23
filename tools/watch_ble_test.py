"""No-radio transport regression tests, using the real packet/response code."""
import asyncio
import contextlib
import importlib.util
import io
import json
import pathlib
import re
import unittest

spec = importlib.util.spec_from_file_location("watch_ble", pathlib.Path(__file__).with_name("watch-ble.py"))
ble = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ble)


class Client:
    last = None
    mode = "success"

    def __init__(self, device, **kwargs):
        Client.last = self
        self.device = device
        self.closed = False
        self.pending = b""
        self.packets = []
        self.lost = kwargs["disconnected_callback"]

    async def connect(self):
        if self.mode == "connect-timeout":
            await asyncio.Event().wait()

    async def disconnect(self):
        self.closed = True

    async def start_notify(self, uuid, callback):
        assert uuid == ble.RX
        self.receive = callback

    async def write_gatt_char(self, uuid, data, response):
        assert uuid == ble.TX
        assert response is False
        assert len(data) <= 20
        self.packets.append(data)
        self.pending += data
        if not self.pending.endswith(b"\n"):
            return
        command = self.pending.decode("ascii")
        self.pending = b""
        marker = re.search(r"__WATCH_[0-9a-f]+__", command)
        if not marker:
            return
        if self.mode == "disconnect":
            self.lost(self)
            return
        if self.mode == "timeout":
            return
        result = {"ok": True, "value": self.mode != "bad-readback"}
        if self.mode == "error":
            result = {"ok": False, "error": "Storage full"}
        reply = ("event line\r\n>" + marker[0] + json.dumps(result) + "\r\n>").encode()
        # Acknowledgement split across arbitrary BLE notification boundaries.
        for start in range(0, len(reply), 7):
            self.receive(None, reply[start:start + 7])


class Scanner:
    empty = False

    @classmethod
    async def discover(cls, **kwargs):
        assert kwargs["service_uuids"] == [ble.UART]
        d = type("Device", (), {"address": "AA:BB", "name": "Bangle.js"})()
        a = type("Adv", (), {"local_name": "Bangle.js test", "rssi": -40})()
        return {} if cls.empty else {"AA:BB": (d, a)}


class Tests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        Client.mode = "success"
        Scanner.empty = False
        self.job = {"command": "install", "device": "AA:BB", "timeout": 2, "listen": 0,
                    "steps": [{"code": "true", "label": "verify", "expectTrue": True}]}

    async def run_job(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            await ble.execute(self.job, Scanner, Client)
        return output.getvalue()

    async def test_split_acknowledgement_and_disconnect(self):
        output = await self.run_job()
        self.assertIn('"value": true', output)
        self.assertIn('"disconnected": true', output)
        self.assertIn("event line", output)
        self.assertTrue(Client.last.closed)
        self.assertGreater(len(Client.last.packets), 1)

    async def test_failure_paths_disconnect(self):
        for mode in ("bad-readback", "disconnect", "error"):
            Client.mode = mode
            with self.subTest(mode=mode):
                with self.assertRaises((RuntimeError, ConnectionError)):
                    await self.run_job()
                self.assertTrue(Client.last.closed)

    async def test_timeout_disconnects(self):
        Client.mode = "timeout"
        self.job["timeout"] = 0.5
        with self.assertRaises(asyncio.TimeoutError):
            await self.run_job()
        self.assertTrue(Client.last.closed)

    async def test_not_found_never_connects(self):
        Scanner.empty = True
        with self.assertRaisesRegex(RuntimeError, "not found"):
            await self.run_job()

    async def test_connect_timeout_also_attempts_disconnect(self):
        Client.mode = "connect-timeout"
        self.job["timeout"] = 0.1
        with self.assertRaises(asyncio.TimeoutError):
            await self.run_job()
        self.assertTrue(Client.last.closed)

    async def test_xoff_xon(self):
        client = Client(None, disconnected_callback=lambda _: None)
        console = ble.Console(client, 0.1)
        console.receive(None, b"\x13")
        self.assertFalse(console.writable.is_set())
        with self.assertRaises(asyncio.TimeoutError):
            await console.send(b"a")
        console.receive(None, b"\x11")
        await console.send(b"a")
        self.assertTrue(console.writable.is_set())

    def test_diagnostics_do_not_claim_to_distinguish_ambiguous_errors(self):
        for raw, expected in [("Bluetooth powered off", "off"), ("Permission denied", "permission denied"),
                              ("[org.freedesktop.DBus.Error.ServiceUnknown] org.bluez", "service unavailable"),
                              ("Watch not found", "Gadgetbridge"), ("", "timeout cannot identify")]:
            message = ble.diagnose(RuntimeError(raw), installing=True)
            self.assertIn(expected, message)
            self.assertIn("Upload interrupted", message)


if __name__ == "__main__":
    unittest.main()
