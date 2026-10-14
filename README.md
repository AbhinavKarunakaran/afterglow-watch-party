# Afterglow — Watch Party

A starter full-stack watch-party app with room codes, invite links, shared YouTube playback, chat, emoji reactions, a shared queue, group polls, and host transfer.

## Features

- Create a room or join with a six-character room code.
- Copy an invite link that includes the room code.
- Shared YouTube video selection and host-controlled play/pause/seek.
- Drift correction: participants compare their playback position with the latest server state and seek when drift is over 500 ms.
- Live chat and emoji reactions.
- Shared playlist / queue.
- Group polls with live vote counts.
- Host transfer and automatic host reassignment when the host disconnects.
- Responsive dark interface.

## Requirements

- Node.js 18+ (Node.js 20 LTS recommended)
- Internet connection for Socket.IO's YouTube embed and Google Fonts

## Run locally

1. Install Node.js from https://nodejs.org/
2. Extract this project.
3. Open a terminal in the project folder.
4. Run:

   ```bash
   npm install
   npm start
   ```

5. Open http://localhost:3000
6. Create a room in one browser window and join it from another using the room code.

To test on a local network, run the server on a computer and open `http://YOUR_COMPUTER_LAN_IP:3000` on devices on the same Wi-Fi. Allow Node.js through the local firewall if needed.

## GitHub setup

1. Sign in at https://github.com/ and create a **new repository** named `afterglow-watch-party`.
2. Do not add a README, `.gitignore`, or license on GitHub (these are already in this project).
3. Open a terminal in this project folder and run:

   ```bash
   git init
   git add .
   git commit -m "Build Afterglow watch party starter"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/afterglow-watch-party.git
   git push -u origin main
   ```

4. Replace `YOUR-USERNAME` with your GitHub username.

## Deploy it

The Node.js server must run somewhere that supports persistent WebSocket connections. A static GitHub Pages deployment alone cannot run this backend.

A beginner-friendly route is Render, Railway, or another Node.js host:
- Connect your GitHub repository.
- Set build/install command to `npm install`.
- Set start command to `npm start`.
- Use the generated public URL to share the app.

The app uses in-memory room state, so rooms are lost when the server restarts and the starter is intended for demos. For production, add a database/Redis adapter, authentication, rate limits, validation, moderation, and persistent room state.

## Performance testing notes

The requirements mention at least 10 users, control propagation ≤250 ms p95 on a local network, and drift ≤500 ms after correction. These are **targets, not pre-certified results**. Measure them on the actual test network before claiming compliance.

Suggested procedure:
1. Start the server on a computer connected to your test Wi-Fi.
2. Open the app on 10 devices/browser sessions and join the same room.
3. In browser DevTools, record the time from sending a `playback:command` to receiving `playback:update` on each client. Repeat at least 100 times.
4. Sort the measurements and report the 95th percentile (p95).
5. Compare player times after each correction; report the maximum observed drift and how long correction took.
6. Repeat with one client temporarily disconnecting/reconnecting and with two users issuing actions close together.

Use a table in your report with: date, server/device details, Wi-Fi/network, concurrent users, number of trials, p50, p95, max drift, reconnect result, and known failures.

## Important limitations

- YouTube videos must allow embedding. Some videos will reject embeds or behave differently by browser.
- Browsers may block autoplay; a participant may need to press play once.
- Room state is in memory; one server process is assumed.
- Host-only playback control is enforced by the server. Chat, reactions, queue additions and votes are shared.
- The starter provides a basic drift-correction path. For stronger reliability, use server-authoritative sequence numbers, timestamped commands, heartbeats, a Redis-backed Socket.IO adapter for multi-instance deployment, and automated 10-client load tests.
- Use only videos you have permission to share. The app synchronizes embedded playback; it does not upload or distribute movie files.

## Suggested next upgrades

- Persistent database for users, rooms, and watch history.
- Reconnection grace period and room membership identity that survives page reloads.
- Server-authoritative command versioning to resolve simultaneous seek/play/pause operations.
- Automated Playwright test with 10 browser contexts and latency percentile reporting.
- More advanced fuzzy search backed by a movie catalogue API.
- Room privacy settings, invite permissions, report/mute controls and accessibility improvements.
