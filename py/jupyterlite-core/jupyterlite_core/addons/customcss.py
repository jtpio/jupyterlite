"""A JupyterLite addon for custom.css support.

This mirrors JupyterLab's custom.css feature, allowing users to provide
custom CSS styling by placing a file at {lite_dir}/custom.css.

The CSS file will be copied to the output and a <link> tag will be
injected into all index.html files.

Per-app custom CSS is also supported by placing files at
{lite_dir}/{app}/custom.css (e.g., lab/custom.css, repl/custom.css).
App-specific CSS takes precedence over the root custom.css for that app.
"""

import hashlib
import re
from pathlib import Path
from typing import TYPE_CHECKING

from ..constants import CUSTOM_CSS, INDEX_HTML, UTF8
from .base import BaseAddon

# Pattern to match existing custom CSS link tags (for replacement)
CUSTOM_CSS_LINK_PATTERN = re.compile(
    r'\s*<link\s+id="jupyterlite-custom-css"[^>]*>\s*', re.IGNORECASE
)

if TYPE_CHECKING:
    from ..manager import LiteManager


class CustomCSSAddon(BaseAddon):
    """Support for custom.css styling, similar to JupyterLab's custom.css feature.

    Users can place a custom.css file at {lite_dir}/custom.css to customize
    the appearance of their JupyterLite site. The CSS will be loaded after all
    other styles, allowing it to override default styling.

    Per-app custom CSS is also supported:
    - {lite_dir}/custom.css - applies to all apps (unless app has its own)
    - {lite_dir}/lab/custom.css - applies only to the lab app
    - {lite_dir}/repl/custom.css - applies only to the repl app
    - etc.
    """

    __all__ = ["status", "build", "post_build"]

    def status(self, manager: "LiteManager"):
        """Report the status of custom.css files."""
        found = []
        for app in [None, *manager.apps]:
            src = self._get_custom_css_src(app)
            if src.exists():
                found.append(src)

        yield self.task(
            name="custom.css",
            actions=[lambda: print(f"""    {CUSTOM_CSS}: {len(found)}""")],
        )

    def build(self, manager: "LiteManager"):
        """Copy custom.css files from lite_dir to output_dir."""
        for app in [None, *manager.apps]:
            src = self._get_custom_css_src(app)
            if not src.exists():
                continue

            dest = self._get_custom_css_dest(app)

            yield self.task(
                name=f"copy:{app or 'root'}",
                doc=f"copy {CUSTOM_CSS} to output",
                file_dep=[src],
                targets=[dest],
                actions=[
                    (self.copy_one, [src, dest]),
                ],
            )

    def post_build(self, manager: "LiteManager"):
        """Inject a <link> tag for custom.css into relevant index.html files."""
        # Determine which apps have their own custom.css
        apps_with_css = set()
        for app in [None, *manager.apps]:
            dest = self._get_custom_css_dest(app)
            if dest.exists():
                apps_with_css.add(app)

        if not apps_with_css:
            return

        # Get all index.html files in the output directory
        index_files = sorted(manager.output_dir.rglob(INDEX_HTML))

        if not index_files:
            return

        for index_file in index_files:
            # Determine which app this index.html belongs to
            app_for_index = self._get_app_for_index(index_file)

            # Determine which CSS to use for this index.html
            # App-specific CSS takes precedence over root CSS
            if app_for_index in apps_with_css:
                css_app = app_for_index
            elif None in apps_with_css:
                css_app = None
            else:
                # No CSS available for this index.html
                continue

            css_dest = self._get_custom_css_dest(css_app)
            css_hash = self._get_file_hash(css_dest)

            yield self.task(
                name=f"inject:{index_file.relative_to(manager.output_dir)}",
                doc=f"inject custom.css link into {index_file.name}",
                file_dep=[css_dest, index_file],
                actions=[
                    (self._inject_css_link, [index_file, css_dest, css_hash]),
                ],
            )

    def _get_custom_css_src(self, app: str | None) -> Path:
        """Get the source custom.css path for a given app (or root if None)."""
        if app:
            return self.manager.lite_dir / app / CUSTOM_CSS
        return self.manager.lite_dir / CUSTOM_CSS

    def _get_custom_css_dest(self, app: str | None) -> Path:
        """Get the destination custom.css path for a given app (or root if None)."""
        if app:
            return self.manager.output_dir / app / "static" / CUSTOM_CSS
        return self.manager.output_dir / "static" / CUSTOM_CSS

    def _get_app_for_index(self, index_file: Path) -> str | None:
        """Determine which app an index.html file belongs to.

        Returns None if the index.html is at the root level.
        """
        try:
            rel_path = index_file.relative_to(self.manager.output_dir)
            parts = rel_path.parts
            if len(parts) == 1:
                # Root index.html
                return None
            # First part is the app directory
            return parts[0]
        except ValueError:
            return None

    def _inject_css_link(self, index_file: Path, css_dest: Path, css_hash: str):
        """Inject a <link> tag for custom.css into an index.html file.

        This method is idempotent - it removes any existing custom CSS link
        before injecting, which also allows the cache-busting hash to be updated.
        """
        content = index_file.read_text(**UTF8)

        # Check for </head> tag
        if "</head>" not in content:
            self.log.warning(f"[lite] [customcss] no </head> found in {index_file}, skipping")
            return

        # Remove any existing custom CSS link (for idempotency and hash updates)
        content = CUSTOM_CSS_LINK_PATTERN.sub("", content)

        # Calculate relative path from index.html to the CSS file
        rel_path = self._get_relative_css_path(index_file, css_dest)

        # Create the link tag with cache-busting hash
        link_tag = (
            f'    <link id="jupyterlite-custom-css" '
            f'rel="stylesheet" '
            f'href="{rel_path}?_={css_hash[:8]}">\n'
        )

        # Inject before </head> so custom styles come last and can override others
        new_content = content.replace("</head>", f"{link_tag}  </head>")

        index_file.write_text(new_content, **UTF8)
        self.maybe_timestamp(index_file)
        self.log.debug(f"[lite] [customcss] injected link into {index_file}")

    def _get_relative_css_path(self, index_file: Path, css_dest: Path) -> str:
        """Calculate the relative path from an index.html to the custom.css file."""
        output_dir = self.manager.output_dir

        # Get the directory containing the index.html
        index_dir = index_file.parent

        try:
            css_rel = css_dest.relative_to(output_dir)
            index_rel = index_dir.relative_to(output_dir)

            # Count directory levels from index to root
            levels_up = len(index_rel.parts)

            if levels_up == 0:
                # index.html is at the root
                return f"./{css_rel.as_posix()}"
            else:
                # Need to go up some levels
                prefix = "/".join([".."] * levels_up)
                return f"{prefix}/{css_rel.as_posix()}"
        except ValueError:
            # Fallback to absolute-style path
            return f"/static/{CUSTOM_CSS}"

    def _get_file_hash(self, path: Path) -> str:
        """Calculate a SHA256 hash of a file for cache busting."""
        return hashlib.sha256(path.read_bytes()).hexdigest()
