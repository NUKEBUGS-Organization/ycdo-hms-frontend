"""YCDO HMS - local fingerprint bridge for ZKTeco USB readers (Live10R / ZK9500 / SLK20R).

A browser cannot talk to a USB fingerprint reader, so this small service runs on the centre PC
and exposes the reader on http://127.0.0.1:8790 for the HMS web app (https://hms.ycdo.org.pk)
and for HMS pages served from localhost during development. It listens on 127.0.0.1 only, so
other computers on the network cannot reach it, and it answers only those page origins.

Chrome treats a request from a public https page to 127.0.0.1 as a Private Network Access
request: it sends a preflight with Access-Control-Request-Private-Network, answered below with
Access-Control-Allow-Private-Network: true. Newer Chrome versions may also ask the user once to
allow the site to reach local network devices - click Allow.

Needs the ZKFinger SDK for Windows (it installs the reader driver and libzkfp.dll).
Standard library only - no pip packages.

    python fp-bridge.py                 # real reader
    python fp-bridge.py --simulate      # no reader: simulated scans, for development only
    python fp-bridge.py --port 8790 --threshold 50

Endpoints (JSON):
    GET  /status                          reader state
    POST /capture   {timeoutMs}           wait for a finger; returns template + PNG image
    POST /merge     {templates:[a,b,c]}   three captures of one finger -> one enrolment template
    POST /match     {a, b}                score two templates
    POST /identify  {template, candidates:[{id, template}]}   best match above the threshold
    POST /sim/finger {finger}             (simulate mode only) which "finger" is on the glass
"""
import argparse
import base64
import ctypes
import json
import os
import struct
import sys
import threading
import time
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_TEMPLATE = 2048
ALLOWED_HOSTS = ('localhost', '127.0.0.1', '[::1]')
# Production HMS web app (exact origin, https only).
ALLOWED_ORIGINS = ('https://hms.ycdo.org.pk',)
# /identify sends every enrolled template; allow for a few thousand patients.
MAX_BODY = 32_000_000


def png_gray(width, height, pixels):
    """Encode 8-bit grayscale pixels as PNG (no external libraries)."""
    raw = b''.join(b'\x00' + pixels[y * width:(y + 1) * width] for y in range(height))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))


