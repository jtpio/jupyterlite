import { BaseManager, Kernel, Session } from '@jupyterlab/services';

import { SessionConnection } from '@jupyterlab/services/lib/session/default';

import { PathExt } from '@jupyterlab/coreutils';

import { ArrayExt } from '@lumino/algorithm';

import { UUID } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

/**
 * A class to handle requests to /api/sessions
 */
export class LiteSessionManager extends BaseManager implements Session.IManager {
  /**
   * Construct a new LiteSessionManager.
   *
   * @param options The instantiation options for a LiteSessionManager.
   */
  constructor(options: LiteSessionManager.IOptions) {
    super(options);
    this._kernelManager = options.kernelManager;
    // Listen for kernel removals
    this._kernels.changed.connect((_, args) => {
      switch (args.type) {
        case 'remove': {
          const kernelId = args.oldValue?.id;
          if (!kernelId) {
            return;
          }
          // find the session associated with the kernel
          const session = this._sessions.find((s) => s.kernel?.id === kernelId);
          if (!session) {
            return;
          }
          // Track the kernel ID for restart detection
          this._pendingRestarts.add(kernelId);
          setTimeout(async () => {
            // If after a short delay the kernel hasn't been re-added, it was terminated
            if (this._pendingRestarts.has(kernelId)) {
              this._pendingRestarts.delete(kernelId);
              await this.shutdown(session.id);
            }
          }, 100);
          break;
        }
        case 'add': {
          // If this was a restart, remove it from pending
          const kernelId = args.newValue?.id;
          if (!kernelId) {
            return;
          }
          this._pendingRestarts.delete(kernelId);
          break;
        }
      }
    });
  }

  /**
   * A signal emitted when there is a connection failure.
   */
  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  /**
   * Test whether the manager is ready.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * A promise that fulfills when the manager is ready.
   */
  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * A signal emitted when the running sessions change.
   */
  get runningChanged(): ISignal<this, Session.IModel[]> {
    return this._runningChanged;
  }

  /**
   * Dispose of the resources used by the manager.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    // TODO
    super.dispose();
  }

  /*
   * Connect to a running session.  See also [[connectToSession]].
   */
  connectTo(
    options: Omit<
      Session.ISessionConnection.IOptions,
      'connectToKernel' | 'serverSettings'
    >,
  ): Session.ISessionConnection {
    const sessionConnection = new SessionConnection({
      ...options,
      connectToKernel: this._connectToKernel,
      serverSettings: this.serverSettings,
    });
    // this._onStarted(sessionConnection);
    // if (!this._models.has(options.model.id)) {
    //   // We trust the user to connect to an existing session, but we verify
    //   // asynchronously.
    //   void this.refreshRunning().catch(() => {
    //     /* no-op */
    //   });
    // }

    return sessionConnection;
  }

  /**
   * Create an iterator over the most recent running sessions.
   */
  running(): IterableIterator<Session.IModel> {
    return this._models.values();
  }

  /**
   * Force a refresh of the running sessions.
   */
  async refreshRunning(): Promise<void> {
    // no-op
  }

  /**
   * Start a new session
   * TODO: read path and name
   *
   * @param options The options to start a new session.
   */
  async startNew(options: Session.IModel): Promise<Session.IModel> {
    const { path, name } = options;
    const running = this._sessions.find((s) => s.name === name);
    if (running) {
      return running;
    }
    const kernelName = options.kernel?.name ?? '';
    const id = options.id ?? UUID.uuid4();
    const nameOrPath = options.name ?? options.path;
    const dirname = PathExt.dirname(options.name) || PathExt.dirname(options.path);
    const hasDrive = nameOrPath.includes(':');
    const driveName = hasDrive ? nameOrPath.split(':')[0] : '';
    // add drive name if missing (top level directory)
    const location = dirname.includes(driveName) ? dirname : `${driveName}:${dirname}`;
    const kernel = await this._kernels.startNew({
      id,
      name: kernelName,
      location,
    });
    const session: Session.IModel = {
      id,
      path,
      name: name ?? path,
      type: 'notebook',
      kernel: {
        id: kernel.id,
        name: kernel.name,
      },
    };
    this._sessions.push(session);

    // clean up the session on kernel shutdown
    void this._handleKernelShutdown({ kernelId: id, sessionId: session.id });

    return session;
  }

