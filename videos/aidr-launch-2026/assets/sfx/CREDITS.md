# SFX Credits

All sound effects in this directory are sourced from [Pixabay](https://pixabay.com/sound-effects/) and used under the [Pixabay Content License](https://pixabay.com/service/license-summary/).

The Pixabay license allows free use for commercial and non-commercial purposes without attribution, but attribution is appreciated and given here for transparency.

## Files

The following `.mp3` files are bundled with this skill:

- `chime.mp3`
- `click.mp3` / `click-soft.mp3`
- `error.mp3`
- `glitch-1.mp3` / `glitch-2.mp3` / `glitch-3.mp3`
- `impact-bass-1.mp3` / `impact-bass-2.mp3`
- `key-press.mp3`
- `notification.mp3`
- `ping.mp3`
- `pop.mp3`
- `riser.mp3`
- `sparkle.mp3`
- `typing.mp3`
- `whoosh.mp3` / `whoosh-short.mp3` / `whoosh-cinematic.mp3`

See `manifest.json` for per-file metadata (duration, energy character, recommended use).

## License

All files are distributed under the [Pixabay Content License](https://pixabay.com/service/license-summary/), which permits:

- Commercial and non-commercial use
- Modification and remixing
- Redistribution as part of derivative works (such as videos rendered with HyperFrames)

without any attribution requirement.

## Trimmed copies

`whoosh-cinematic.mp3` here is not byte-identical to the media-use library file of the same name (different md5). It is a 1.03 s excerpt of it, checked by cross-correlating the decoded audio of both files:

| | Library copy | This directory |
|---|---|---|
| Duration | 5.544 s | 1.032 s |
| Bit rate | 256 kbps | 128 kbps |
| Peak | 2.50 s | 0.30 s |

- The excerpt starts 2.2 s into the library file. The two peaks differ by exactly that offset.
- Over 0.1 s to 0.8 s of the excerpt the waveform matches the library segment with correlation 0.99 or higher.
- The first 0.1 s and the last 0.3 s are quieter than the source (gain 0.69 at the start, falling to 0.29 by 0.8 s), which fits a short fade at each end. Mid-clip gain is 0.95, which fits re-encoding at the lower bit rate.
- Same Pixabay Content License as the library copy.
