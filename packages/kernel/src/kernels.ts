import { PageConfig, URLExt } from '@jupyterlab/coreutils';

import { IObservableMap, ObservableMap } from '@jupyterlab/observables';

import { BaseManager, Kernel, KernelAPI, KernelMessage } from '@jupyterlab/services';

import { deserialize, serialize } from '@jupyterlab/services/lib/kernel/serialize';

import { supportedKernelWebSocketProtocols } from '@jupyterlab/services/lib/kernel/messages';

import { UUID } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { Mutex } from 'async-mutex';

import { Client as WebSocketClient, Server as WebSocketServer } from 'mock-socket';

import { LiteKernelConnection } from './kernelconnection';
import { IKernel, IKernelSpecs } from './tokens';

/**
 * Use the default kernel wire protocol.
 */
const KERNEL_WEBSOCKET_PROTOCOL =
  supportedKernelWebSocketProtocols.v1KernelWebsocketJupyterOrg;

/**
 * A class to handle requests to /api/kernels
 */
export class LiteKernelManager extends BaseManager implements Kernel.IManager {
  /**
   * Construct a new Kernels
   *
   * @param options The instantiation options
   */
  constructor(options: LiteKernelManager.IOptions) {
    super(options);
    const { kernelSpecs } = options;
    this._kernelspecs = kernelSpecs;
    // Forward the changed signal from _kernels
    this._kernels.changed.connect((_, args) => {
      this._changed.emit(args);
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
   * Signal emitted when the kernels map changes
   */
  get changed(): ISignal<this, IObservableMap.IChangedArgs<IKernel>> {
    return this._changed;
  }

  /**
   * A signal emitted when the running kernels change.
   */
  get runningChanged(): ISignal<this, Kernel.IModel[]> {
    return this._runningChanged;
  }

  /**
   * The number of running kernels.
   */
  get runningCount(): number {
    return this._kernels.size;
  }

  /**
   * Dispose of the resources used by the manager.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    // this._models.clear();
    // this._kernelConnections.forEach(x => x.dispose());
    super.dispose();
  }

  /**
   * Connect to an existing kernel.
   */
  connectTo(
    options: Omit<Kernel.IKernelConnection.IOptions, 'serverSettings'>,
  ): Kernel.IKernelConnection {
    const { id } = options.model;

    let handleComms = options.handleComms ?? true;
    // By default, handle comms only if no other kernel connection is.
    if (options.handleComms === undefined) {
      for (const kc of this._kernelConnections) {
        if (kc.id === id && kc.handleComms) {
          handleComms = false;
          break;
        }
      }
    }
    const kernelConnection = new LiteKernelConnection({
      handleComms,
      ...options,
      serverSettings: this.serverSettings,
    });
    this._onStarted(kernelConnection);
    if (!this._models.has(id)) {
      // We trust the user to connect to an existing kernel, but we verify
      // asynchronously.
      void this.refreshRunning().catch(() => {
        /* no-op */
      });
    }
    return kernelConnection;
  }

  /**
   * Create an iterator over the most recent running kernels.
   *
   * @returns A new iterator over the running kernels.
   */
  running(): IterableIterator<Kernel.IModel> {
    const kernels = this._kernels.values();

    function* generator() {
      for (const kernel of kernels) {
        yield { id: kernel.id, name: kernel.name };
      }
    }
    return generator();
  }

  /**
   * Force a refresh of the running kernels.
   *
   * No-op
   */
  async refreshRunning(): Promise<void> {
    return Promise.resolve(void 0);
  }

  /**
   * Find a kernel by id.
   *
   * @param id - The id of the target kernel.
   *
   * @returns A promise that resolves with the kernel's model.
   */
  async findById(id: string): Promise<Kernel.IModel | undefined> {
    const kernel = this._kernels.get(id);
    if (!kernel) {
      return;
    }
    return { id: kernel.id, name: kernel.name };
  }

  /**
   * Start a new kernel.
   *
   * @param options The kernel start options.
   * For in-browser kernels, specify the drive location and the kernel id.
   */
  async startNew(
    createOptions: LiteKernelManager.ICreateOptions = {},
  ): Promise<Kernel.IKernelConnection> {
    const { id, name, location } = createOptions;

    const kernelName = name ?? this._kernelspecs.defaultKernelName;
    const factory = this._kernelspecs.factories.get(kernelName);
    // bail if there is no factory associated with the requested kernel
    if (!factory) {
      throw Error(`Could not start kernel ${kernelName}`);
    }

    // create a synchronization mechanism to allow only one message
    // to be processed at a time
    const mutex = new Mutex();

    // hook a new client to a kernel
    const hook = (
      kernelId: string,
      clientId: string,
      socket: WebSocketClient,
    ): void => {
      const kernel = this._kernels.get(kernelId);

      if (!kernel) {
        throw Error(`No kernel ${kernelId}`);
      }

      this._clients.set(clientId, socket);
      this._kernelClients.get(kernelId)?.add(clientId);

      const processMsg = async (msg: KernelMessage.IMessage) => {
        await mutex.runExclusive(async () => {
          await kernel.ready;
          await kernel.handleMessage(msg);
        });
      };

      socket.on(
        'message',
        async (message: string | ArrayBuffer | Blob | ArrayBufferView) => {
          let msg;
          if (message instanceof ArrayBuffer) {
            message = new Uint8Array(message).buffer;
            msg = deserialize(message, KERNEL_WEBSOCKET_PROTOCOL);
          } else if (typeof message === 'string') {
            const encoder = new TextEncoder();
            const encodedData = encoder.encode(message);
            msg = deserialize(encodedData.buffer, KERNEL_WEBSOCKET_PROTOCOL);
          } else {
            return;
          }

          // TODO Find a better solution for this?
          // input-reply is asynchronous, must not be processed like other messages
          if (msg.header.msg_type === 'input_reply') {
            kernel.handleMessage(msg);
          } else {
            void processMsg(msg);
          }
        },
      );

      const removeClient = () => {
        this._clients.delete(clientId);
        this._kernelClients.get(kernelId)?.delete(clientId);
      };

      kernel.disposed.connect(removeClient);
      socket.onclose = removeClient;
    };

    // ensure kernel id
    const kernelId = id ?? UUID.uuid4();

    // There is one server per kernel which handles multiple clients
    const kernelUrl = URLExt.join(
      LiteKernelManager.WS_BASE_URL,
      KernelAPI.KERNEL_SERVICE_URL,
      encodeURIComponent(kernelId),
      'channels',
    );
    const runningKernel = this._kernels.get(kernelId);
    if (runningKernel) {
      return {
        id: runningKernel.id,
        name: runningKernel.name,
      };
    }

    // start the kernel
    const sendMessage = (msg: KernelMessage.IMessage): void => {
      const clientId = msg.header.session;
      const socket = this._clients.get(clientId);
      if (!socket) {
        console.warn(`Trying to send message on removed socket for kernel ${kernelId}`);
        return;
      }

      const message = serialize(msg, KERNEL_WEBSOCKET_PROTOCOL);
      // process iopub messages
      if (msg.channel === 'iopub') {
        const clients = this._kernelClients.get(kernelId);
        clients?.forEach((id) => {
          this._clients.get(id)?.send(message);
        });
        return;
      }
      socket.send(message);
    };

    const kernel = await factory({
      id: kernelId,
      sendMessage,
      name,
      location,
    });

    this._kernels.set(kernelId, kernel);
    this._kernelClients.set(kernelId, new Set<string>());

    // create the websocket server for the kernel
    const wsServer = new WebSocketServer(kernelUrl, {
      mock: false,
      selectProtocol: () => KERNEL_WEBSOCKET_PROTOCOL,
    });
    wsServer.on('connection', (socket: WebSocketClient): void => {
      const url = new URL(socket.url);
      const clientId = url.searchParams.get('session_id') ?? '';
      hook(kernelId, clientId, socket);
    });

    // clean up closed connection
    wsServer.on('close', (): void => {
      this._clients.keys().forEach((clientId) => {
        const socket = this._clients.get(clientId);
        if (socket?.readyState === WebSocket.CLOSED) {
          this._clients.delete(clientId);
          this._kernelClients.get(kernelId)?.delete(clientId);
        }
      });
    });

    // cleanup on kernel shutdown
    kernel.disposed.connect(() => {
      wsServer.close();
      this._kernels.delete(kernelId);
      this._kernelClients.delete(kernelId);
    });

    return {
      id: kernel.id,
      name: kernel.name,
    };
  }

  /**
   * Restart a kernel.
   *
   * @param kernelId The kernel id.
   */
  async restart(kernelId: string): Promise<Kernel.IModel> {
    const kernel = this._kernels.get(kernelId);
    if (!kernel) {
      throw Error(`Kernel ${kernelId} does not exist`);
    }
    const { id, name, location } = kernel;
    kernel.dispose();
    return this.startNew({ id, name, location });
  }

  /**
   * Shut down a kernel.
   *
   * @param id The kernel id.
   */
  async shutdown(id: string): Promise<void> {
    this._kernels.delete(id)?.dispose();
  }

  /**
   * Shut down all kernels.
   *
   * @returns A promise that resolves when all of the kernels are shut down.
   */
  async shutdownAll(): Promise<void> {
    await Promise.all([...this._kernels.keys()].map((id) => this.shutdown(id)));
  }

  /**
   * Get a kernel by id
   */
  async get(id: string): Promise<IKernel | undefined> {
    return this._kernels.get(id);
  }

  private _kernels = new ObservableMap<IKernel>();
  private _clients = new ObservableMap<WebSocketClient>();
  private _kernelClients = new ObservableMap<Set<string>>();
  private _kernelspecs: IKernelSpecs;
  private _changed = new Signal<this, IObservableMap.IChangedArgs<IKernel>>(this);
  private _runningChanged = new Signal<this, Kernel.IModel[]>(this);
  private _isReady = false;
  private _connectionFailure = new Signal<this, Error>(this);
  private _ready: Promise<void> = Promise.resolve(void 0);
  private _kernelConnections = new Set<Kernel.IKernelConnection>();
}

/**
 * A namespace for Kernels statics.
 */
export namespace LiteKernelManager {
  /**
   * The options used to initialize a KernelManager.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * The in-browser kernel specs service.
     */
    kernelSpecs: IKernelSpecs;
  }

  /**
   * The options to start a new kernel.
   */
  export interface ICreateOptions {
    /**
     * The kernel id.
     */
    id?: string;

    /**
     * The kernel name.
     */
    name?: string;

    /**
     * The location in the virtual filesystem from which the kernel was started.
     */
    location?: string;
  }

  /**
   * The base url for the Kernels manager
   */
  export const WS_BASE_URL = PageConfig.getBaseUrl().replace(/^http/, 'ws');
}
