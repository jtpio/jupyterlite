// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import React, { useState, useEffect } from 'react';

import { ReactWidget } from '@jupyterlab/apputils';

import { ISignal, Signal } from '@lumino/signaling';

import { IKernelStatus } from './tokens';

/**
 * A concrete implementation of IKernelStatus.
 */
export class KernelStatus implements IKernelStatus {
  /**
   * Current execution status of the kernel.
   */
  get status(): IKernelStatus.Status {
    return this._status;
  }

  /**
   * The execution logs.
   */
  get logs(): IKernelStatus.ILog[] {
    return this._logs;
  }

  /**
   * Signal emitted when the kernel status changes.
   */
  get statusChanged(): ISignal<IKernelStatus, IKernelStatus.Status> {
    return this._statusChanged;
  }

  /**
   * Signal emitted when new logs are added.
   */
  get logsChanged(): ISignal<IKernelStatus, IKernelStatus.ILog> {
    return this._logsChanged;
  }

  /**
   * Add a log entry.
   *
   * @param log - The log entry to add
   */
  addLog(log: IKernelStatus.ILog): void {
    this._logs.push(log);
    this._logsChanged.emit(log);
  }

  /**
   * Set the current execution status.
   *
   * @param status - The new status
   */
  setStatus(status: IKernelStatus.Status): void {
    if (this._status === status) {
      return;
    }
    this._status = status;
    this._statusChanged.emit(status);
  }

  /**
   * Clear all logs.
   */
  clearLogs(): void {
    this._logs = [];
    this._logsChanged.emit({
      level: 'info',
      message: 'Logs cleared',
      timestamp: Date.now(),
    });
  }

  private _status: IKernelStatus.Status = 'idle';
  private _logs: IKernelStatus.ILog[] = [];
  private _statusChanged = new Signal<IKernelStatus, IKernelStatus.Status>(this);
  private _logsChanged = new Signal<IKernelStatus, IKernelStatus.ILog>(this);
}

/**
 * A React component for displaying kernel status.
 */
function KernelStatusComponent(props: { model: IKernelStatus }): JSX.Element {
  const [status, setStatus] = useState<IKernelStatus.Status>(props.model.status);

  useEffect(() => {
    const onChange = (_: any, newStatus: IKernelStatus.Status) => {
      setStatus(newStatus);
    };

    props.model.statusChanged.connect(onChange);

    return () => {
      props.model.statusChanged.disconnect(onChange);
    };
  }, [props.model]);

  const isError = status === 'dead' || status === 'unknown';
  const isBusy =
    status === 'busy' ||
    status === 'starting' ||
    status === 'restarting' ||
    status === 'autorestarting';
  const isIdle = status === 'idle';

  // Return the appropriate icon and text based on status
  return (
    <div className={'jp-KernelStatus'}>
      <div className="jp-KernelStatus-icon-container">
        {isBusy && (
          <div className="jp-KernelStatus-spinner">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle
                className="jp-KernelStatus-spinner-track"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="jp-KernelStatus-spinner-path"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )}

        {isIdle && (
          <div className="jp-KernelStatus-success">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M8 12L11 15L16 9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {isError && (
          <div className="jp-KernelStatus-error">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M15 9L9 15M9 9L15 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A widget displaying the kernel status.
 */
export class KernelStatusWidget extends ReactWidget {
  /**
   * Construct a new kernel status widget.
   */
  constructor(options: KernelStatusWidget.IOptions) {
    super();
    this._model = options.model;
    this.addClass('jp-KernelStatus-widget');
  }

  /**
   * The kernel status model used by the widget.
   */
  get model(): IKernelStatus {
    return this._model;
  }

  /**
   * Render the kernel status widget.
   */
  protected render(): JSX.Element {
    return <KernelStatusComponent model={this._model} />;
  }

  private _model: IKernelStatus;
}

/**
 * A namespace for KernelStatusWidget statics.
 */
export namespace KernelStatusWidget {
  /**
   * Options for creating a KernelStatusWidget.
   */
  export interface IOptions {
    /**
     * The kernel status model to use.
     */
    model: IKernelStatus;
  }
}