class ZKReader:
    """Thin ctypes wrapper over libzkfp.dll (ZKFinger SDK 5.x C API)."""

    def __init__(self, threshold):
        self.threshold = threshold
        self.lib = None
        self.dev = None
        self.db = None
        self.width = self.height = 0
        self.error = None
        self.lock = threading.Lock()
        self._load()

    def _load(self):
        try:
            lib = ctypes.WinDLL('libzkfp.dll')
        except OSError:
            self.error = 'libzkfp.dll not found - install the ZKFinger SDK for Windows (it also installs the reader driver)'
            return
        H, P, U, I = ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_uint), ctypes.c_int
        lib.ZKFPM_Init.restype = I
        lib.ZKFPM_Terminate.restype = I
        lib.ZKFPM_GetDeviceCount.restype = I
        lib.ZKFPM_OpenDevice.argtypes = [I]; lib.ZKFPM_OpenDevice.restype = H
        lib.ZKFPM_CloseDevice.argtypes = [H]; lib.ZKFPM_CloseDevice.restype = I
        lib.ZKFPM_GetParameters.argtypes = [H, I, P, U]; lib.ZKFPM_GetParameters.restype = I
        lib.ZKFPM_AcquireFingerprint.argtypes = [H, P, ctypes.c_uint, P, U]; lib.ZKFPM_AcquireFingerprint.restype = I
        lib.ZKFPM_DBInit.restype = H
        lib.ZKFPM_DBFree.argtypes = [H]; lib.ZKFPM_DBFree.restype = I
        lib.ZKFPM_DBMerge.argtypes = [H, P, P, P, P, U]; lib.ZKFPM_DBMerge.restype = I
        lib.ZKFPM_DBMatch.argtypes = [H, P, ctypes.c_uint, P, ctypes.c_uint]; lib.ZKFPM_DBMatch.restype = I
        self.lib = lib

    def _param(self, code):
        buf = ctypes.create_string_buffer(4)
        size = ctypes.c_uint(4)
        if self.lib.ZKFPM_GetParameters(self.dev, code, buf, ctypes.byref(size)) == 0:
            return struct.unpack('<I', buf.raw)[0]
        return 0

    def open(self):
        """Open the first reader. Safe to call repeatedly (re-plugging the reader is handled)."""
        if self.dev:
            return True
        if not self.lib:
            return False
        r = self.lib.ZKFPM_Init()
        if r not in (0, 1):  # 1 = already initialised
            self.error = f'ZKFPM_Init failed ({r})'
            return False
        if self.lib.ZKFPM_GetDeviceCount() < 1:
            self.error = 'No fingerprint reader found - check the USB cable and the driver (Device Manager)'
            self.lib.ZKFPM_Terminate()
            return False
        dev = self.lib.ZKFPM_OpenDevice(0)
        if not dev:
            self.error = 'The reader was found but could not be opened (is another program using it?)'
            self.lib.ZKFPM_Terminate()
            return False
        self.dev = dev
        self.db = self.lib.ZKFPM_DBInit()
        self.width, self.height = self._param(1), self._param(2)
        self.error = None
        return True

    def close(self):
        if self.lib and self.dev:
            if self.db:
                self.lib.ZKFPM_DBFree(self.db)
            self.lib.ZKFPM_CloseDevice(self.dev)
            self.lib.ZKFPM_Terminate()
        self.dev = self.db = None

    def status(self):
        with self.lock:
            ok = self.open()
            return {'ok': ok, 'simulate': False, 'device': 'ZKTeco fingerprint reader' if ok else None,
                    'width': self.width, 'height': self.height, 'threshold': self.threshold, 'error': None if ok else self.error}

    def _acquire(self, img):
        tmp = ctypes.create_string_buffer(MAX_TEMPLATE)
        size = ctypes.c_uint(MAX_TEMPLATE)
        r = self.lib.ZKFPM_AcquireFingerprint(self.dev, img, len(img), tmp, ctypes.byref(size))
        return (tmp.raw[:size.value] if r == 0 else None), r

    def capture(self, timeout_ms):
        with self.lock:
            if not self.open():
                raise RuntimeError(self.error)
            img = ctypes.create_string_buffer(self.width * self.height)
            # Wait for the previous finger to lift, so three enrolment scans are three real touches.
            lift_until = time.time() + 2.0
            while time.time() < lift_until:
                t, _ = self._acquire(img)
                if t is None:
                    break
                time.sleep(0.08)
            end = time.time() + timeout_ms / 1000.0
            while time.time() < end:
                t, r = self._acquire(img)
                if t is not None:
                    sys.stderr.write(f'[fp-bridge] capture template len={len(t)}\n')
                    return {'template': base64.b64encode(t).decode(),
                            'image': 'data:image/png;base64,' + base64.b64encode(png_gray(self.width, self.height, img.raw)).decode()}
                if r == -7:  # device handle no longer valid (unplugged)
                    self.close()
                    raise RuntimeError('The reader was disconnected')
                time.sleep(0.08)
            return None

    def merge(self, temps):
        with self.lock:
            if not self.open():
                raise RuntimeError(self.error)
            out = ctypes.create_string_buffer(MAX_TEMPLATE)
            size = ctypes.c_uint(MAX_TEMPLATE)
            a, b, c = [base64.b64decode(t) for t in temps]
            r = self.lib.ZKFPM_DBMerge(self.db, a, b, c, out, ctypes.byref(size))
            sys.stderr.write(f'[fp-bridge] merge r={r} len={size.value} inputs={[len(a), len(b), len(c)]}\n')
            if r != 0:
                raise ValueError('The three scans do not look like the same thumb - start the enrolment again')
            return base64.b64encode(out.raw[:size.value]).decode()

    def match(self, a, b):
        with self.lock:
            if not self.open():
                raise RuntimeError(self.error)
            ta, tb = base64.b64decode(a), base64.b64decode(b)
            score = self.lib.ZKFPM_DBMatch(self.db, ta, len(ta), tb, len(tb))
            sys.stderr.write(f'[fp-bridge] match raw={score} lenA={len(ta)} lenB={len(tb)}\n')
            if score < 0:
                raise RuntimeError(f'ZKFPM_DBMatch failed ({score})')
            return score


