# YCDO HMS fingerprint service (centre PCs)

The HMS web app (https://hms.ycdo.org.pk) takes the patient photo from the webcam directly, but a
browser cannot open a USB fingerprint reader. `fp-bridge.py` is a small local service that exposes
the ZKTeco reader (Live10R / ZK9500 / SLK20R) on `http://127.0.0.1:8790` for the HMS page.

## One-time setup on each centre PC
1. Install Python 3 from python.org (tick "Add python.exe to PATH").
2. Install the **ZKFinger SDK for Windows** (installs the reader driver and `libzkfp.dll`).
3. Plug in the reader; in Device Manager it should show without a warning sign.
4. Copy this `bridge` folder to the PC (for example `C:\YCDO\fingerprint`).

## Every day
Double-click `start-fingerprint-service.bat` and keep its window open. It checks Python and the
SDK, does nothing if the service is already running, and otherwise starts `fp-bridge.py`.
Messages are in Roman Urdu for the centre staff.

If Chrome asks whether `hms.ycdo.org.pk` may reach devices on the local network, click **Allow**.

## Notes
- Standard library only, no pip packages. Listens on 127.0.0.1 only.
- Answers only these page origins: `https://hms.ycdo.org.pk`, and `http(s)://localhost`,
  `127.0.0.1`, `[::1]`, `*.localhost` (development). Private Network Access preflights are answered.
- Endpoints: `GET /status`, `POST /capture`, `POST /merge` (three scans -> one template),
  `POST /match`, `POST /identify` (duplicate check and find-by-thumb).
- Development without a reader: `python fp-bridge.py --simulate` (fake templates; never use on a
  centre PC, the .bat file refuses to start without the SDK for that reason).
