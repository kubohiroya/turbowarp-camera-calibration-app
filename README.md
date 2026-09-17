# TurboWarp Camera Calibration App

**English** | [日本語](README.ja.md)

An app that shows a ChArUco board and calibrates a camera against it, producing a lens calibration profile you can carry away as a QR code or a file.

## What's included

- **Page**: three boards to display -- 10x7, 8x6 and 6x5 squares (9x6, 7x5 and 5x4 inner corners). Full screen in place, in a second window for a second screen, saved as SVG, or printed at A4. Scaling is uniform and the remainder is letterboxed. The nominal size of one printed square is shown.
- **SB3**: a title screen that asks what this device is for, a full-stage board display, and an automatic calibration that needs no buttons, ending in a profile shown as a QR code and held in a list you can export.
- Builds for the SB3 and the distribution page, SHA-256 and size recording, and CI.

The boards are drawn by the camera-calibration extension (`@kubohiroya/turbowarp-camera-calibration/runtime`), not by this app. The board on the screen or the paper and the board the detector looks for come from the same numbers, so they cannot drift apart. [`src/board.ts`](src/board.ts) lists what the app takes from the extension.

The small patterns inside the light squares are ArUco markers, and each one names the corners around it. A board that runs off the edge of the frame therefore still contributes the corners it does show. A plain chessboard contributes nothing unless it is seen whole, because nothing in it says which corner is which -- and **the views where the board reaches the frame edge are the ones that decide the principal point and the distortion**, so this is not a small difference.

## Using the SB3