class SimReader:
    """Stand-in reader for development without hardware. Templates are labels, not biometrics."""

    def __init__(self, threshold):
        self.threshold = threshold
        self.finger = 'finger-1'
        self.lock = threading.Lock()

    def status(self):
        return {'ok': True, 'simulate': True, 'device': 'Simulated reader (no hardware)', 'width': 300, 'height': 400,
                'threshold': self.threshold, 'error': None}

    def capture(self, timeout_ms):
        time.sleep(0.6)
        t = ('SIM:' + self.finger).encode()
        w, hgt = 120, 160
        seed = sum(t)
        px = bytes((((x * 7 + y * 13 + seed) % 40) < 20) * 170 + 60 for y in range(hgt) for x in range(w))
        return {'template': base64.b64encode(t).decode(),
                'image': 'data:image/png;base64,' + base64.b64encode(png_gray(w, hgt, px)).decode()}

    def merge(self, temps):
        if len(set(temps)) != 1:
            raise ValueError('The three scans do not look like the same thumb - start the enrolment again')
        return temps[0]

    def match(self, a, b):
        return 95 if a == b else 0


class Handler(BaseHTTPRequestHandler):
    reader = None

    def log_message(self, fmt, *args):
        sys.stderr.write('[fp-bridge] ' + (fmt % args) + '\n')

    def _origin_ok(self):
        origin = self.headers.get('Origin')
        if not origin:
            return None
        if origin in ALLOWED_ORIGINS:
            return origin
        scheme = origin.split('://', 1)[0]
        rest = origin.split('://', 1)[-1]
        host = rest[:rest.index(']') + 1] if rest.startswith('[') else rest.split(':')[0].split('/')[0]
        if scheme in ('http', 'https') and (host in ALLOWED_HOSTS or host.endswith('.localhost')):
            return origin
        return False

    def _send(self, code, body):
        origin = self._origin_ok()
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        origin = self._origin_ok()
        self.send_response(204 if origin else 403)
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    def do_GET(self):
        if self._origin_ok() is False:
            return self._send(403, {'error': 'Origin not allowed'})
        if self.path.split('?')[0] == '/status':
            return self._send(200, self.reader.status())
        self._send(404, {'error': 'Not found'})

    def do_POST(self):
        if self._origin_ok() is False:
            return self._send(403, {'error': 'Origin not allowed'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n > MAX_BODY:
                return self._send(413, {'error': 'Request too large'})
            body = json.loads(self.rfile.read(n) or b'{}')
            path = self.path.split('?')[0]
            r = self.reader
            if path == '/capture':
                res = r.capture(min(max(int(body.get('timeoutMs', 15000)), 1000), 60000))
                return self._send(200, res or {'timeout': True})
            if path == '/merge':
                temps = body.get('templates') or []
                if len(temps) != 3:
                    return self._send(400, {'error': 'Three templates are needed'})
                return self._send(200, {'template': r.merge(temps)})
            if path == '/match':
                score = r.match(body['a'], body['b'])
                return self._send(200, {'score': score, 'matched': score >= r.threshold})
            if path == '/identify':
                best = None
                for cand in body.get('candidates') or []:
                    if not cand.get('template'):
                        continue
                    s = r.match(body['template'], cand['template'])
                    if s >= r.threshold and (best is None or s > best['score']):
                        best = {'id': cand.get('id'), 'score': s}
                return self._send(200, {'match': best})
            if path == '/sim/finger' and isinstance(r, SimReader):
                r.finger = str(body.get('finger') or 'finger-1')[:40]
                return self._send(200, {'finger': r.finger})
            self._send(404, {'error': 'Not found'})
        except ValueError as e:
            self._send(422, {'error': str(e)})
        except RuntimeError as e:
            self._send(503, {'error': str(e)})
        except Exception as e:  # keep the bridge alive whatever the request was
            self._send(500, {'error': f'{type(e).__name__}: {e}'})


def main():
    ap = argparse.ArgumentParser(description='YCDO HMS fingerprint service')
    ap.add_argument('--port', type=int, default=8790)
    ap.add_argument('--threshold', type=int, default=50, help='minimum match score (ZKFinger scale)')
    ap.add_argument('--simulate', action='store_true', help='no hardware: simulated reader for development')
    a = ap.parse_args()
    reader = SimReader(a.threshold) if a.simulate else ZKReader(a.threshold)
    Handler.reader = reader
    st = reader.status()
    print(f"[fp-bridge] http://127.0.0.1:{a.port}  ->  {st['device'] or 'NO READER'}" + ('' if st['ok'] else f"  ({st['error']})"), flush=True)
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if isinstance(reader, ZKReader):
            reader.close()


if __name__ == '__main__':
    main()
