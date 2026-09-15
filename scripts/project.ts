// SPDX-License-Identifier: MPL-2.0
import { createHash } from 'node:crypto';
export const backdrop =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#152033"/></svg>\n';
export const assetId = createHash('md5').update(backdrop).digest('hex');
export function createProject(title: string) {
  return {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: { appStatus: ['app status', '初期雛形'] },
        lists: {},
        broadcasts: {},
        blocks: {
          start: {
            opcode: 'event_whenflagclicked',
            next: 'ready',
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true,
            x: 48,
            y: 48,
          },
          ready: {
            opcode: 'data_setvariableto',
            next: null,
            parent: 'start',
            inputs: {
              VALUE: [
                1,
                [
                  10,
                  `${title}: 初期雛形を起動しました。機能本体は未実装です。`,
                ],
              ],
            },
            fields: { VARIABLE: ['app status', 'appStatus'] },
            shadow: false,
            topLevel: false,
          },
        },
        comments: {},
        currentCostume: 0,
        costumes: [
          {
            assetId,
            name: 'background',
            bitmapResolution: 1,
            md5ext: `${assetId}.svg`,
            dataFormat: 'svg',
            rotationCenterX: 240,
            rotationCenterY: 180,
          },
        ],
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'off',
        textToSpeechLanguage: null,
      },
    ],
    monitors: [
      {
        id: 'appStatus',
        mode: 'default',
        opcode: 'data_variable',
        params: { VARIABLE: 'app status' },
        spriteName: null,
        value: '初期雛形',
        width: 0,
        height: 0,
        x: 10,
        y: 10,
        visible: true,
        sliderMin: 0,
        sliderMax: 100,
        isDiscrete: true,
      },
    ],
    extensions: [],
    meta: { semver: '3.0.0', vm: '11.3.0', agent: 'turbowarp-app-template' },
  };
}
