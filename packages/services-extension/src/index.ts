// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PageConfig } from '@jupyterlab/coreutils';

import {
  Contents,
  IContentsManager,
  IDefaultDrive,
  IKernelSpecManager,
  INbConvertManager,
  IServerSettings,
  KernelSpec,
  NbConvert,
  ServerConnection,
  ServiceManagerPlugin,
} from '@jupyterlab/services';

import { Contents as JupyterLiteContents } from '@jupyterlite/contents';

import { KernelSpecs } from '@jupyterlite/kernel';

import { ILocalForage, ensureMemoryStorage } from '@jupyterlite/localforage';

import localforage from 'localforage';

import { WebSocket } from 'mock-socket';

import { JupyterLiteNbConvertManager } from './nbconvert';

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
const localforageMemoryPlugin: ServiceManagerPlugin<void> = {
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
 * The contents manager plugin.
 */
const contentsManagerPlugin: ServiceManagerPlugin<Contents.IManager> = {
  id: '@jupyterlab/services-extension:contents-manager',
  description: 'The default contents manager plugin.',
  autoStart: true,
  provides: IContentsManager,
  requires: [IDefaultDrive, ILocalForage, IServerSettings],
  activate: (
    _: null,
    defaultDrive: Contents.IDrive,
    serverSettings: ServerConnection.ISettings,
    forage: ILocalForage,
  ): Contents.IManager => {
    const storageName = PageConfig.getOption('contentsStorageName');
    const storageDrivers = JSON.parse(
      PageConfig.getOption('contentsStorageDrivers') || 'null',
    );
    const { localforage } = forage;
    const contents = new JupyterLiteContents({
      defaultDrive,
      serverSettings,
      storageName,
      storageDrivers,
      localforage,
    });
    return contents;
  },
};

/**
 * The kernel spec manager plugin.
 */
const kernelSpecManagerPlugin: ServiceManagerPlugin<KernelSpec.IManager> = {
  id: '@jupyterlab/services-extension:kernel-spec-manager',
  description: 'The kernel spec manager plugin.',
  autoStart: true,
  provides: IKernelSpecManager,
  optional: [IServerSettings],
  activate: (
    _: null,
    serverSettings: ServerConnection.ISettings | undefined,
  ): KernelSpec.IManager => {
    return new KernelSpecs({ serverSettings });
  },
};

/**
 * The nbconvert manager plugin.
 */
const nbConvertManagerPlugin: ServiceManagerPlugin<NbConvert.IManager> = {
  id: '@jupyterlab/services-extension:nbconvert-manager',
  description: 'The nbconvert manager plugin.',
  autoStart: true,
  provides: INbConvertManager,
  optional: [IServerSettings],
  activate: (
    _: null,
    serverSettings: ServerConnection.ISettings | undefined,
  ): NbConvert.IManager => {
    const nbConvertManager = new JupyterLiteNbConvertManager({ serverSettings });
    return nbConvertManager;
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
      fetch: () => {
        throw new Error('TODO fetch');
      },
    };
  },
};

export default [
  contentsManagerPlugin,
  kernelSpecManagerPlugin,
  localforagePlugin,
  localforageMemoryPlugin,
  nbConvertManagerPlugin,
  serverSettingsPlugin,
];
