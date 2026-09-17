# TurboWarp Camera Calibration App

**English** | [日本語](README.ja.md)

An app that both displays and photographs a ChArUco board, producing a camera lens calibration profile and handing it over as a QR code or a file.

## What's included

Board display, automatic capture and solve, and handing the profile over.

- **Page**: three boards to display -- 10x7, 8x6 and 6x5 squares. Full screen in place, in a second window for a second screen, saved as SVG, or printed. Scaling is uniform and the remainder is letterboxed. A page can print, save a file, report the rendered square size and never stretch, which a fixed-size Scratch stage cannot.
- **SB3**: a first screen that shows a board on this machine or starts a calibration against the board in hand. Capture, solve and registration with Camera Source are automatic, guided by a tilt picture and sounds. Once solved, the camera is turned off and the profile is shown as a QR code and put in a list that can be exported to a file. It is also saved to this browser's storage (IndexedDB), so a camera app running on the same origin (such as the camera app of realtime-motion-capture-app) can use it without carrying a file. That storage is a cache; a QR code or a file is how the profile leaves the PC. A profile read back from a file can be checked against this camera. When the page URL carries `cameraDeviceId`, `cameraWidth`, `cameraHeight` and `cameraFrameRate` (an app with several USB cameras opens this one for one of them that way), that camera is used at that size instead of the browser's choice, and the device is recorded in the profile.
- **Extensions**: camera-source, camera-calibration and qr-display, embedded at exact pinned versions and allowed with one permission. The boards are drawn by camera-calibration, the same code that detects them.
- Builds for the SB3 and the distribution page, SHA-256 and size recording, and CI.

A session whose camera settings change before the solve ends in an error rather than solved, so a solved profile always fits the camera it was made with.

The small patterns inside the light squares are ArUco markers, and each one names the corners around it. A board that runs off the edge of the frame therefore still contributes the corners it does show. A plain chessboard contributes nothing unless it is seen whole, because nothing in it says which corner is which -- and **the views where the board reaches the frame edge are the ones that decide the principal point and the distortion**, so this is not a small difference.

### The exported file

The profile is written as a ROS `camera_info` YAML document, the format ROS's `camera_calibration_parsers` reads and writes and that ROS, OpenCV-based and SLAM tools load as it is. What ROS has no place for -- when it was calibrated, the capture settings, the quality -- travels under `turbowarp_camera_source`, which ROS's reader ignores.

- **Export**: right-click an item in the profile list and choose export. The list holds one line per item, so the file is the YAML document. TurboWarp saves it as `profile.txt`; rename it to `.yaml` for ROS tools.
- **QR code**: the same YAML, about 900 bytes.
- **Import**: right-click the profile list, choose import, pick the file, and press `i`. The import dialog only offers `.txt`, `.csv` and `.tsv`, so rename a `.yaml` file back to `.txt`.
- **Receiving apps** register the file under their own camera name with Camera Source's `register camera profile as`. [`tests/profile-contract.test.ts`](tests/profile-contract.test.ts) checks the format with the installed Camera Source's writer, reader and compatibility rule.

### Using the SB3

| Action                                | What happens                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Green flag                            | Opens the first screen, where you choose to show a board on this machine or to calibrate a camera                                                                    |
| 10x7 / 8x6 / 6x5 under "ボードを表示" | Shows that board here. The numbers are squares across by down. Click the stage to return to the first screen                                                         |
| 10x7 / 8x6 / 6x5 under "校正を始める" | Choose the board you are holding: the camera starts and calibration begins                                                                                           |
| While capturing                       | Nothing to press. Tilt the board as the picture and sounds ask; capture, solve and registration with Camera Source happen by themselves                              |
| Once calibrated                       | Read the QR code with another device, or right-click the item in the profile list and choose "書き出し" to save a file. "戻る" returns to the first screen           |
| "読み込む" under "プロファイルを使う" | Uses a saved profile without calibrating. Right-click the profile list, choose "読み込み" to pick the file, then press "適用する" to see whether it fits this camera |
| `i`                                   | Applies a profile loaded into the profile list, the same as "適用する". Also works on the solved screen                                                              |
| Stop sign                             | Stops calibrating and hands the camera back                                                                                                                          |

Boards are named by their squares. The calibration block is given inner corners, one fewer in each direction: a 10x7 board has 9x6 inner corners.

### Calibrating with it

- **Intrinsic calibration needs no real-world dimensions.** The physical size of a square affects none of fx, fy, cx, cy, or the distortion coefficients; it scales the extrinsic pose only. Real dimensions start to matter in `turbowarp-time-space-sync`'s placement calibration, not here.
- **Tilt the board.** Fronto-parallel samples alone leave focal length and distance inseparable and the solve degenerate. Sliding the board sideways without tilting it is not enough, and the sample-novelty check does not catch that.
- **How the pattern is presented decides whether the target is a regular grid at all.** Print at a uniform scale; show it on a display set to 1:1, since televisions apply overscan by default; keep a tablet flat, unrotated and matte. A projector is not recommended: keystone, an off-axis placement, or the projector's own lens distortion all bias the result, and none of them raise the reprojection error.
- Angle and distance are hard to vary once a camera is mounted on a fixed rig, so calibrate before mounting -- and afterwards only a printed board will do, since a displayed pattern cannot be moved.

## Remaining work

- Check on real hardware the solved screen (QR code, back button) and file export and import.
- Read the profile in consuming apps (time-space-sync-app, photogrammetry-app), from the QR code with turbowarp-jsqr or from a file. The realtime-motion-capture-app camera app already does.

## Modes

- **Show board**: Shows the ChArUco board full screen, to be photographed from another PC or camera. The SB3's first screen can show it too.
- **Capture and calibrate**: Photographs the displayed or printed board with the camera and solves the lens calibration.

## Dependencies and responsibilities

- camera-source: camera acquisition, lease, and capture conditions, plus the contract for the intrinsic calibration profile and the registry it is published to.
- camera-calibration: drawing and detecting the ChArUco board, the automatic shutter, and the solve. Includes OpenCV.
- qr-display: shows the solved profile as a QR code on a sprite.
- time-space-sync-app / realtime-motion-capture-app / photogrammetry-app: the consumers of the profile. They receive it as a QR code or a file.

The three extensions are pinned to exact versions in `package.json` and embedded with their integrity and API manifests; see `scripts/extensions.ts`.

## Layout and development

Node.js >=22.18.0, pnpm 11.11.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

- `config/app.json`: name, modes, description, and remaining work.
- `config/feature-flags.ts`: feature flags, fixed at startup. Capture and calibration (`captureAndSolveV1`) is on by default.
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

`pnpm check` covers the generated SB3 source, the project's scripts and layout, and the page build. Capture, solve and the tilt guidance have been checked on real hardware; the solved screen's QR code and back button have been checked in headless TurboWarp only.

## Rollback and task management

Calibration in the SB3 is behind `captureAndSolveV1` in `config/feature-flags.ts`, ON by default: the SB3 the page offers calibrates as it is (about 2.7 MB). To roll back, set it to `false` and run `pnpm source:update`; the SB3 then embeds no extensions, is a few kilobytes, and the page still shows the boards.

GitHub Issues and pull requests are the source of truth for progress.

## Origin

The shared structure is extracted from the kamishibai (picture-story) app and realtime-motion-capture-app. See the [extraction notes](docs/extraction.md) (Japanese) for details.

## License

MPL-2.0. The package is private and not published to npm.
