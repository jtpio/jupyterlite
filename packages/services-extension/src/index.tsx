// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PageConfig } from '@jupyterlab/coreutils';

import {
  IServerSettings,
  ServerConnection,
  ServiceManagerPlugin,
} from '@jupyterlab/services';

import { ILocalForage, ensureMemoryStorage } from '@jupyterlite/localforage';

import localforage from 'localforage';

import { WebSocket } from 'mock-socket';

/**
 * The localforage plugin
 */
const localforagePlugin: ServiceManagerPlugin<ILocalForage> = {
  id: '@jupyterlite/server-extension:localforage',
  autoStart: true,
  provides: ILocalForage,
  activate: (_: null) => {
    return { localforage };
  },
};

/**
 * The volatile localforage memory plugin
 */
const localforageMemoryPlugin: JupyterLiteServerPlugin<void> = {
  id: '@jupyterlite/server-extension:localforage-memory-storage',
  autoStart: true,
  requires: [ILocalForage],
  activate: async (_: null, forage: ILocalForage) => {
    if (JSON.parse(PageConfig.getOption('enableMemoryStorage') || 'false')) {
      console.warn(
        'Memory storage fallback enabled: contents and settings may not be saved',
      );
      await ensureMemoryStorage(forage.localforage);
    }
  },
};


/**
 * The default server settings plugin.
 */
const serverSettingsPlugin: ServiceManagerPlugin<ServerConnection.ISettings> = {
  id: '@jupyterlab/services-extension:server-settings',
  description: 'The default server settings plugin.',
  autoStart: true,
  provides: IServerSettings,
  activate: (_: null): ServerConnection.ISettings => {
    return {
      ...ServerConnection.makeSettings(),
      WebSocket,
      fetch: this.fetch.bind(this) ?? undefined,
    };
  },
};

export default [localforagePlugin, localforageMemoryPlugin, serverSettingsPlugin];
