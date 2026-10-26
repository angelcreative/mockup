# Mockup

Put a site on a 3D device. Chromium on the server captures one screen of the page at the device's exact viewport, at the spot of the page you choose, so any number of people can use the app at once on a small server.

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
2. Choose the device. Drag anywhere to orbit. **Position on page** (under the URL) picks which screen of the page shows: **Top**, **Middle**, **Bottom**, or any point in 5% steps with the slider. The last screen stays on the glass, marked "Updating…", until the new one arrives.
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
10. **Copy image** in Export, or `⌘C` / `Ctrl+C` anywhere outside a text field, puts the PNG on the clipboard. **Copy link** copies the address bar, which always holds the current page, device, finish, background, orientation, and opening, so a shared link restores the same mockup.
11. Paste or drop an image anywhere to place it on the screen, or a link to open it. The **Add page url** field and the upload buttons still work as before.
12. **Cinematics** plays a camera shot: Pull back, Push in, Orbit, Reveal, Settle (5 s each), or Loop 360° (8 s, a full turn at constant speed that repeats seamlessly). Playing a shot turns **Auto-rotate** off so the camera stays on the shot's last frame. **Record** plays the selected shot and saves it as a video, MP4 where the browser can encode it and WebM otherwise, in the **Current** window shape, **1:1**, or **9:16**; the shot is framed for that shape. The video is recorded in the browser at 2× pixel ratio, up to 1920 px on the long side, and never includes the controls. `Esc` cancels a take.

The status bar, menu bar, Dynamic Island, notch, and home indicator are device chrome. The page lives in the safe area and does not sit under that chrome.

Mac sizes, as of 10 Oct 2026, are the default Retina logical resolutions: MacBook Air 13-inch 1280×832, MacBook Air 15-inch 1440×932, MacBook Pro 14-inch 1512×982, MacBook Pro 16-inch 1728×1117, and iMac 24-inch 2240×1260. The page starts below the menu bar.

## Page capture

`GET /api/capture?url=…&w=…&h=…&at=0..1[&priority=low][&fresh=1][&warm=1]`

Returns one screen of the site as a JPEG, at that viewport (only the device viewports the app uses are accepted) and at position `at` in the page: 0 is the top, 1 the last screen, in 5% steps. Headers give `X-Capture-Width`, `X-Capture-Height`, `X-Page-Height`, and `X-Scroll-Y` in CSS pixels. The server waits for the page to load (up to 5 s), jumps to the position (twice, for pages that grow), and gives lazy images and scroll-triggered content 0.7 s to settle, with reduced motion. Sticky headers show as they would in a browser at that spot.

`warm=1` only queues the capture and answers `202`; the studio uses it while an address is typed, so **Open** is usually instant. `GET /api/warm` starts Chromium ahead of the first capture; the studio calls it as it opens.

While a page loads, the device shows a page-shaped placeholder with a moving highlight; after 6 s and 15 s a short note says the site is slow. The device on screen is captured first, then mobile, tablet, and laptop sizes at the same position in the background (`priority=low`), so switching family is instant. Switching size or position shows the closest capture straight away (the same spot first, then the nearest size of the same family) and fades to the exact one when it arrives. The position is part of the shareable link (`at`).

One Chromium serves the whole process and takes one capture at a time; the device someone is looking at goes before background captures. Captures are shared between visitors and served fresh for ten minutes, then served stale for up to thirty while a new one is taken in the background (24 MB at most). **Open** on the page already on screen asks for a fresh capture (`fresh=1`). Errors say what went wrong: an address that doesn't exist, a site that blocks automated visits or answers with an error, a slow site, a bad certificate. Ads, analytics, and video requests are blocked. The browser closes after two minutes without captures.

Only `http` and `https` addresses are accepted. Private, loopback, and link-local hosts are blocked, including requests the page makes.

## Render

`render.yaml` installs Chromium during the build, builds Next and compiles `server.ts` to `dist/server.js` (`npm run build`), and starts it with Node directly. On the Starter plan (512 MB), set the service's **Start Command** to the one in `render.yaml` if the service wasn't created from it: `npm start` keeps an extra npm process alive.

Memory on 512 MB:

- The server alone uses about 190 MB.
- Chromium runs with one renderer for every frame, a capped JavaScript heap, and no video.
- Only the screen at the chosen position is loaded and shot, and Chromium drops decoded images before the shot. A page with thirty 2400×1600 images peaked at about 340–390 MB for the whole app, at any position, on a phone or a laptop.
- A watchdog reads the container's memory every 150 ms. Past 88% of the limit it closes Chromium and answers "This page is too heavy to capture on this server" instead of letting the server be killed. `MEMORY_LIMIT_MB` sets the limit where the cgroup doesn't report one.
