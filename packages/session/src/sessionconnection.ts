// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Session } from '@jupyterlab/services';
import { SessionConnection } from '@jupyterlab/services/lib/session/default';

type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

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
  constructor(options: Session.ISessionConnection.IOptions) {
    super(options);
  }

  /**
   * Kill the kernel and shutdown the session.
   */
  async shutdown(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    // TODO
    // await shutdownSession(this.id, this.serverSettings);
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
  private async _litePatch(body: DeepPartial<Session.IModel>): Promise<Session.IModel> {
    // const model = await updateSession({ ...body, id: this._id }, this.serverSettings);
    // this.update(model);
    // return model;
    // TODO
    return this.model;
  }
}
