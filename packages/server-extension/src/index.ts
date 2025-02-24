// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IKernels, Kernels, IKernelSpecs } from '@jupyterlite/kernel';

import { ILicenses, Licenses } from '@jupyterlite/licenses';

import {
  JupyterLiteServer,
  JupyterLiteServerPlugin,
  Router,
} from '@jupyterlite/server';

import { ISessions, LiteSessionManager } from '@jupyterlite/session';

/**
 * A plugin providing the routes for the config section.
 * TODO: implement logic to persist the config sections?
 */
const configSectionRoutesPlugin: JupyterLiteServerPlugin<void> = {
  id: '@jupyterlite/server-extension:config-section-routes',
  autoStart: true,
  activate: (app: JupyterLiteServer) => {
    const sections: {
      [id: string]: string;
    } = {};
    app.router.get('/api/config/(.*)', async (req: Router.IRequest, id: string) => {
      const section = sections[id] ?? JSON.stringify({});
      return new Response(section);
    });
    app.router.patch('/api/config/(.*)', async (req: Router.IRequest, id: string) => {
      const payload = req.body as any;
      sections[id] = payload;
      return new Response(payload);
    });
  },
};

/**
 * The kernels service plugin.
 */
const kernelsPlugin: JupyterLiteServerPlugin<IKernels> = {
  id: '@jupyterlite/server-extension:kernels',
  autoStart: true,
  provides: IKernels,
  requires: [IKernelSpecs],
  activate: (app: JupyterLiteServer, kernelspecs: IKernelSpecs) => {
    return new Kernels({ kernelspecs });
  },
};

/**
 * A plugin providing the routes for the kernels service
 */
const kernelsRoutesPlugin: JupyterLiteServerPlugin<void> = {
  id: '@jupyterlite/server-extension:kernels-routes',
  autoStart: true,
  requires: [IKernels],
  activate: (app: JupyterLiteServer, kernels: IKernels) => {
    // GET /api/kernels - List the running kernels
    app.router.get('/api/kernels', async (req: Router.IRequest) => {
      const res = await kernels.list();
      return new Response(JSON.stringify(res));
    });

    // POST /api/kernels/{kernel_id} - Restart a kernel
    app.router.post(
      '/api/kernels/(.*)/restart',
      async (req: Router.IRequest, kernelId: string) => {
        const res = await kernels.restart(kernelId);
        return new Response(JSON.stringify(res));
      },
    );

    // DELETE /api/kernels/{kernel_id} - Kill a kernel and delete the kernel id
    app.router.delete(
      '/api/kernels/(.*)',
      async (req: Router.IRequest, kernelId: string) => {
        const res = await kernels.shutdown(kernelId);
        return new Response(JSON.stringify(res), { status: 204 });
      },
    );
  },
};

/**
 * The licenses service plugin
 */
const licensesPlugin: JupyterLiteServerPlugin<ILicenses> = {
  id: '@jupyterlite/server-extension:licenses',
  autoStart: true,
  provides: ILicenses,
  activate: (app: JupyterLiteServer) => {
    return new Licenses();
  },
};

/**
 * A plugin providing the routes for the licenses service.
 */
const licensesRoutesPlugin: JupyterLiteServerPlugin<void> = {
  id: '@jupyterlite/server-extension:licenses-routes',
  autoStart: true,
  requires: [ILicenses],
  activate(app: JupyterLiteServer, licenses: ILicenses) {
    app.router.get('/api/licenses', async (req: Router.IRequest) => {
      const res = await licenses.get();
      return new Response(JSON.stringify(res));
    });
  },
};

/**
 * A plugin providing the routes for the lsp service.
 * TODO: provide the service in a separate plugin?
 */
const lspRoutesPlugin: JupyterLiteServerPlugin<void> = {
  id: '@jupyterlite/server-extension:lsp-routes',
  autoStart: true,
  activate: (app: JupyterLiteServer) => {
    app.router.get('/lsp/status', async (req: Router.IRequest) => {
      return new Response(JSON.stringify({ version: 2, sessions: {}, specs: {} }));
    });
  },
};

/**
 * The sessions service plugin.
 */
const sessionsPlugin: JupyterLiteServerPlugin<ISessions> = {
  id: '@jupyterlite/server-extension:sessions',
  autoStart: true,
  provides: ISessions,
  requires: [IKernels],
  activate: (app: JupyterLiteServer, kernels: IKernels) => {
    return new Sessions({ kernels });
  },
};

/**
 * A plugin providing the routes for the session service.
 */
const sessionsRoutesPlugin: JupyterLiteServerPlugin<void> = {
  id: '@jupyterlite/server-extension:sessions-routes',
  autoStart: true,
  requires: [ISessions],
  activate: (app: JupyterLiteServer, sessions: ISessions) => {
    // GET /api/sessions/{session} - Get session
    app.router.get('/api/sessions/(.+)', async (req: Router.IRequest, id: string) => {
      const session = await sessions.get(id);
      return new Response(JSON.stringify(session), { status: 200 });
    });

    // GET /api/sessions - List available sessions
    app.router.get('/api/sessions', async (req: Router.IRequest) => {
      const list = await sessions.list();
      return new Response(JSON.stringify(list), { status: 200 });
    });

    // PATCH /api/sessions/{session} - This can be used to rename a session
    app.router.patch('/api/sessions(.*)', async (req: Router.IRequest, id: string) => {
      const options = req.body as any;
      const session = await sessions.patch(options);
      return new Response(JSON.stringify(session), { status: 200 });
    });

    // DELETE /api/sessions/{session} - Delete a session
    app.router.delete(
      '/api/sessions/(.+)',
      async (req: Router.IRequest, id: string) => {
        await sessions.shutdown(id);
        return new Response(null, { status: 204 });
      },
    );

    // POST /api/sessions - Create a new session or return an existing session if a session of the same name already exists
    app.router.post('/api/sessions', async (req: Router.IRequest) => {
      const options = req.body as any;
      const session = await sessions.startNew(options);
      return new Response(JSON.stringify(session), { status: 201 });
    });
  },
};

const plugins: JupyterLiteServerPlugin<any>[] = [
  configSectionRoutesPlugin,
  kernelsPlugin,
  kernelsRoutesPlugin,
  licensesPlugin,
  licensesRoutesPlugin,
  lspRoutesPlugin,
  sessionsPlugin,
  sessionsRoutesPlugin,
];

export default plugins;
