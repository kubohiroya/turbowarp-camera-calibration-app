# TurboWarp Camera Calibration App

**English** | [日本語](README.ja.md)

An app that both displays and photographs a checkerboard pattern, producing and exporting a camera lens calibration profile.

## What's included

This is the initial scaffold generated from turbowarp-app-template. Use-case-specific features are not implemented.

- Mode selection, guidance, and error display built on the shared app-shell.
- Unpacked SB3 sources plus a startup-check script that updates a state variable when the green flag is clicked.
- Builds for the SB3 and the distribution page, SHA-256 recording, and CI.

The distribution page does not embed the TurboWarp player; it offers the startup-check SB3 for download. Run `build:sb3` before downloading from the dev server.

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
- camera-calibration: chessboard extraction and solve. Includes OpenCV.
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
