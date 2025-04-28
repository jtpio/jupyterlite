// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Token } from '@lumino/coreutils';
import { ISignal } from '@lumino/signaling';

/**
 * The interface for the kernel status service.
 */
export interface IKernelStatus {
  /**
   * Signal emitted when the kernel status changes.
   */
  readonly statusChanged: ISignal<IKernelStatus, IKernelStatus.Status>;

  /**
   * Signal emitted when new logs are added.
   */
  readonly logsChanged: ISignal<IKernelStatus, IKernelStatus.ILog>;

  /**
   * Current execution status of the kernel.
   */
  readonly status: IKernelStatus.Status;

  /**
   * The execution logs.
   */
  readonly logs: IKernelStatus.ILog[];

  /**
   * Add a log entry.
   *
   * @param log - The log entry to add
   */
  addLog(log: IKernelStatus.ILog): void;

  /**
   * Set the current execution status.
   *
   * @param status - The new status
   */
  setStatus(status: IKernelStatus.Status): void;

  /**
   * Clear all logs.
   */
  clearLogs(): void;
}

/**
 * A namespace for IKernelStatus statics.
 */
export namespace IKernelStatus {
  /**
   * The possible execution states of the kernel.
   */
  export type Status =
    | 'unknown'
    | 'starting'
    | 'idle'
    | 'busy'
    | 'restarting'
    | 'autorestarting'
    | 'dead';

  /**
   * An interface for kernel log entries.
   */
  export interface ILog {
    /**
     * The log level.
     */
    level: 'info' | 'warning' | 'error';

    /**
     * The log message.
     */
    message: string;

    /**
     * The timestamp of the log entry.
     */
    timestamp: number;
  }
}

/**
 * The token for the kernel status service.
 */
export const IKernelStatus = new Token<IKernelStatus>(
  '@jupyterlite/apputils:IKernelStatus',
);
