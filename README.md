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

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The URL field starts at `https://angelsanchez.design`, and that page loads when the app opens.

## Use

1. Paste a URL, or keep the default, and press **Open**.
2. Choose the device. Drag off the screen to orbit. On the screen, the pointer, click, and wheel go to the page.
3. **Finish** lists only the colors Apple sells for that model.
4. **Background** keeps White, Mist, and Black, and adds each Vibrant vista, Green glory, and Deep dusk variant (001–030) as CSS measured from that wallpaper. **Upload image** uses a picture from your computer.
5. **Orientation** turns a phone or iPad to portrait or landscape. The browser viewport follows. The camera, buttons, Dynamic Island, and notch stay on the real edges. In landscape the clock, signal, and battery sit on the top edge, and the page stays below that bar and clear of the island or notch on the side.
6. On iPhone Duo, **Opening** 0 is the closed phone (outer display) and 1 opens it fully (inner display across both leaves). The same page stays on the glass. Closed, the browser uses 466×585. Open, one viewport of 890×533 is split across the two panels.
7. On a MacBook, **Lid** 0 is closed and 1 is a normal working angle. The page stays on the display while the lid is open. The menu bar uses the **Time** field, the same clock as the iPhone, iPad, and Duo status bar. Default time is 9:41.
8. **Save image** downloads the current PNG, a transparent background, a square frame, or a 9:16 story frame.

The status bar, menu bar, Dynamic Island, notch, and home indicator are device chrome. The page lives in the safe area and does not sit under that chrome.

Mac sizes, as of 10 Oct 2026, are the default Retina logical resolutions: MacBook Air 13-inch 1280×832, MacBook Air 15-inch 1440×932, MacBook Pro 14-inch 1512×982, MacBook Pro 16-inch 1728×1117, and iMac 24-inch 2240×1260. The live page starts below the menu bar.

## Live session

`WebSocket /api/live`

The client sends `open` with the URL and the content size, `resize` when the device, opening, or orientation changes, and `input` with CSS coordinates. The server replies with status messages and JPEG frames from `Page.startScreencast`.

Only `http` and `https` addresses are accepted. Private, loopback, and link-local hosts are blocked, including requests the page makes. One Chromium serves the whole process. Closing the socket closes the page; after three idle minutes the browser is stopped.

## Render

`render.yaml` installs Chromium during the build and starts `npm start`, the Node server that owns the WebSocket. The Starter plan has 512 MB.
