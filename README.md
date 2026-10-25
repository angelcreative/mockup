# Mockup

Open a site on a 3D device and scroll through it. Chromium on the server takes a full-page capture at the device's exact viewport, and the page scrolls inside the device in the browser, so any number of people can use the app at once.

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
2. Choose the device. Drag off the screen to orbit. On the screen, the wheel or a drag scrolls the page, with momentum and a rubber-band edge like iOS.
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

`GET /api/capture?url=…&w=…&h=…[&priority=low][&fresh=1]`

Returns a full-page JPEG of the site at that viewport (only the device viewports the app uses are accepted), with `X-Capture-Width`, `X-Capture-Height`, and `X-Page-Height` in CSS pixels. Before the shot the server scrolls through the page so lazy images load, and asks for reduced motion so scroll-triggered content shows. Pages are cut at 12,000 CSS pixels or 12 megapixels, whichever comes first. Sticky headers appear once, at the top, and are not fixed while scrolling.

- The device on screen is captured first, at its exact size. Then mobile, tablet, and laptop sizes are captured in the background (`priority=low`), so switching family is instant. Switching to another size shows the nearest capture straight away and swaps in the exact one when it arrives, keeping the scroll position.
- One Chromium serves the whole process and takes one capture at a time; the device someone is looking at goes before background captures. Captures are cached for ten minutes (48 MB at most) and shared, so a page someone else just opened comes back at once. **Open** asks for a fresh capture (`fresh=1`).
- Ads and analytics requests are blocked. The browser closes after two minutes without captures.

Only `http` and `https` addresses are accepted. Private, loopback, and link-local hosts are blocked, including requests the page makes.

## Render

`render.yaml` installs Chromium during the build and starts `npm start`, the Node server that serves the app and `/api/capture`. The Starter plan has 512 MB.
