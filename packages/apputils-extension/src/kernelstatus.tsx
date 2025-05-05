// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

import { NotebookPanel } from '@jupyterlab/notebook';

import { IToolbarWidgetRegistry } from '@jupyterlab/apputils';

import { ILoggerRegistry, ILogOutputModel } from '@jupyterlab/logconsole';

import { Kernel } from '@jupyterlab/services';

import { IKernelStatus, KernelStatus, KernelStatusWidget } from '@jupyterlite/apputils';

/**
 * The plugin id.
 */
const PLUGIN_ID = '@jupyterlite/apputils-extension:kernel-status';

/**
 * A plugin that provides a kernel status model and widget.
 */
const kernelStatusPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  optional: [IToolbarWidgetRegistry, ILoggerRegistry],
  provides: IKernelStatus,
  activate: (
    app: JupyterFrontEnd,
    toolbarRegistry: IToolbarWidgetRegistry | null,
    loggerRegistry: ILoggerRegistry | null,
  ): void => {
    const { commands } = app;

    // Register the widget with the toolbar registry
    if (toolbarRegistry) {
      // Add the kernel status widget to the notebook toolbar
      toolbarRegistry.addFactory<NotebookPanel>(
        'Notebook',
        'kernelStatus',
        (panel: NotebookPanel) => {
          // Create the kernel status model
          const kernelStatus = new KernelStatus();

          const sessionContext = panel.sessionContext;

          // Update status when kernel status changes
          sessionContext.statusChanged.connect((_, status) => {
            kernelStatus.setStatus(status as Kernel.Status);
          });

          if (loggerRegistry) {
            const path = panel.context.path;
            const logger = loggerRegistry.getLogger(path);
            logger?.contentChanged.connect((_, args) => {
              if (args === 'append') {
                // get the latest message
                const length = logger.outputAreaModel.length;
                const latestMessage = logger.outputAreaModel.get(
                  length - 1,
                ) as ILogOutputModel;
                const level = latestMessage.level;
                // rely on kernels properly reporting a critical state
                if (level === 'critical') {
                  kernelStatus.setStatus('dead');
                } else {
                  // if new messages are logged, set the status back to busy
                  kernelStatus.setStatus('busy');
                }
              }
            });
          }

          return new KernelStatusWidget({
            model: kernelStatus,
            onClick: () => {
              commands.execute('logconsole:open');
            },
          });
        },
      );
    }
  },
};

/**
 * Export the plugin as default.
 */
export default kernelStatusPlugin;
