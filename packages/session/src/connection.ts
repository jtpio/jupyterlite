// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Session } from '@jupyterlab/services';
import { SessionConnection } from '@jupyterlab/services/lib/session/default';
import { ISessionStore } from './tokens';

/**
 * Custom SessionConnection class for use in JupyterLite.
 */
export class LiteSessionConnection
  extends SessionConnection
  implements Session.ISessionConnection
{
  /**
   * Construct a new session connection.
   */
  constructor(options: LiteSessionConnection.IOptions) {
    super(options);
    this._sessionStore = options.sessionStore;
  }

  /**
   * Kill the kernel and shutdown the session.
   */
  async shutdown(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    this._sessionStore.shutdown(this.id);
    this.dispose();
  }

  /**
   * Change the session path.
   */
  async setPath(path: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    await this._litePatch({ path });
  }

  /**
   * Change the session name.
   */
  async setName(name: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    await this._litePatch({ name });
  }

  /**
   * Change the session type.
   */
  async setType(type: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    await this._litePatch({ type });
  }

  /**
   * Custom patch for a session
   */
  private async _litePatch(body: Partial<Session.IModel>): Promise<Session.IModel> {
    const model = await this._sessionStore.patch({ ...body, id: this.id });
    this.update(model);
    return model;
  }

  private _sessionStore: ISessionStore;
}

/**
 * Namespace for LiteSessionConnection statics.
 */
export namespace LiteSessionConnection {
  /**
   * The options used to create a session connection.
   */
  export interface IOptions extends Session.ISessionConnection.IOptions {
    /**
     * The kernel store
     */
    sessionStore: ISessionStore;
  }
}
