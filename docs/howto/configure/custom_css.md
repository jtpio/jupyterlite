# Adding Custom CSS

JupyterLite supports custom CSS styling, similar to the `custom.css` feature in
JupyterLab. This allows you to customize the appearance of your JupyterLite site by
providing your own CSS styles that override the defaults.

## Creating a Custom CSS File

To add custom styles to your JupyterLite site, create a `custom.css` file in your source
directory at:

```
{lite-dir}/custom.css
```

For example, if your source directory is the current directory, create:

```
./custom.css
```

When you run `jupyter lite build`, the CSS file will be:

1. Copied to the output directory at `static/custom.css`
2. Automatically linked in all `index.html` files with a cache-busting hash

The CSS is loaded after all other styles, so your custom styles will take precedence.

## Examples

### Change the Notebook Background Color

```css
/* custom.css */
.jp-Notebook {
  background-color: #f5f5f5;
}
```

### Customize the Top Bar

```css
/* custom.css */
#jp-top-bar {
  background-color: #1a73e8;
}

#jp-top-bar .jp-TopBar-item {
  color: white;
}
```

### Hide Specific UI Elements

```css
/* custom.css */
/* Hide the file browser */
#filebrowser {
  display: none;
}
```

### Add a Custom Font

```css
/* custom.css */
@import url('https://fonts.googleapis.com/css2?family=Fira+Code&display=swap');

.jp-Cell .CodeMirror,
.jp-Cell .cm-editor {
  font-family: 'Fira Code', monospace;
}
```

### Customize for Dark Theme

```css
/* custom.css */
[data-jp-theme-light='false'] .jp-Notebook {
  background-color: #1e1e1e;
}

[data-jp-theme-light='true'] .jp-Notebook {
  background-color: #ffffff;
}
```

## Checking the Status

You can verify that your custom CSS files are detected by running:

```bash
jupyter lite status
```

This will show the count of `custom.css` files found in your source directory.

## Notes

- The custom CSS file must be located at `{lite-dir}/custom.css`
- A cache-busting hash is appended to the CSS URL, so changes take effect immediately
  after rebuilding
- This feature mirrors JupyterLab's
  [custom CSS functionality](https://jupyterlab.readthedocs.io/en/stable/user/directories.html#custom-css)

## Advanced: Per-App Custom CSS

You can also create app-specific custom CSS files that apply to a particular
application. Place the CSS file in the corresponding app directory:

```
{lite-dir}/
├── custom.css           # Base styles applied to all apps
├── lab/
│   └── custom.css       # Additional styles for JupyterLab
├── repl/
│   └── custom.css       # Additional styles for the REPL
└── notebooks/
    └── custom.css       # Additional styles for Jupyter Notebook
```

**Merging behavior:**

- When both root and app-specific CSS exist, they are **merged**: root CSS is included
  first, followed by app-specific CSS
- This allows app CSS to override root styles via CSS cascade while inheriting common
  base styles
- If an app does not have its own `custom.css`, only the root `custom.css` is used
- If only app-specific CSS exists (no root), it is used standalone

This allows you to define common base styles in the root `custom.css` and add
app-specific customizations that build on top of them.

### Example: Base Styles with App Overrides

Define common styles in the root CSS:

```css
/* custom.css - Base styles for all apps */
:root {
  --brand-color: #2196f3;
}

#jp-top-bar {
  background-color: var(--brand-color);
}
```

Then add app-specific overrides:

```css
/* repl/custom.css - REPL-specific overrides */
/* These styles are merged with the root CSS */
:root {
  --brand-color: #4caf50; /* Override brand color for REPL */
}

.jp-CodeConsole {
  background-color: #1a1a2e;
}
```

The REPL will receive both the base styles and its overrides, with the app-specific
styles taking precedence via CSS cascade.
