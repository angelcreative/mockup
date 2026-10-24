# Mockup

Open a site on a 3D device and browse it live. Chromium runs on the server: the device screen receives a screencast, and clicks on the glass are forwarded to that page.

## Requirements

- Node.js 22

## Start

```bash
npm install
npx playwright install chromium
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The URL field starts at `https://www.apple.com`, and that page loads when the app opens.

## Use

1. Paste a URL, or keep the default, and press **Open**.
2. Choose the device. Drag off the screen to orbit. On the screen, the pointer, click, and wheel go to the page.
3. The **View** bar at the bottom moves the camera:
   - **Rotate** (`R`) drags to orbit. **Move** (`H`) drags to slide the device across the viewport; the device itself is grabbable and the page ignores the pointer. Hold `Space` to move for a moment, or right-drag, Shift-drag, or two-finger drag in either mode.
   - **−** / **+** (`-` / `+`) zoom; the percentage returns to the framed zoom. Arrow keys nudge the device, Shift for bigger steps.
   - **Reset view** (`0`) eases back to the starting frame. Moving stops before the device leaves the frame.
4. **Finish** lists only the colors Apple sells for that model.
5. **Background** keeps White, Mist, and Black, and adds each Vibrant vista, Green glory, and Deep dusk variant (001–030) as CSS measured from that wallpaper. **Upload image** uses a picture from your computer.
6. **Orientation** turns a phone or iPad to portrait or landscape. The browser viewport follows. The camera, buttons, Dynamic Island, and notch stay on the real edges. In landscape the clock, signal, and battery sit on the top edge, and the page stays below that bar and clear of the island or notch on the side.
7. On iPhone Duo, **Opening** 0 is the closed phone (outer display) and 1 opens it fully (inner display across both leaves). The same page stays on the glass. Closed, the browser uses 466×585. Open, one viewport of 890×533 is split across the two panels.
8. On a MacBook, **Lid** 0 is closed and 1 is a normal working angle. The page stays on the display while the lid is open. The menu bar uses the **Time** field, the same clock as the iPhone, iPad, and Duo status bar. Default time is 9:41.
9. **Save image** downloads the current PNG, a transparent background, a square frame, or a 9:16 story frame.

The status bar, menu bar, Dynamic Island, notch, and home indicator are device chrome. The page lives in the safe area and does not sit under that chrome.

Mac sizes, as of 10 Oct 2026, are the default Retina logical resolutions: MacBook Air 13-inch 1280×832, MacBook Air 15-inch 1440×932, MacBook Pro 14-inch 1512×982, MacBook Pro 16-inch 1728×1117, and iMac 24-inch 2240×1260. The live page starts below the menu bar.

## Live session

`WebSocket /api/live`

The client sends `open` with the URL and the content size, `resize` when the device, opening, or orientation changes, and `input` with CSS coordinates. The server replies with status messages and JPEG frames from `Page.startScreencast`.

Frames are paced so the server never runs ahead of the screen:

- The client answers each frame with `frame` once it has drawn it, and Chromium is acknowledged only then, so one frame is on the wire and one waits. Frames come at up to ~30 fps while someone is using the page and ~6 fps while it only animates by itself.
- The client sends `scale`, the device pixels the glass covers per CSS pixel. Frames are encoded at that size, up to the page's own pixel ratio, so a small device on screen costs less and zooming in sharpens it.
- Pointer moves and wheel steps that queue up while Chromium is busy merge into one.
- Ads and analytics requests are blocked.

Only `http` and `https` addresses are accepted. Private, loopback, and link-local hosts are blocked, including requests the page makes. One Chromium page serves the whole process: while someone has it, a second visitor is told the live view is busy instead of taking it over. The page closes when the socket closes, after three minutes without input (keep-alives don't count), or one minute after the tab is hidden; three minutes later the browser stops.

## Render

`render.yaml` installs Chromium during the build and starts `npm start`, the Node server that owns the WebSocket. The Starter plan has 512 MB.
