import { PathExt, URLExt } from '@jupyterlab/coreutils';

import type { Contents, Drive } from '@jupyterlab/services';
import { ContentProviderRegistry } from '@jupyterlab/services';

import type { Signal } from '@lumino/signaling';

import {
  BrowserStorageDrive as BaseBrowserStorageDrive,
  DRIVE_NAME,
} from 'jupyterlab-browser-storage';

import { FILE, MIME } from './tokens';

type IModel = Contents.IModel;
type IContentLayer = BrowserStorageDrive.TContentLayer;
type ILayeredModel = IModel & {
  [CONTENT_LAYER]: IContentLayer;
};

const encoder = new TextEncoder();

export { DRIVE_NAME };
export const CONTENT_LAYER = 'jupyterlite:content-layer' as const;

/**
 * A browser storage drive layered with JupyterLite server-side content indexes.
 */
export class BrowserStorageDrive extends BaseBrowserStorageDrive {
  constructor(options: BrowserStorageDrive.IOptions) {
    super(options);

    if (options.defaultContentProvider) {
      this.contentProviderRegistry = new ContentProviderRegistry({
        defaultProvider: options.defaultContentProvider,
      });
    } else {
      this.contentProviderRegistry = new ContentProviderRegistry();
    }
  }

  /**
   * Content provider registry.
   * @experimental
   */
  readonly contentProviderRegistry: ContentProviderRegistry;

