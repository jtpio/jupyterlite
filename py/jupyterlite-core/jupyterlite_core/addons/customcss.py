"""A JupyterLite addon for custom.css support.

Mirrors JupyterLab's custom.css feature. Users can place a custom.css file at
{lite_dir}/custom.css to customize styling. Per-app CSS is also supported via
{lite_dir}/{app}/custom.css (e.g., lab/custom.css).

When both root and app-specific CSS exist, they are merged: root CSS is included
first, followed by app-specific CSS. This allows app CSS to override root styles
via CSS cascade while inheriting common base styles.
"""

import hashlib
import os
import re
from pathlib import Path

from ..constants import CUSTOM_CSS, INDEX_HTML, UTF8
from .base import BaseAddon

CUSTOM_CSS_LINK_ID = "jupyterlite-custom-css"

# Pattern to match existing custom CSS link tags (including surrounding whitespace)
_CUSTOM_CSS_LINK_RE = re.compile(
    r"\s*<link[^>]*id=[\"']jupyterlite-custom-css[\"'][^>]*/?>",
    re.IGNORECASE,
)


class CustomCSSAddon(BaseAddon):
    """Support for custom.css styling, similar to JupyterLab's custom.css feature."""

    __all__ = ["status", "build", "post_build"]

    def status(self, manager):
        """Report the status of custom.css files."""
        found = [
            self._get_custom_css_src(app)
            for app in [None, *manager.apps]
            if self._get_custom_css_src(app).exists()
        ]
        yield self.task(
            name="custom.css",
            actions=[lambda: print(f"""    {CUSTOM_CSS}: {len(found)}""")],
        )

    def build(self, manager):
        """Copy and merge custom.css files from lite_dir to output_dir.

        When both root and app-specific CSS exist, they are merged with root
        CSS first, allowing app CSS to override via cascade.
        """
        root_src = self._get_custom_css_src(None)
        has_root = root_src.exists()

        # Always copy root CSS if it exists
        if has_root:
            dest = self._get_custom_css_dest(None)
            yield self.task(
                name="copy:root",
                doc=f"copy {CUSTOM_CSS} to output",
                file_dep=[root_src],
                targets=[dest],
                actions=[(self.copy_one, [root_src, dest])],
            )

        # For each app, either merge with root or copy standalone
        for app in manager.apps:
            app_src = self._get_custom_css_src(app)
            if not app_src.exists():
                continue

            dest = self._get_custom_css_dest(app)

            if has_root:
                # Merge root + app CSS
                yield self.task(
                    name=f"merge:{app}",
                    doc=f"merge root and {app} {CUSTOM_CSS}",
                    file_dep=[root_src, app_src],
                    targets=[dest],
                    actions=[(self._merge_css, [root_src, app_src, dest])],
                )
            else:
                # Copy app CSS standalone
                yield self.task(
                    name=f"copy:{app}",
                    doc=f"copy {CUSTOM_CSS} to output",
                    file_dep=[app_src],
                    targets=[dest],
                    actions=[(self.copy_one, [app_src, dest])],
                )

    def post_build(self, manager):
        """Inject a <link> tag for custom.css into relevant index.html files."""
        apps_with_css = {
            app for app in [None, *manager.apps] if self._get_custom_css_dest(app).exists()
        }

        if not apps_with_css:
            return

        for app in [None, *manager.apps]:
            app_dir = manager.output_dir / app if app else manager.output_dir
            index_file = app_dir / INDEX_HTML
            if not index_file.exists():
                continue

            # Use app-specific CSS if available, otherwise fall back to root
            if app in apps_with_css:
                css_app = app
            elif None in apps_with_css:
                css_app = None
            else:
                continue

            css_dest = self._get_custom_css_dest(css_app)
            css_hash = self._get_file_hash(css_dest)

            yield self.task(
                name=f"inject:{index_file.relative_to(manager.output_dir)}",
                doc=f"inject custom.css link into {index_file.name}",
                file_dep=[css_dest, index_file],
                actions=[(self._inject_css_link, [index_file, css_dest, css_hash])],
            )

    def _merge_css(self, root_src: Path, app_src: Path, dest: Path):
        """Merge root and app-specific CSS files.

        Root CSS comes first, app CSS second, allowing cascade overrides.
        """
        if not dest.parent.exists():
            dest.parent.mkdir(parents=True)

        root_content = root_src.read_text(**UTF8)
        app_content = app_src.read_text(**UTF8)

        merged = f"{root_content}\n/* App-specific overrides */\n{app_content}"
        dest.write_text(merged, **UTF8)
        self.maybe_timestamp(dest)

    def _get_custom_css_src(self, app: str | None) -> Path:
        """Get the source custom.css path for a given app (or root if None)."""
        base = self.manager.lite_dir / app if app else self.manager.lite_dir
        return base / CUSTOM_CSS

    def _get_custom_css_dest(self, app: str | None) -> Path:
        """Get the destination custom.css path for a given app (or root if None)."""
        base = self.manager.output_dir / app if app else self.manager.output_dir
        return base / "static" / CUSTOM_CSS

    def _inject_css_link(self, index_file: Path, css_dest: Path, css_hash: str):
        """Inject a <link> tag for custom.css into an index.html file.

        Idempotent: removes any existing custom CSS link before injecting.
        """
        content = index_file.read_text(**UTF8)

        if "</head>" not in content.lower():
            self.log.warning(f"[lite] [customcss] no </head> found in {index_file}, skipping")
            return

        # Remove any existing custom CSS link for idempotency
        content = _CUSTOM_CSS_LINK_RE.sub("", content)

        rel_path = self._get_relative_css_path(index_file, css_dest)
        link_tag = (
            f'    <link id="{CUSTOM_CSS_LINK_ID}" '
            f'rel="stylesheet" '
            f'href="{rel_path}?_={css_hash[:8]}">\n  '
        )

        # Inject the link tag before </head>
        content = content.replace("</head>", f"{link_tag}</head>", 1)

        index_file.write_text(content, **UTF8)
        self.maybe_timestamp(index_file)
        self.log.debug(f"[lite] [customcss] injected link into {index_file}")

    def _get_relative_css_path(self, index_file: Path, css_dest: Path) -> str:
        """Calculate the relative path from an index.html to the custom.css file."""
        rel = Path(os.path.relpath(css_dest, index_file.parent))
        return rel.as_posix()

    def _get_file_hash(self, path: Path) -> str:
        """Calculate a SHA256 hash of a file for cache busting."""
        return hashlib.sha256(path.read_bytes()).hexdigest()
