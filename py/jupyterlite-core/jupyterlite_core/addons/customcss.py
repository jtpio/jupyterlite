"""A JupyterLite addon for custom.css support.

This mirrors JupyterLab's custom.css feature, allowing users to provide
custom CSS styling by placing a file at {lite_dir}/custom/custom.css.

The CSS file will be copied to the output and a <link> tag will be
injected into all index.html files.
"""

import hashlib
import re
from pathlib import Path
from typing import TYPE_CHECKING

from ..constants import CUSTOM_CSS, CUSTOM_DIR, INDEX_HTML, UTF8
from .base import BaseAddon

# Pattern to match existing custom CSS link tags (for replacement)
CUSTOM_CSS_LINK_PATTERN = re.compile(
    r'\s*<link\s+id="jupyterlite-custom-css"[^>]*>\s*', re.IGNORECASE
)

if TYPE_CHECKING:
    from ..manager import LiteManager


class CustomCSSAddon(BaseAddon):
    """Support for custom.css styling, similar to JupyterLab's custom.css feature.

    Users can place a custom.css file at {lite_dir}/custom/custom.css to customize
    the appearance of their JupyterLite site. The CSS will be loaded after all
    other styles, allowing it to override default styling.
    """

    __all__ = ["status", "build", "post_build"]

    def status(self, manager: "LiteManager"):
        """Report the status of custom.css."""
        yield self.task(
            name="custom.css",
            actions=[
                lambda: print(
                    f"""    custom.css:      {self.custom_css_src}"""
                    if self.custom_css_src.exists()
                    else """    custom.css:      (none)"""
                )
            ],
        )

    def build(self, manager: "LiteManager"):
        """Copy custom.css from lite_dir to output_dir."""
        if not self.custom_css_src.exists():
            return

        yield self.task(
            name="copy",
            doc=f"copy {CUSTOM_DIR}/{CUSTOM_CSS} to output",
            file_dep=[self.custom_css_src],
            targets=[self.custom_css_dest],
            actions=[
                (self.copy_one, [self.custom_css_src, self.custom_css_dest]),
            ],
        )

    def post_build(self, manager: "LiteManager"):
        """Inject a <link> tag for custom.css into all index.html files."""
        if not self.custom_css_dest.exists():
            return

        # Get all index.html files in the output directory
        index_files = sorted(manager.output_dir.rglob(INDEX_HTML))

        if not index_files:
            return

        # Calculate hash for cache busting
        css_hash = self._get_file_hash(self.custom_css_dest)

        for index_file in index_files:
            yield self.task(
                name=f"inject:{index_file.relative_to(manager.output_dir)}",
                doc=f"inject custom.css link into {index_file.name}",
                file_dep=[self.custom_css_dest, index_file],
                actions=[
                    (self._inject_css_link, [index_file, css_hash]),
                ],
            )

    def _inject_css_link(self, index_file: Path, css_hash: str):
        """Inject a <link> tag for custom.css into an index.html file.

        This method is idempotent - it removes any existing custom CSS link
        before injecting, which also allows the cache-busting hash to be updated.
        """
        content = index_file.read_text(**UTF8)

        # Check for </head> tag
        if "</head>" not in content:
            self.log.warning(
                f"[lite] [customcss] no </head> found in {index_file}, skipping"
            )
            return

        # Remove any existing custom CSS link (for idempotency and hash updates)
        content = CUSTOM_CSS_LINK_PATTERN.sub("", content)

        # Calculate relative path from index.html to static/custom/custom.css
        rel_path = self._get_relative_css_path(index_file)

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

    def _get_relative_css_path(self, index_file: Path) -> str:
        """Calculate the relative path from an index.html to the custom.css file."""
        output_dir = self.manager.output_dir

        # Get the directory containing the index.html
        index_dir = index_file.parent

        # Calculate relative path from index_dir to the custom.css destination
        try:
            rel_path = self.custom_css_dest.relative_to(output_dir)
            index_rel = index_dir.relative_to(output_dir)

            # Count directory levels from index to root
            levels_up = len(index_rel.parts)

            if levels_up == 0:
                # index.html is at the root
                return f"./{rel_path.as_posix()}"
            else:
                # Need to go up some levels
                prefix = "/".join([".."] * levels_up)
                return f"{prefix}/{rel_path.as_posix()}"
        except ValueError:
            # Fallback to absolute-style path
            return f"/{CUSTOM_DIR}/{CUSTOM_CSS}"

    def _get_file_hash(self, path: Path) -> str:
        """Calculate a SHA256 hash of a file for cache busting."""
        return hashlib.sha256(path.read_bytes()).hexdigest()

    @property
    def custom_css_src(self) -> Path:
        """The source custom.css file in the lite directory."""
        return self.manager.lite_dir / CUSTOM_DIR / CUSTOM_CSS

    @property
    def custom_css_dest(self) -> Path:
        """The destination for custom.css in the output directory."""
        return self.manager.output_dir / "static" / CUSTOM_DIR / CUSTOM_CSS