  /**
   * Get a file or directory.
   */
  async get(path: string, options?: Contents.IFetchOptions): Promise<IModel> {
    const contentProvider = this.contentProviderRegistry.getProvider(
      options?.contentProviderId,
    );

    if (contentProvider) {
      return contentProvider.get(path, options);
    }

    // remove leading slash
    path = decodeURIComponent(path.replace(/^\//, ''));

    if (path === '') {
      const folder = await this._getLiteFolder(path);
      if (folder === null) {
        throw Error(`Could not find file with path ${path}`);
      }

      if (!options?.content) {
        return {
          size: 0,
          ...folder,
          content: null,
        };
      }
      return folder;
    }

    const localItem = (await super
      .get(path, options)
      .catch(() => null)) as IModel | null;
    const serverItem = await this._getLiteServerContents(path, options);
    const layer = this._getContentLayer(localItem, serverItem);

    const model = (localItem || serverItem) as IModel | null;

    if (!model) {
      throw Error(`Could not find content with path ${path}`);
    }

    if (!options?.content) {
      return this._setContentLayer(
        {
          size: 0,
          ...model,
          content: null,
        },
        layer,
      );
    }

    if (model.type === 'directory') {
      const localDirectory = (await super
        .get(path, { content: true })
        .catch(() => null)) as IModel | null;
      const localContents =
        localDirectory?.type === 'directory'
          ? ((localDirectory.content || []) as IModel[])
          : [];

      const serverContents: IModel[] =
        serverItem && serverItem.type === 'directory'
          ? ((serverItem.content || []) as IModel[])
          : Array.from((await this._getLiteServerDirectory(path)).values());

      return this._setContentLayer(
        {
          name: PathExt.basename(path),
          path,
          last_modified: model.last_modified,
          created: model.created,
          format: 'json',
          mimetype: MIME.JSON,
          content: this._mergeDirectoryContent(localContents, serverContents),
          size: 0,
          writable: true,
          type: 'directory',
        },
        layer,
      );
    }

    return this._setContentLayer(model, layer);
  }

  /**
   * Save a file.
   */
  async save(
    path: string,
    options: Partial<Contents.IModel> & Contents.IContentProvisionOptions = {},
  ): Promise<IModel> {
    const contentProvider = this.contentProviderRegistry.getProvider(
      options?.contentProviderId,
    );

    if (contentProvider) {
      const item = await contentProvider.save(path, options);
      this._emitFileChanged({
        type: 'save',
        oldValue: null,
        newValue: item,
      });
      return item;
    }

    return super.save(path, options);
  }

  /**
   * A reducer for turning arbitrary binary into a string.
   */
  protected reduceBytesToString = (data: string, byte: number): string => {
    return data + String.fromCharCode(byte);
  };

  private _emitFileChanged(args: Contents.IChangedArgs): void {
    (this.fileChanged as Signal<Contents.IDrive, Contents.IChangedArgs>).emit(args);
  }

  /**
   * Retrieve the contents for this path from the union of local storage and
   * `api/contents/{path}/all.json`.
   */
  private async _getLiteFolder(path: string): Promise<IModel | null> {
    const localRoot = (await super
      .get(path, { content: true })
      .catch(() => null)) as IModel | null;
    const localContents =
      localRoot?.type === 'directory' ? ((localRoot.content || []) as IModel[]) : [];
    const serverContents = Array.from(
      (await this._getLiteServerDirectory(path)).values(),
    );
    const content = this._mergeDirectoryContent(localContents, serverContents);

    if (path && content.length === 0) {
      return null;
    }

    return {
      name: '',
      path,
      last_modified: new Date(0).toISOString(),
      created: new Date(0).toISOString(),
      format: 'json',
      mimetype: MIME.JSON,
      content,
      size: 0,
      writable: true,
      type: 'directory',
    };
  }

  /**
   * Attempt to recover the model from `api/contents/{path}/all.json`, then
   * fall back to deriving the model off `/files/{path}`.
   */
  private async _getLiteServerContents(
    path: string,
    options?: Contents.IFetchOptions,
  ): Promise<IModel | null> {
    const name = PathExt.basename(path);
    const parentContents = await this._getLiteServerDirectory(URLExt.join(path, '..'));
    let model = parentContents.get(name);
    if (!model) {
      return null;
    }

    if (options?.content) {
      if (model.type === 'directory') {
        const serverContents = await this._getLiteServerDirectory(path);
        model = { ...model, content: Array.from(serverContents.values()) };
      } else {
        const fileUrl = URLExt.join(this.serverSettings.baseUrl, 'files', path);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          return null;
        }

        const mimetype = model.mimetype || response.headers.get('Content-Type') || '';
        const ext = PathExt.extname(name);

        if (
          model.type === 'notebook' ||
          FILE.hasFormat(ext, 'json') ||
          mimetype.indexOf('json') !== -1 ||
          path.match(/\.(ipynb|[^/]*json[^/]*)$/)
        ) {
          const contentText = await response.text();
          model = {
            ...model,
            content: JSON.parse(contentText),
            format: 'json',
            mimetype: model.mimetype || MIME.JSON,
            size: encoder.encode(contentText).length,
          };
        } else if (FILE.hasFormat(ext, 'text') || mimetype.indexOf('text') !== -1) {
          const contentText = await response.text();
          model = {
            ...model,
            content: contentText,
            format: 'text',
            mimetype: mimetype || MIME.PLAIN_TEXT,
            size: encoder.encode(contentText).length,
          };
        } else {
          const contentBuffer = await response.arrayBuffer();
          const contentBytes = new Uint8Array(contentBuffer);
          model = {
            ...model,
            content: btoa(contentBytes.reduce(this.reduceBytesToString, '')),
            format: 'base64',
            mimetype: mimetype || MIME.OCTET_STREAM,
            size: contentBytes.length,
          };
        }
      }
    }

    return model;
  }

  /**
   * Retrieve the contents for this path from `api/contents/{path}/all.json`.
   */
  private async _getLiteServerDirectory(path: string): Promise<Map<string, IModel>> {
    const content = this._serverContents.get(path) || new Map<string, IModel>();

    if (!this._serverContents.has(path)) {
      const apiURL = URLExt.join(
        this.serverSettings.baseUrl,
        'api/contents',
        path,
        'all.json',
      );

      try {
        const response = await fetch(apiURL);
        const json = JSON.parse(await response.text());
        for (const file of json['content'] as IModel[]) {
          content.set(file.name, file);
        }
      } catch (err) {
        console.warn(
          `don't worry, about ${err}... nothing's broken. If there had been a
          file at ${apiURL}, you might see some more files.`,
        );
      }
      this._serverContents.set(path, content);
    }

    return content;
  }

  private _serverContents = new Map<string, Map<string, IModel>>();

  private _getContentLayer(
    localModel: IModel | null,
    serverModel: IModel | null,
  ): IContentLayer {
    if (localModel && serverModel) {
      return 'writable-override';
    }

    if (localModel) {
      return 'writable';
    }

    return 'server';
  }

  private _setContentLayer(model: IModel, layer: IContentLayer): IModel {
    return {
      ...model,
      [CONTENT_LAYER]: layer,
    } as ILayeredModel;
  }

  private _mergeDirectoryContent(local: IModel[], server: IModel[]): IModel[] {
    const merged = new Map<string, IModel>();
    const localByName = new Map(local.map((model) => [model.name, model]));
    const serverByName = new Map(server.map((model) => [model.name, model]));

    for (const [name, localModel] of localByName) {
      const layer = serverByName.has(name) ? 'writable-override' : 'writable';
      merged.set(name, this._setContentLayer(localModel, layer));
    }

    for (const [name, serverModel] of serverByName) {
      if (!merged.has(name)) {
        merged.set(name, this._setContentLayer(serverModel, 'server'));
      }
    }

    return Array.from(merged.values());
  }
}

export namespace BrowserStorageDrive {
  export type TContentLayer = 'server' | 'writable' | 'writable-override';

  export interface IOptions extends BaseBrowserStorageDrive.IOptions {
    defaultContentProvider?: Drive.IOptions['defaultContentProvider'];
  }
}
