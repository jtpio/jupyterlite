# Adding Custom CSS

JupyterLite supports custom CSS styling, similar to the `custom.css` feature in JupyterLab.
This allows you to customize the appearance of your JupyterLite site by providing your own
CSS styles that override the defaults.

## Creating a Custom CSS File

To add custom styles to your JupyterLite site, create a `custom.css` file in your source
directory at:

```
{lite-dir}/custom/custom.css
```

For example, if your source directory is the current directory, create:

```
./custom/custom.css
```

When you run `jupyter lite build`, the CSS file will be:

1. Copied to the output directory at `static/custom/custom.css`
2. Automatically linked in all `index.html` files with a cache-busting hash

The CSS is loaded after all other styles, so your custom styles will take precedence.

## Examples

### Change the Notebook Background Color

```css
/* custom/custom.css */
.jp-Notebook {
  background-color: #f5f5f5;
}
```

### Customize the Top Bar

```css
/* custom/custom.css */
#jp-top-bar {
  background-color: #1a73e8;
}

#jp-top-bar .jp-TopBar-item {
  color: white;
}
```

### Hide Specific UI Elements

```css
/* custom/custom.css */
/* Hide the file browser */
#filebrowser {
  display: none;
}
```

### Add a Custom Font

```css
/* custom/custom.css */
@import url('https://fonts.googleapis.com/css2?family=Fira+Code&display=swap');

.jp-Cell .CodeMirror,
.jp-Cell .cm-editor {
  font-family: 'Fira Code', monospace;
}
```

### Customize for Dark Theme

```css
/* custom/custom.css */
[data-jp-theme-light='false'] .jp-Notebook {
  background-color: #1e1e1e;
}

[data-jp-theme-light='true'] .jp-Notebook {
  background-color: #ffffff;
}
```

## Checking the Status

You can verify that your custom CSS is detected by running:

```bash
jupyter lite status
```

This will show whether a `custom.css` file was found in your source directory.

## Notes

- The custom CSS file must be located at exactly `{lite-dir}/custom/custom.css`
- The CSS is injected into all application pages (JupyterLab, Notebook, REPL, etc.)
- A cache-busting hash is appended to the CSS URL, so changes take effect immediately
  after rebuilding
- This feature mirrors JupyterLab's [custom CSS functionality](https://jupyterlab.readthedocs.io/en/stable/user/directories.html#custom-css)
