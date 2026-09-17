# TurboWarp Camera Calibration App

**English** | [日本語](README.ja.md)

An app that both displays and photographs a checkerboard pattern, producing and exporting a camera lens calibration profile.

## What's included

Pattern display and capture. Profile export is not implemented yet.

**The ChArUco board is drawn by the page, not by the SB3.** It needs no camera, no extension and no Scratch, and a page can do what the plan asks of it: print, save a file, report the rendered square size, and never stretch. A fixed-size Scratch stage can do none of those. It also means the capture project contains no ChArUco board artwork at all -- nothing it draws can be mistaken for the target.

- **Page**: three boards to display -- 10x7, 8x6 and 6x5 squares. Full screen in place, in a second window for a second screen, saved as SVG, or printed. Scaling is uniform and the remainder is letterboxed.
- **SB3**: the capture side. One camera, one session; the extensions are embedded at exact pinned versions.
- Builds for the SB3 and the distribution page, SHA-256 and size recording, and CI.

The small patterns inside the light squares are ArUco markers, and each one names the corners around it. A board that runs off the edge of the frame therefore still contributes the corners it does show. A plain chessboard contributes nothing unless it is seen whole, because nothing in it says which corner is which -- and **the views where the board reaches the frame edge are the ones that decide the principal point and the distortion**, so this is not a small difference.

### Using the SB3

| Action                                | What happens                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Green flag                            | Opens the first screen, where you choose to show a board on this machine or to calibrate a camera                                                          |
| 10x7 / 8x6 / 6x5 under "ボードを表示" | Shows that board here. The numbers are squares across by down. Click the stage to return to the first screen                                               |
| 10x7 / 8x6 / 6x5 under "校正を始める" | Choose the board you are holding: the camera starts and calibration begins                                                                                 |
| While capturing                       | Nothing to press. Tilt the board as the picture and sounds ask; capture, solve and registration with Camera Source happen by themselves                    |
| Once calibrated                       | Read the QR code with another device, or right-click the item in the profile list and choose "書き出し" to save a file. "戻る" returns to the first screen |
| `i`                                   | Applies a profile loaded into the profile list with "読み込み", and shows whether it fits this camera                                                      |
| Stop sign                             | Stops calibrating and hands the camera back                                                                                                                |

Boards are named by their squares. The calibration block is given inner corners, one fewer in each direction: a 10x7 board has 9x6 inner corners.

### Calibrating with it

- **Intrinsic calibration needs no real-world dimensions.** The physical size of a square affects none of fx, fy, cx, cy, or the distortion coefficients; it scales the extrinsic pose only. Real dimensions start to matter in `turbowarp-time-space-sync`'s placement calibration, not here.
- **Tilt the board.** Fronto-parallel samples alone leave focal length and distance inseparable and the solve degenerate. Sliding the board sideways without tilting it is not enough, and the sample-novelty check does not catch that.
- **How the pattern is presented decides whether the target is a regular grid at all.** Print at a uniform scale; show it on a display set to 1:1, since televisions apply overscan by default; keep a tablet flat, unrotated and matte. A projector is not recommended: keystone, an off-axis placement, or the projector's own lens distortion all bias the result, and none of them raise the reprojection error.
- Angle and distance are hard to vary once a camera is mounted on a fixed rig, so calibrate before mounting -- and afterwards only a printed board will do, since a displayed pattern cannot be moved.

## Planned

- Call the calibration blocks of the camera-calibration extension, guiding start, sample capture, solve, cancel, and cleanup.
- Prompt for shots from varying angles and distances, and show the pose spread and quality of the samples. Do not treat a burst from a single fixed viewpoint as complete.
- Display the checkerboard full screen, and record the cell dimensions and display conditions. Explain that real-world dimensions are not needed for intrinsic calibration and only matter for placement calibration.
- Show reprojection error and quality, and validate against images not used in the calibration.
- Export the intrinsic calibration profile as JSON and hand it to consuming apps as a file. Also support loading an existing profile and checking that it matches the capture conditions.

## Modes

- **Display pattern**: Shows the checkerboard full screen, to be photographed from another PC or camera.
- **Capture and calibrate**: Photographs the displayed or printed pattern with the camera and solves the lens calibration.

## Dependencies and responsibilities

- camera-source: camera acquisition, lease, and capture conditions, plus the contract for the intrinsic calibration profile.
- camera-calibration: ChArUco board extraction and solve. Includes OpenCV.
- time-space-sync-app / realtime-motion-capture-app / photogrammetry-app: the consumers of the profile. They receive it as a file.

The only actual dependency is turbowarp-app-shell 0.2.0 in package.json. The use-case-specific connections above are planned, and do not rely on any unreleased early extension. When one is added, its exact version, artifact hash, API manifest, and evaluation order will be pinned.

## Layout and development

Node.js >=22.18.0, pnpm 11.11.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

- `config/app.json`: name, modes, description, and planned work.
- `config/feature-flags.ts`: experimental feature flags, fixed at startup and OFF by default.
- `scripts/project.ts`: the source of truth for the startup-check SB3.
- `apps/main/source`: the generated unpacked SB3 sources.
- `src`: the distribution page built on the shared shell.
- `public/downloads`: the generated SB3 and release.json.
- `dist`: build output for the distribution page and downloads.

After changing `project.ts` or the title, run `pnpm source:update` to regenerate the sources. Generated SB3 files and `dist` are not tracked by Git. Archives are produced with sb3-toolchain.

## Staged rollout and acceptance criteria

1. In the related GitHub Issue, settle what to extract from the existing implementation, its dependencies, the DoD, and the rollback path.
2. Add the use-case-specific path behind a flag that is OFF by default, and replace the existing path with delegation.
3. Record error, latency, stalls, and recovery in hardware integration testing.
4. Do not reimplement the core extension's algorithms inside the app.

The DoD for the initial scaffold is: `pnpm check` passes, the SB3 updates its state on the green flag, and the distribution page shows the description, mode selection, and SB3 download. Real-device verification of camera-based features has not been performed.

## Rollback and task management

New paths are stopped by turning their flag OFF in `config/feature-flags.ts`, and compatibility reads for the old app path are kept during migration. Turning the initial flags ON does not implement any use-case-specific feature.

GitHub Issues are the source of truth for progress, recording start/done/blocked. This README is a local draft; nothing has been posted to Issues, pushed, or published.

## Origin

The shared structure is extracted from the kamishibai (picture-story) app and realtime-motion-capture-app. See the [extraction notes](docs/extraction.md) (Japanese) for details.

## License

MPL-2.0. The package is private in its initial state.
