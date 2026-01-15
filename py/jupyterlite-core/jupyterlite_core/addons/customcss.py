"""A JupyterLite addon for custom.css support.

Users can place a custom.css file at {lite_dir}/custom.css to customize styling.
Per-app CSS is also supported via {lite_dir}/{app}/custom.css (e.g., lab/custom.css).

When both root and app-specific CSS exist, they are merged: root CSS is included
first, followed by app-specific CSS, allowing app CSS to override root styles.
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
_HEAD_CLOSE_RE = re.compile(r"</head>", re.IGNORECASE)


class CustomCSSAddon(BaseAddon):
    """Support for custom.css styling, similar to JupyterLab's custom.css feature."""

    __all__ = ["status", "build", "post_build"]

    def status(self, manager):
        """Report the status of custom.css files."""
        apps = [None, *manager.apps]
        found = [src_path for app in apps if (src_path := self._get_custom_css_src(app)).exists()]
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
        root_dest = self._get_custom_css_dest(None)

        if has_root:
            yield self.task(
                name="copy:root",
                doc=f"copy {CUSTOM_CSS} to output",
                file_dep=[root_src],
                targets=[root_dest],
                actions=[(self.copy_one, [root_src, root_dest])],
            )
        else:
            yield self.task(
                name="prune:root",
                doc=f"remove stale root {CUSTOM_CSS}",
                actions=[(self._delete_if_exists, [root_dest])],
            )

        for app in manager.apps:
            app_src = self._get_custom_css_src(app)
            dest = self._get_custom_css_dest(app)

            if app_src.exists() and has_root:
                yield self.task(
                    name=f"merge:{app}",
                    doc=f"merge root and {app} {CUSTOM_CSS}",
                    file_dep=[root_src, app_src],
                    targets=[dest],
                    actions=[(self._merge_css, [root_src, app_src, dest])],
                )
            elif app_src.exists():
                yield self.task(
                    name=f"copy:{app}",
                    doc=f"copy {CUSTOM_CSS} to output",
                    file_dep=[app_src],
                    targets=[dest],
                    actions=[(self.copy_one, [app_src, dest])],
                )
            else:
                yield self.task(
                    name=f"prune:{app}",
                    doc=f"remove stale {app} {CUSTOM_CSS}",
                    actions=[(self._delete_if_exists, [dest])],
                )

    def post_build(self, manager):
        """Inject or remove the custom.css <link> tag from index.html files."""
        for app in [None, *manager.apps]:
            app_dir = manager.output_dir / app if app else manager.output_dir
            index_file = app_dir / INDEX_HTML
            if not index_file.exists():
                continue

            css_dest = self._desired_css_dest(app)
            file_dep = [index_file]
            if css_dest is not None and css_dest.exists():
                file_dep.append(css_dest)

            yield self.task(
                name=f"patch:{index_file.relative_to(manager.output_dir)}",
                doc=f"patch custom.css link in {index_file.name}",
                file_dep=file_dep,
                actions=[(self._patch_css_link, [index_file, css_dest])],
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

    def _delete_if_exists(self, path: Path):
        """Delete one file if it exists."""
        if path.exists():
            self.delete_one(path)
            self.log.debug(f"[lite] [customcss] removed stale file {path}")

    def _get_custom_css_src(self, app: str | None) -> Path:
        """Get the source custom.css path for a given app (or root if None)."""
        base = self.manager.lite_dir / app if app else self.manager.lite_dir
        return base / CUSTOM_CSS

    def _get_custom_css_dest(self, app: str | None) -> Path:
        """Get the destination custom.css path for a given app (or root if None)."""
        base = self.manager.output_dir / app if app else self.manager.output_dir
        return base / "static" / CUSTOM_CSS

    def _desired_css_dest(self, app: str | None) -> Path | None:
        """Get the CSS destination that should be linked by an app index."""
        root_src = self._get_custom_css_src(None)
        app_src = self._get_custom_css_src(app) if app else None

        if app_src is not None and app_src.exists():
            return self._get_custom_css_dest(app)
        if root_src.exists():
            return self._get_custom_css_dest(None)
        return None

    def _patch_css_link(self, index_file: Path, css_dest: Path | None):
        """Ensure custom.css link presence matches the current source state."""
        content = index_file.read_text(**UTF8)
        if _HEAD_CLOSE_RE.search(content) is None:
            self.log.warning(f"[lite] [customcss] no </head> found in {index_file}, skipping")
            return

        patched = _CUSTOM_CSS_LINK_RE.sub("", content)

        if css_dest is not None and css_dest.exists():
            rel_path = self._get_relative_css_path(index_file, css_dest)
            css_hash = self._get_file_hash(css_dest)[:8]
            link_tag = (
                f'    <link id="{CUSTOM_CSS_LINK_ID}" '
                f'rel="stylesheet" '
                f'href="{rel_path}?_={css_hash}">\n'
            )
            patched = _HEAD_CLOSE_RE.sub(lambda m: f"{link_tag}{m.group(0)}", patched, count=1)
            self.log.debug(f"[lite] [customcss] injected link into {index_file}")
        else:
            self.log.debug(f"[lite] [customcss] removed link from {index_file}")

        if patched == content:
            return
        index_file.write_text(patched, **UTF8)
        self.maybe_timestamp(index_file)

    def _get_relative_css_path(self, index_file: Path, css_dest: Path) -> str:
        """Calculate the relative path from an index.html to the custom.css file."""
        rel = Path(os.path.relpath(css_dest, index_file.parent))
        return rel.as_posix()

    def _get_file_hash(self, path: Path) -> str:
        """Calculate a SHA256 hash of a file for cache busting."""
        return hashlib.sha256(path.read_bytes()).hexdigest()