  /**
   * Shut down a session.
   *
   * @param id The id of the session to shut down.
   */
  async shutdown(id: string): Promise<void> {
    const session = this._sessions.find((s) => s.id === id);
    if (!session) {
      throw Error(`Session ${id} not found`);
    }
    const kernelId = session.kernel?.id;
    if (kernelId) {
      await this._kernels.shutdown(kernelId);
    }
    ArrayExt.removeFirstOf(this._sessions, session);
  }

  /**
   * Shut down all sessions.
   *
   * @returns A promise that resolves when all of the kernels are shut down.
   */
  async shutdownAll(): Promise<void> {
    // Update the list of models to make sure our list is current.
    await this.refreshRunning();

    // Shut down all models.
    // await Promise.all(
    //   [...this._models.keys()].map((id) => shutdownSession(id, this.serverSettings)),
    // );

    // Update the list of models to clear out our state.
    await this.refreshRunning();
  }

  /**
   * Find a session associated with a path and stop it if it is the only session
   * using that kernel.
   */
  async stopIfNeeded(path: string): Promise<void> {
    // TODO
  }

  /**
   * Find a session by id.
   *
   * @param id The id of the session.
   */
  async findById(id: string): Promise<Session.IModel> {
    const session = this._sessions.find((s) => s.id === id);
    if (!session) {
      throw Error(`Session ${id} not found`);
    }
    return session;
  }

  /**
   * Find a session by path.
   */
  async findByPath(path: string): Promise<Session.IModel | undefined> {
    // TODO
    return undefined;
  }

  /**
   * List the running sessions
   */
  async list(): Promise<Session.IModel[]> {
    return this._sessions;
  }

  /**
   * Patch an existing session.
   * This can be used to rename a session.
   *
   * - path updates session to track renamed paths
   * - kernel.name starts a new kernel with a given kernelspec
   *
   * @param options The options to patch the session.
   */
  async patch(options: Session.IModel): Promise<Session.IModel> {
    const { id, path, name, kernel } = options;
    const index = this._sessions.findIndex((s) => s.id === id);
    const session = this._sessions[index];
    if (!session) {
      throw Error(`Session ${id} not found`);
    }
    const patched = {
      ...session,
      path: path ?? session.path,
      name: name ?? session.name,
    };

    if (kernel) {
      // Kernel id takes precedence over name.
      if (kernel.id) {
        const session = this._sessions.find(
          (session) => session.kernel?.id === kernel?.id,
        );
        if (session) {
          patched.kernel = session.kernel;
        }
      } else if (kernel.name) {
        const newKernel = await this._kernels.startNew({
          id: UUID.uuid4(),
          name: kernel.name,
          location: PathExt.dirname(patched.path),
        });

        if (newKernel) {
          patched.kernel = newKernel;
        }

        // clean up the session on kernel shutdown
        void this._handleKernelShutdown({
          kernelId: newKernel.id,
          sessionId: session.id,
        });
      }
    }

    this._sessions[index] = patched;
    return patched;
  }

  /**
   * Handle kernel shutdown
   */
  private async _handleKernelShutdown({
    kernelId,
    sessionId,
  }: {
    kernelId: string;
    sessionId: string;
  }): Promise<void> {
    // No need to handle kernel shutdown here anymore since we're using the changed signal
  }

  private _kernels: IKernels;
  private _sessions: Session.IModel[] = [];
  private _pendingRestarts = new Set<string>();
  private _isReady = false;
  private _connectionFailure = new Signal<this, Error>(this);
  private _ready: Promise<void> = Promise.resolve(void 0);
  private _runningChanged = new Signal<this, Session.IModel[]>(this);
  private readonly _connectToKernel = (
    options: Omit<Kernel.IKernelConnection.IOptions, 'serverSettings'>,
  ) => {
    return this._kernelManager.connectTo(options);
  };
  private _kernelManager: Kernel.IManager;
}

/**
 * A namespace for sessions statics.
 */
export namespace LiteSessionManager {
  /**
   * The instantiation options for the sessions.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * Kernel Manager
     */
    kernelManager: Kernel.IManager;
  }
}
