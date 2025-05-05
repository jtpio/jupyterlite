// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Token } from '@lumino/coreutils';

import { ISignal } from '@lumino/signaling';

import { Kernel } from '@jupyterlab/services';

/**
 * The token for the kernel status.
 */
export const IKernelStatus = new Token<IKernelStatus>(
  '@jupyterlite/apputils:IKernelStatus',
);

/**
 * An interface for kernel status.
 */
export interface IKernelStatus {
  /**
   * Current execution status of the kernel.
   */
  readonly status: Kernel.Status;

  /**
   * Signal emitted when the kernel status changes.
   */
  readonly statusChanged: ISignal<IKernelStatus, Kernel.Status>;

  /**
   * Set the current execution status.
   *
   * @param status - The new status
   */
  setStatus(status: Kernel.Status): void;
}
