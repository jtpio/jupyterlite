# JupyterLite and Pyodide Limitations

This document outlines the current limitations when using JupyterLite with the Python kernel powered by [Pyodide](https://pyodide.org/). These limitations stem from the browser environment, WebAssembly constraints, and the differences between JupyterLite and standard JupyterLab.

## General JupyterLite Limitations

While JupyterLite aims to provide a familiar Jupyter experience in the browser, there are some key differences from traditional JupyterLab:

- **No Backend Server**: JupyterLite runs entirely in the browser without a server backend, so features requiring server-side processing aren't available.
- **Storage Limitations**: Instead of a traditional filesystem, JupyterLite uses browser storage mechanisms like IndexedDB and localStorage, which have size limits.
- **Browser Compatibility**: Some features may not work in all browsers or private browsing modes. For example, the virtual filesystem doesn't work in Firefox's private browsing mode.
- **Network Constraints**: Due to browser security policies (CORS), there may be limitations accessing remote resources.
- **Extension Support**: Not all JupyterLab extensions are compatible with JupyterLite. Extensions that require server-side components won't work.

## Pyodide-Specific Limitations

The Python kernel in JupyterLite is powered by Pyodide, which compiles CPython to WebAssembly. This introduces specific limitations:

### Package Installation Limitations

- **Pure Python Packages Only**: By default, only pure Python packages (those ending in `py3-none-any.whl`) can be installed dynamically.
- **C Extensions**: Packages with compiled C extensions require special compilation for WebAssembly/Emscripten and won't work unless specifically built for Pyodide.
- **Installation Process**: Package installation occurs at runtime and is done through `micropip` (via `%pip` magic or `await piplite.install()`), not through the traditional pip.

### Performance Considerations

- **Startup Time**: Pyodide has a significant initial load time as it downloads and initializes the Python runtime in WebAssembly.
- **Memory Usage**: WebAssembly has more memory overhead than native Python, so resource-intensive operations may hit browser memory limits.
- **Computation Speed**: While getting faster, WebAssembly Python execution is generally slower than native Python.

### API and Feature Limitations

- **DOM Access**: The Python kernel runs in a Web Worker for isolation, which prevents direct DOM manipulation. Attempts to use `js.document` will result in errors.
- **Sleep Function**: The standard `time.sleep()` function is not supported in the Pyodide kernel (though it is in the Xeus Python kernel).
- **Threading Limitations**: WebAssembly has limited threading support, which affects libraries relying on the Python threading model.
- **System Calls**: Many system-level operations that would work in standard Python cannot function in the browser sandbox.

## WebAssembly Constraints

Running Python in WebAssembly introduces several technical constraints:

- **File System Access**: The virtual file system has limitations and differences from native file systems.
- **Network Access**: Network requests must comply with browser security policies (same-origin policy, CORS).
- **Browser APIs**: Access to browser APIs is mediated through Pyodide's JavaScript bridge.
- **Memory Management**: WebAssembly has a different memory model than native applications.

For more detailed information about WebAssembly constraints in Pyodide, refer to the [Pyodide WebAssembly constraints documentation](https://pyodide.org/en/latest/usage/wasm-constraints.html).

## Working Within These Limitations

Despite these limitations, JupyterLite with Pyodide enables powerful browser-based data analysis and visualization:

- Many pure Python scientific libraries work well (numpy, pandas, matplotlib, etc.)
- Visualization libraries like altair, plotly, and bqplot are supported
- Interactive widgets (ipywidgets) function properly
- Offline use is possible with proper configuration

### Recommended Practices

1. **Preload Common Packages**: Consider bundling frequently used packages with your JupyterLite deployment to avoid runtime installation.
2. **Check Compatibility**: Before relying on a package, verify it works in Pyodide.
3. **Be Mindful of Resources**: Monitor memory usage for large computations.
4. **Use Asynchronous Operations**: For network requests and package installation, use the appropriate async patterns.

## Alternatives

If you need features not available in the Pyodide kernel, consider:

1. **Xeus Python Kernel**: JupyterLite also supports the Xeus Python kernel, which has different capabilities (e.g., it supports `time.sleep()` but doesn't support dynamic package installation).
2. **Standard JupyterLab**: For full Python capabilities, consider using traditional JupyterLab with a server backend.
