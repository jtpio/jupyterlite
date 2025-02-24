// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Kernel, KernelConnection, KernelSpec } from '@jupyterlab/services';

/**
 * Custom KernelConnection class for use in JupyterLite.
 *
 * TODO: consider implementing a proper Kernel.IKernelConnection instead of extending KernelConnection
 */
export class LiteKernelConnection
  extends KernelConnection
  implements Kernel.IKernelConnection
{
  constructor(options: Kernel.IKernelConnection.IOptions) {
    super(options);
  }

  /**
   * The kernel spec.
   *
   * @returns A promise that resolves to the kernel spec.
   */
  get spec(): Promise<KernelSpec.ISpecModel | undefined> {
    throw new Error('Method not implemented.');
  }

  /**
   * Clone the current kernel with a new clientId.
   */
  clone(
    options: Pick<
      Kernel.IKernelConnection.IOptions,
      'clientId' | 'username' | 'handleComms'
    > = {},
  ): Kernel.IKernelConnection {
    return new LiteKernelConnection({
      model: this.model,
      username: this.username,
      serverSettings: this.serverSettings,
      // handleComms defaults to false since that is safer
      handleComms: false,
      ...options,
    });
  }

  /**
   * Interrupt a kernel.
   */
  async interrupt(): Promise<void> {
    this.hasPendingInput = false;
    if (this.status === 'dead') {
      throw new Error('Kernel is dead');
    }
    // TODO
    // return restapi.interruptKernel(this.id, this.serverSettings);
  }

  /**
   * Request a kernel restart.
   */
  async restart(): Promise<void> {
    if (this.status === 'dead') {
      throw new Error('Kernel is dead');
    }
    // TODO: how to avoid accessing private methods and properties?
    this['_updateStatus']('restarting');
    this['_clearKernelState']();
    this['_kernelSession'] = '_RESTARTING_';
    // TODO:
    // await restapi.restartKernel(this.id, this.serverSettings);
    // Reconnect to the kernel to address cases where kernel ports
    // have changed during the restart.
    await this.reconnect();
    this.hasPendingInput = false;
  }

  /**
   * Shutdown a kernel.
   */
  async shutdown(): Promise<void> {
    if (this.status !== 'dead') {
      // TODO:
      // await restapi.shutdownKernel(this.id, this.serverSettings);
    }
    this.handleShutdown();
  }
}
