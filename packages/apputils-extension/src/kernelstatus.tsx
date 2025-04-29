// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

import { IKernelStatus, KernelStatus, KernelStatusWidget } from '@jupyterlite/apputils';

import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IToolbarWidgetRegistry } from '@jupyterlab/apputils';

import { Kernel } from '@jupyterlab/services';

/**
 * The plugin id.
 */
const PLUGIN_ID = '@jupyterlite/apputils-extension:kernel-status';

/**
 * A plugin that provides a kernel status model and widget.
 */
const kernelStatusPlugin: JupyterFrontEndPlugin<IKernelStatus> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ISettingRegistry, IToolbarWidgetRegistry],
  provides: IKernelStatus,
  activate: (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry | null,
    toolbarRegistry: IToolbarWidgetRegistry | null,
  ): IKernelStatus => {
    const { commands } = app;

    // Create the kernel status model
    const kernelStatus = new KernelStatus();

    // Add status monitoring to the notebook
    notebookTracker.widgetAdded.connect((_, panel: NotebookPanel) => {
      const sessionContext = panel.sessionContext;

      // Update status when kernel status changes
      sessionContext.statusChanged.connect((_, status) => {
        kernelStatus.setStatus(status as Kernel.Status);

        // Add a log entry
        kernelStatus.addLog({
          level: 'info',
          message: `Kernel status changed to ${status}`,
          timestamp: Date.now(),
        });
      });

      // Handle kernel changed events
      sessionContext.kernelChanged.connect((_, changed) => {
        const { newValue } = changed;
        if (newValue) {
          kernelStatus.addLog({
            level: 'info',
            message: `Connected to kernel: ${newValue.name}`,
            timestamp: Date.now(),
          });
        } else {
          kernelStatus.addLog({
            level: 'warning',
            message: 'Kernel disconnected',
            timestamp: Date.now(),
          });
        }
      });
    });

    // Register the widget with the toolbar registry
    if (toolbarRegistry) {
      // Create a kernel status widget factory
      const createKernelStatusWidget = () => {
        return new KernelStatusWidget({
          model: kernelStatus,
          onClick: () => {
            commands.execute('logconsole:open');
          },
        });
      };

      // Add the kernel status widget to the notebook toolbar
      // Make sure this is registered with proper capitalization and matches the schema
      toolbarRegistry.addFactory('Notebook', 'kernelStatus', createKernelStatusWidget);
    }

    return kernelStatus;
  },
};

/**
 * Export the plugin as default.
 */
export default kernelStatusPlugin;
