// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { NbConvertManager } from '@jupyterlab/services';

/**
 * Custom nbconvert manager for JupyterLite
 */
export class JupyterLiteNbConvertManager extends NbConvertManager {
  async getExportFormats(force?: boolean): Promise<NbConvertManager.IExportFormats> {
    return {};
  }
}
