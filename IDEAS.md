# Berby — Ideas for after the MVP

Ideas we've parked so the MVP stays minimal. Not prioritized yet.

**Hard constraint for every idea below**: Berby is a static browser game (PWA) with no server, now or later. Anything here must work with static hosting, storage on the device, and sharing through links, QR codes, files or peer-to-peer connections. Where that makes something harder, we solve it when we get there.

## Gameplay
- **Power-up items** — Mario Kart style pickups, e.g. glitter bomb, heart shield, lipstick rocket.
- **Drift + boost** — hold to drift around corners and charge a speed boost.
- **Tilt to steer** — alternative control scheme. Needs the motion-sensor permission prompt on iOS, which the MVP deliberately avoids.
- **Vix overtakes instead of tailgating, and karts that block the view fade** — finding from the first playtest (iteration 4): the rubber band matches Vix's speed to the player's and her line is the centerline, so she sits 3–5 m behind the player's bumper while the chase camera is 8 m back, hiding the player. Two fixes, best together: the AI moves to the side when close behind to set up a pass, and any kart between the camera and the player turns translucent.

## Style & personalization
- **Character & kart styling** — choose a driver, outfit, kart color/style (the fashion angle).

## Content
- **World tour of tracks** — multiple city-themed tracks (Paris, Malibu, Tokyo, …).

## Multiplayer (MVP is player vs AI rival)
- **Peer-to-peer 1v1** — two phones connected directly over WebRTC, no game server. The obstacle: WebRTC needs the two sides to exchange a connection offer once; options are a link or QR code passed between the phones, or a shared local network. Solve when we get there.
- **Async ghost race** — race a recording of another player's lap. The ghost is compressed into a link or QR code the other player opens; nothing is uploaded anywhere.
- **Same device, 2 players** — split screen or pass-and-play on one phone/tablet. Needs no connection at all.
- **Local leaderboard** — best laps per track stored on the device, with a "share my time" link.

## Platform (MVP is mobile web / PWA)
- **Native app** — Unity or Godot build for App Store / Play Store distribution.

## Analytics (none in the MVP)
- **On-device stats** — races started / finished / won, best laps, play time, shown in a stats screen inside the game. Stays on the phone; no endpoint, since there is no server. Could be shared voluntarily as a link.

## Characters (MVP roster: Berby and Vix)
Name ideas for a future roster, in the glam, pastel, slightly cheeky Berby tone:
- **Heroes**: Bibi, Blossom, Coco, Dolly, Gigi, Lola, Peaches, Pixie, Sunny, Kiki
- **Rivals**: Vega, Nova, Rox, Jett, Zara, Scarlett, Luna, Raven, Storm, Mimi
- **Sidekicks / mascots**: Sprinkle (poodle), Mochi (cat), Duke (pug), Bubbles (goldfish), Flamingo "Flo"
- **Team / crew names**: Glitter Gang, Pink Lane Racing, Sunset Squad, Velvet Motors (Vix's team)

## Notes
- Barbie (Mattel) and Mario Kart (Nintendo) are style references only — Berby uses original characters, names, and art.
