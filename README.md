# The Completionist – Aion 2 overlay

An overlay for **Aion 2** (Global/EU): always on top, translucent, hotkeys, click-through – or, on a second screen, a
normal dockable window. It helps you complete everything: soul pets, achievements, dailies/weeklies, bosses and events.
You track your progress by hand; everything else comes from public data. German and English.

**[Download the latest release](https://github.com/Kloggzer/the-completionist-aion2/releases/latest)** –
`TheCompletionist-Setup-x.y.z.exe` (installer: checks .NET/WebView2, start menu entry, uninstall via Windows settings)
or the portable `TheCompletionist.exe` (no installation).

> Deutsch: Overlay für Aion 2 – Seelen-Pets, Farmspots, Hidden-Cube-Fundorte, Erfolge, Daily/Weekly-Checkliste pro
> Charakter, Feld- und Abyss-Bosse, Event-Kalender mit Ansagen. Den Fortschritt trägst du selbst ein; die App liest
> nichts aus dem Spiel. Download: siehe Releases.

## Features

- **Overview** – what's next (bosses, rifts, events), what's still open today, where to farm, achievements that are almost done, and "do now" warnings.
- **Soul pets** – which pets you still need on the current map and from which mobs. Count souls with **+** on a tile, set level and souls with **Lv**. Select several pets and let the app find the best spot for exactly those.
- **Farm spots** – spawn clusters ranked by the souls *you* still need (explained in the app).
- **Map** – spawns of the mobs you need, farm spots, possible Hidden Cube spots, area names. Map style: a coloured map rendered from aion2maps' voxel blocks (one-time download per map) or a plain hill-shaded relief.
- **Achievements** – all account achievements sorted from easy to hard; tap one to set its counter or tick tiers.
- **Checklist** – dailies and weeklies per character and per server (characters: Checklist → **+ Character**); charges (Odyle energy, Nightmare attempts, Shugo and Invasion keys) projected from your last entry, with a traffic light before they overflow.
- **Character lookup** via NCSOFT's public character search on plaync.com – optional, website data only (level, class, CP, portrait, titles; **Search** when adding a character, region EU/NA in the settings).
- **Bosses** – field bosses with a respawn estimate from your **killed** tap, Abyss bosses from the schedule.
- **Timers** – calendar of world bosses, rifts and events with announcer window, chimes and text-to-speech ("Gartua spawns in 5 minutes").

## Requirements

- Windows 10/11 (64-bit)
- Microsoft Edge WebView2 Runtime (included in Windows 11 and current Windows 10)
- Internet on the first start (game data from aion2maps.com); afterwards it works offline

Settings and progress are stored in `%LOCALAPPDATA%\TheCompletionist`.

## Is it safe?

The app does **not** read, intercept or analyse any game traffic, and it does **not** read or modify game memory,
inject anything or send input to the game. It only shows what you enter yourself, plus public data from
[aion2maps.com](https://aion2maps.com/) (maps, spawns, pets, timers) and [aion2.app](https://aion2.app/) (achievement
definitions), and – only if you use **Search** – NCSOFT's public character search website on plaync.com. The only thing it looks at is the position of the game's window, to decide whether to show itself as an
overlay or as a normal window. All code is in this repository – you can read it and build the exe yourself.

Versions before 2.0 could read the game's network packets to track progress automatically. Because NCSOFT prohibits
software that intercepts or analyses game traffic, that feature was removed completely in 2.0 and the older versions
were withdrawn. Please update to 2.0 or later.

## Hotkeys (configurable)

| Hotkey | Action |
|---|---|
| Ctrl+Alt+M | Show / hide |
| Ctrl+Alt+C | Click-through on / off |
| Ctrl+Alt+W | aion2maps view |
| Ctrl+Alt+PageUp / PageDown | Opacity (also mouse wheel over the header) |
| Ctrl+Alt+Plus / Minus | Scale |

## Building

Requires the .NET 8 SDK and Node.js.

```
cd web
npm install
cd ..
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish
```

The build compiles the UI (`web/`, React + Tailwind + shadcn) into `ui/` and embeds it into the exe.
Tests: `cd web && npm test` (unit) and `npm run test:e2e` (Playwright with a mocked host).

Layout: C# host (`OverlayForm.cs` window and WebView2, `PetState.cs` progress store, `GameData.cs` data cache),
UI in `web/src` (features per tab), `tools/fetch_achievements.py` downloads the public achievement definitions.

## Credits

Map (terrain voxels), mob, pet, cube, portrait and timer data: **[aion2maps.com](https://aion2maps.com/)** – thank you!
Achievement data: [aion2.app](https://aion2.app/). Icons: [Lucide](https://lucide.dev/) (ISC).

This is a fan project and not affiliated with NCSOFT. Aion is a trademark of NCSOFT Corporation.

## License

[MIT](LICENSE) for the code in this repository. Game data loaded from third-party sites remains subject to their terms.
