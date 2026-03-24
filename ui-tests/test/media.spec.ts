// Copyright (c) JupyterLite Contributors
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';

import { promises as fs } from 'fs';

import { test as base } from '@jupyterlab/galata';

import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const NETWORK_NO_SOURCE = 3;

interface IMediaFixtureDefinition {
  blobSha: string;
  mediaSelector: 'audio' | 'video';
  mimeType: string;
  name: string;
}

interface IMediaFixture extends IMediaFixtureDefinition {
  content: string;
}

interface IMediaFixtures {
  [name: string]: IMediaFixture;
}

interface IMediaState {
  currentSrc: string;
  errorMessage: string | null;
  networkState: number;
  readyState: number;
  src: string;
}

interface IJupyterLiteAppWindow {
  jupyterapp?: {
    serviceManager: {
      contents: {
        save: (
          path: string,
          options: {
            content: string;
            format: 'base64';
            mimetype: string;
            type: 'file';
          },
        ) => Promise<unknown>;
      };
    };
  };
}

const MEDIA_FIXTURES: IMediaFixtureDefinition[] = [
  {
    name: 'rocket.wav',
    mimeType: 'audio/wav',
    mediaSelector: 'audio',
    blobSha: '8b8f6352bb0db373eb2168bbf6732a3b14d419f4',
  },
  {
    name: 'jupiter.mp4',
    mimeType: 'video/mp4',
    mediaSelector: 'video',
    blobSha: 'f6ff5912b4d581aaa96acf65150a7acbfb3986e8',
  },
];

const test = base.extend<{}, { mediaFixtures: IMediaFixtures }>({
  waitForApplication: async (
    { baseURL: _baseURL }: { baseURL?: string },
    use: (waitIsReady: (page: Page) => Promise<void>) => Promise<void>,
  ): Promise<void> => {
    await use(async (page: Page) => {
      await page.waitForSelector('.jp-LauncherCard');
    });
  },
  mediaFixtures: [
    async ({ browserName: _browserName }, use): Promise<void> => {
      const fixtures = Object.fromEntries(
        await Promise.all(
          MEDIA_FIXTURES.map(async (fixture): Promise<[string, IMediaFixture]> => {
            const cachedPath = path.resolve(
              __dirname,
              '../.cache/media',
              `${fixture.blobSha}-${fixture.name}`,
            );

            let content: string;
            try {
              content = (await fs.readFile(cachedPath)).toString('base64');
            } catch {
              throw new Error(
                `Missing cached media fixture at ${cachedPath}. Run \`jlpm build\` in ui-tests to download it.`,
              );
            }

            return [fixture.name, { ...fixture, content }];
          }),
        ),
      );

      await use(fixtures);
    },
    { scope: 'worker' },
  ],
});

async function saveMediaFixture(
  page: IJupyterLabPageFixture,
  fixture: IMediaFixture,
): Promise<void> {
  await page.evaluate(async (uploadedFile: IMediaFixture) => {
    const app = (window as unknown as IJupyterLiteAppWindow).jupyterapp;

    if (!app) {
      throw new Error('window.jupyterapp is not available');
    }

    await app.serviceManager.contents.save(uploadedFile.name, {
      type: 'file',
      format: 'base64',
      mimetype: uploadedFile.mimeType,
      content: uploadedFile.content,
    });
  }, fixture);

  try {
    await page.filebrowser.refresh();
  } catch {
    // No-op for JupyterLite where the refresh helper may race the API wait.
  }
}

async function getMediaState(locator: Locator): Promise<IMediaState> {
  return locator.evaluate(async (element) => {
    const media = element as HTMLMediaElement;

    media.load();

    await Promise.race([
      new Promise<void>((resolve) => {
        media.addEventListener('loadedmetadata', () => resolve(), { once: true });
      }),
      new Promise<void>((resolve) => {
        media.addEventListener('error', () => resolve(), { once: true });
      }),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1000);
      }),
    ]);

    return {
      currentSrc: media.currentSrc,
      errorMessage: media.error?.message ?? null,
      networkState: media.networkState,
      readyState: media.readyState,
      src: media.getAttribute('src') ?? '',
    };
  });
}

test.describe('Media Documents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('lab/index.html');
  });

  for (const fixture of MEDIA_FIXTURES) {
    test(`Open ${fixture.name}`, async ({ page, mediaFixtures }) => {
      test.fail(
        true,
        'Issue #1899: the media viewer opens without assigning a playable source in the current JupyterLite build.',
      );

      const mediaFixture = mediaFixtures[fixture.name];

      await saveMediaFixture(page, mediaFixture);

      expect(await page.filebrowser.open(fixture.name)).toBe(true);

      const media = page.getByRole('main').locator(fixture.mediaSelector).first();

      await expect(media).toBeVisible();
      await expect(
        page
          .getByRole('main')
          .getByRole('tab', { name: new RegExp(`^${fixture.name}`) })
          .last(),
      ).toBeVisible();

      const mediaState = await getMediaState(media);

      expect(mediaState.currentSrc || mediaState.src).not.toBe('');
      expect(mediaState.errorMessage).toBeNull();
      expect(mediaState.networkState).toBeLessThan(NETWORK_NO_SOURCE);
      expect(mediaState.readyState).toBeGreaterThanOrEqual(0);
    });
  }
});
