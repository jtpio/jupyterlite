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

You can also create app-specific custom CSS files that only apply to a particular
application. Place the CSS file in the corresponding app directory:

```
{lite-dir}/
├── custom.css           # Applied to all apps (unless app has its own)
├── lab/
│   └── custom.css       # Applied only to JupyterLab
├── repl/
│   └── custom.css       # Applied only to the REPL
└── notebooks/
    └── custom.css       # Applied only to Jupyter Notebook
```

**Precedence rules:**

- If an app has its own `custom.css`, only that CSS is used for that app
- If an app does not have its own `custom.css`, the root `custom.css` is used (if it
  exists)
- App-specific CSS completely overrides the root CSS for that app (they are not merged)

This allows you to have different styling for different JupyterLite applications. For
example, you could style the REPL minimally while giving JupyterLab a more elaborate
theme.

### Example: Different Styles per App

Create different custom CSS files for each app:

```css
/* lab/custom.css - Full-featured lab styling */
.jp-Notebook {
  background-color: #f0f4f8;
}

#jp-top-bar {
  background-color: #2196f3;
}
```

```css
/* repl/custom.css - Minimal REPL styling */
body {
  background-color: #1a1a2e;
}

.jp-CodeConsole {
  background-color: #16213e;
}
```
