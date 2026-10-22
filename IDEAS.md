# Berby — Ideas for after the MVP

Ideas we've parked so the MVP stays minimal. Not prioritized yet.

**Hard constraint for every idea below**: Berby is a static browser game (PWA) with no server, now or later. Anything here must work with static hosting, storage on the device, and sharing through links, QR codes, files or peer-to-peer connections. Where that makes something harder, we solve it when we get there.

## Gameplay
- ~~**Power-up items** — pickups, e.g. glitter bomb, heart shield, lipstick rocket.~~ Built in iteration 6 as the **Glam Cup** mode.
- **More items for Glam Cup** — a banana-style slick, a glitter storm that blinds the leader, a magnet that pulls stars (Glitter Rush crossover).
- **Drift + boost** — hold to drift around corners and charge a speed boost. A handling change rather than a mode, so it stays parked; it would make every mode faster.
- **Knockout with four karts** — last place each lap is out. Needs the rival AI to know about more than one other kart.
- **Daily challenge** — a seeded variant of a mode (star pattern, item luck) that is the same for everyone that day, with a shareable result code. Needs no server: the seed is the date.
- **Tilt to steer** — alternative control scheme. Needs the motion-sensor permission prompt on iOS, which the MVP deliberately avoids.
- **Vix overtakes instead of tailgating, and karts that block the view fade** — finding from the first playtest (iteration 4): the rubber band matches Vix's speed to the player's and her line is the centerline, so she sits 3–5 m behind the player's bumper while the chase camera is 8 m back, hiding the player. Two fixes, best together: the AI moves to the side when close behind to set up a pass, and any kart between the camera and the player turns translucent.

## Style & personalization
- **Character & kart styling** — choose a driver, outfit, kart color/style (the fashion angle).

## Content
- **World tour of tracks** — multiple city-themed tracks (Paris, Malibu, Tokyo, …).

## Multiplayer (MVP is player vs AI rival)
- **Peer-to-peer 1v1** — two phones connected directly over WebRTC, no game server. The obstacle: WebRTC needs the two sides to exchange a connection offer once; options are a link or QR code passed between the phones, or a shared local network. Solve when we get there.
- **Async ghost race** — race a recording of another player's lap. The recording format exists since iteration 6 (`src/modes/shared/recording.ts`, ~30 KB per lap, used by Ghost Lap and Hot Seat); what is left is compressing it into a link or QR code the other player opens. Nothing is uploaded anywhere.
- ~~**Same device, 2 players** — pass-and-play on one phone.~~ Built in iteration 6 as the **Hot Seat** mode. Split screen on a tablet stays an idea.
- **Local leaderboard** — the modes keep their best on the device since iteration 6; a leaderboard screen across modes, with a "share my time" link, is still to do.

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
