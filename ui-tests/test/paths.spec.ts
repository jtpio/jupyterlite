// Copyright (c) JupyterLite Contributors
// Distributed under the terms of the Modified BSD License.

import { expect, test } from '@playwright/test';

test.describe('Paths with a percent sign', () => {
  const FILE = '100% sure.txt';
  const CONTENT = 'Percent-encoded names work.';

  test('Open a deployment file from the editor page URL', async ({ page }) => {
    await page.goto(`edit/index.html?path=${encodeURIComponent(FILE)}`);

    await expect(page.locator('.jp-FileEditor .cm-content')).toContainText(CONTENT);
  });

  test('Open a deployment file from the lab URL', async ({ page }) => {
    await page.goto(`lab/index.html?path=${encodeURIComponent(FILE)}`);

    await expect(page.locator('.lm-TabBar-tabLabel', { hasText: FILE })).toBeVisible();
    await expect(page.locator('.jp-FileEditor .cm-content')).toContainText(CONTENT);
  });

  test('Save, rename and delete a browser file', async ({ page }) => {
    await page.goto('lab/index.html');
    await page.locator('.jp-Launcher').waitFor();

    const result = await page.evaluate(async () => {
      const { contents } = (window as any).galata.app.serviceManager;
      const exists = (path: string) =>
        contents
          .get(path, { content: false })
          .then(() => true)
          .catch(() => false);

      const saved = await contents.save('100%.txt', {
        type: 'file',
        format: 'text',
        content: 'saved',
      });
      const renamed = await contents.rename('100%.txt', 'a%20b.txt');
      const model = await contents.get('a%20b.txt', { content: true });
      const oldExists = await exists('100%.txt');
      await contents.delete('a%20b.txt');
      const newExists = await exists('a%20b.txt');

      return {
        saved: saved.path,
        renamed: renamed.path,
        content: model.content,
        oldExists,
        newExists,
      };
    });

    expect(result).toEqual({
      saved: '100%.txt',
      renamed: 'a%20b.txt',
      content: 'saved',
      oldExists: false,
      newExists: false,
    });
  });
});