The calibration path is behind the `captureAndSolveV1` flag, which is OFF by default; see [Layout and development](#layout-and-development). With it ON:

### Title screen

TurboWarp asks once to run the extensions: Camera Source, Camera Calibration and QR Display are bundled into one, so there is no way to allow one and refuse another and be left with a project that silently does nothing.

The green flag opens a title screen with two rows of buttons. The numbers are squares across by down, which is what a person holding the board can count.

| Button                                                            | This device becomes                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `10x7` / `8x6` / `6x5`                                            | The side that **shows** the board. It fills the stage, undistorted, with nothing on top. Click to go back |
| **校正を始める** (start calibration) under `10x7` / `8x6` / `6x5` | The side that **calibrates**, looking for that board                                                      |

One device can do both in turn, or two devices can split the roles.

### During calibration

There is nothing to press. The green flag starts and the stop button stops; the shutter, the solve, and registering the result are all automatic.

- **One status line** says what to do next, naming the board: show the board, _this looks like another board_, hold steadier, change position or tilt, keep going, or move closer, further, tilt more, reach the edges.
- **A tilt guide** is drawn over the preview: the board as an outline with the near edge wider, and an arrow for the direction the kept views reach least. It has no grid in it, because a grid drawn over the camera image is exactly what the detector would find. It is hidden while the extension is solving.
- **Sounds**, for someone holding a board at arm's length and not looking at the screen:
  - a chord for each of the 16 progress steps, with a leading note saying which of the four gates it belongs to, and a fanfare when done;
  - a cue when the tilt direction changes: timbre for the axis (front-back or left-right), rising for near and falling for far;
  - clicks whose rate, from 2 to 20 a second, follows how much new tilt the current view would add. Sliding the board sideways does not speed them up.

The session finishes when the error on views held back from the fit is within 1.5 px. If the camera's size, zoom, focus, or the camera itself changes before then, it ends in an error instead: "solved" means the profile fits this camera.

### When it is solved

- The preview is hidden and the shared camera stops.
- The profile is registered with Camera Source, where other extensions in the same runtime read it.
- The profile JSON is put in the `profile` list and drawn as a **QR code** (error correction L, about 700 bytes) on the right of the stage. Point a phone at it to carry the profile to the next device.
- To save it as a file, right-click the `profile` list and choose **export**. A block cannot do this: blocks run on a timer, and the browser does not treat that as the person asking.
- A **Back** button appears (after success or failure only). It stops the camera, clears the session, and returns to the title screen.

### Loading a saved profile

Right-click the `profile` list, choose **import**, pick the file, and press `i`. The app wakes the camera and asks Camera Source whether the profile fits it:

| Answer         | Shown as                                                                        |
| -------------- | ------------------------------------------------------------------------------- |
| `compatible`   | Usable with this camera                                                         |
| `incompatible` | Does not match (capture conditions differ from calibration)                     |
| `undetermined` | Cannot be confirmed -- and the profile is not applied. This is not a softer yes |

A loaded profile is not drawn as a QR code.

### Calibrating with it

- **Intrinsic calibration needs no real-world dimensions.** The physical size of a square affects none of fx, fy, cx, cy, or the distortion coefficients; it scales the extrinsic pose only. Real dimensions start to matter in `turbowarp-time-space-sync`'s placement calibration, not here.
- **Tilt the board.** Fronto-parallel samples alone leave focal length and distance inseparable and the solve degenerate. Sliding the board sideways without tilting it is not enough; follow the tilt guide.
- **How the board is presented decides whether the target is a regular grid at all.** Print at a uniform scale; show it on a display set to 1:1, since televisions apply overscan by default; keep a tablet flat, unrotated and matte. A projector is not recommended: keystone, an off-axis placement, or the projector's own lens distortion all bias the result, and none of them raise the reprojection error.
- Angle and distance are hard to vary once a camera is mounted on a fixed rig, so calibrate before mounting -- and afterwards only a printed board will do, since a displayed board cannot be moved.

## Modes

- **Display pattern**: shows the board full screen on this page, in a second window, or printed, to be photographed by the calibrating camera.
- **Capture and calibrate**: download the SB3, open it in TurboWarp, and calibrate against the displayed or printed board.

## Dependencies and responsibilities

With `captureAndSolveV1` ON, the SB3 embeds these extensions at exact versions, with integrity, in a fixed order:

| Extension                                  | Version | Role                                                                                     |
| ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------- |
| `@kubohiroya/turbowarp-camera-source`      | 0.9.1   | Camera acquisition, lease, preview, capture conditions, and the profile contract and fit |
| `@kubohiroya/turbowarp-camera-calibration` | 0.13.0  | Board drawing and detection, automatic capture and guidance, solve on a Worker (OpenCV)  |
| `@kubohiroya/turbowarp-qr-display`         | 0.1.0   | Drawing the profile as a QR code                                                         |

The page uses `@kubohiroya/turbowarp-app-shell` 0.2.0 and the board helpers from camera-calibration. The app does not reimplement any of the extensions' algorithms.

The consumers of the profile -- time-space-sync-app, realtime-motion-capture-app and photogrammetry-app -- are meant to receive it as a file or a QR code. None of them reads it yet.

## Layout and development

Node.js >=22.18.0, pnpm 11.11.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

- `config/app.json`: name, modes, description, and planned work.
- `config/feature-flags.ts`: feature flags, fixed at startup. `patternDisplayV1` is ON; `captureAndSolveV1` is OFF.
- `scripts/project.ts`: the source of truth for the SB3.
- `scripts/extensions.ts`: which extensions are embedded, at which versions.
- `apps/main/source`: the generated unpacked SB3 sources.
- `src`: the distribution page built on the shared shell.
- `public/downloads`: the generated SB3 and release.json.
- `dist`: build output for the distribution page and downloads.

With `captureAndSolveV1` OFF, the SB3 embeds no extension and is a few kilobytes; its green flag explains that calibration is not in this build and asks for no camera. To build the calibrating SB3, set the flag to `true`, then:

```bash
pnpm source:update
pnpm check
```

After changing `project.ts`, the title, or a flag, run `pnpm source:update` to regenerate the sources. `source:check` (part of `pnpm check`) refuses a flag that was changed without regenerating, so the page and the SB3 cannot disagree. Generated SB3 files and `dist` are not tracked by Git. Archives are produced with sb3-toolchain.

## Status

Implemented: board display, save and print on the page; the title screen and full-stage board; one-permission bundle; automatic capture with the status line, tilt guide and sounds; hold-out completion; capture-condition checking; registration with Camera Source; the QR code and list export; import with the three-way fit.

Not yet:

- The fit and hold-out errors and sample counts are not shown on screen. The extension reports them; finishing means the hold-out error was within the limit.
- The consuming apps cannot read a profile yet.
- Calibration has been checked in TurboWarp with a simulated camera (headless Chromium), including reading the QR code back with jsQR. It has not been verified on real hardware.

Progress is tracked in [Issue #1](https://github.com/kubohiroya/turbowarp-camera-calibration-app/issues/1).

## Rollback

The calibration path is stopped by turning `captureAndSolveV1` OFF in `config/feature-flags.ts` and regenerating. The page's board display does not depend on it.

## Origin

The shared structure is extracted from the kamishibai (picture-story) app and realtime-motion-capture-app. See the [extraction notes](docs/extraction.md) (Japanese) for details.

## License

MPL-2.0. The package is private.
