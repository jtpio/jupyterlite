// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { NbConvertManager } from '@jupyterlab/services';

/**
 * Custom nbconvert manager for JupyterLite
 */
export class LocalNbConvertManager extends NbConvertManager {
  /**
   * Override the default export formats.
   */
  async getExportFormats(force?: boolean): Promise<NbConvertManager.IExportFormats> {
    return {};
  }
}
