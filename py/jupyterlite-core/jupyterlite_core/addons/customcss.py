"""A JupyterLite addon for custom.css support.

Mirrors JupyterLab's custom.css feature. Users can place a custom.css file at
{lite_dir}/custom.css to customize styling. Per-app CSS is also supported via
{lite_dir}/{app}/custom.css (e.g., lab/custom.css).

When both root and app-specific CSS exist, they are merged: root CSS is included
first, followed by app-specific CSS. This allows app CSS to override root styles
via CSS cascade while inheriting common base styles.
"""

import hashlib
from html.parser import HTMLParser
from pathlib import Path

from ..constants import CUSTOM_CSS, INDEX_HTML, UTF8
from .base import BaseAddon

CUSTOM_CSS_LINK_ID = "jupyterlite-custom-css"


class CSSLinkInjector(HTMLParser):
    """HTML parser that removes existing custom CSS links and injects a new one.

    This parser rebuilds the HTML while:
    - Skipping any existing <link> tags with id="jupyterlite-custom-css"
    - Injecting a new custom CSS link tag before </head>
    """

    def __init__(self, link_tag: str):
        super().__init__(convert_charrefs=False)
        self.link_tag = link_tag
        self.output: list[str] = []
        self.head_closed = False

    def get_output(self) -> str:
        return "".join(self.output)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        if self._is_custom_css_link(tag, attrs):
            return
        self.output.append(self._build_tag(tag, attrs))

    def handle_endtag(self, tag: str):
        if tag.lower() == "head" and not self.head_closed:
            self.output.append(self.link_tag)
            self.head_closed = True
        self.output.append(f"</{tag}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]):
        if self._is_custom_css_link(tag, attrs):
            return
        self.output.append(self._build_tag(tag, attrs, self_closing=True))

    def handle_data(self, data: str):
        self.output.append(data)

    def handle_comment(self, data: str):
        self.output.append(f"<!--{data}-->")

    def handle_decl(self, decl: str):
        self.output.append(f"<!{decl}>")

    def handle_pi(self, data: str):
        self.output.append(f"<?{data}>")

    def handle_entityref(self, name: str):
        self.output.append(f"&{name};")

    def handle_charref(self, name: str):
        self.output.append(f"&#{name};")

    def _is_custom_css_link(self, tag: str, attrs: list[tuple[str, str | None]]) -> bool:
        """Check if this is our custom CSS link tag."""
        if tag.lower() != "link":
            return False
        return any(
            name.lower() == "id" and value and value.lower() == CUSTOM_CSS_LINK_ID
            for name, value in attrs
        )

    def _build_tag(
        self, tag: str, attrs: list[tuple[str, str | None]], self_closing: bool = False
    ) -> str:
        """Rebuild an HTML tag from its components."""
        if not attrs:
            return f"<{tag} />" if self_closing else f"<{tag}>"
        attr_str = " ".join(
            f'{name}="{value}"' if value is not None else name for name, value in attrs
        )
        if self_closing:
            return f"<{tag} {attr_str} />"
        return f"<{tag} {attr_str}>"


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

        index_files = sorted(manager.output_dir.rglob(INDEX_HTML))
        if not index_files:
            return

        for index_file in index_files:
            app_for_index = self._get_app_for_index(index_file)

            # Use app-specific CSS if available, otherwise fall back to root
            if app_for_index in apps_with_css:
                css_app = app_for_index
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

    def _get_app_for_index(self, index_file: Path) -> str | None:
        """Determine which app an index.html file belongs to.

        Returns None if the index.html is at the root level.
        """
        rel_path = index_file.relative_to(self.manager.output_dir)
        parts = rel_path.parts
        if len(parts) == 1:
            return None
        return parts[0]

    def _inject_css_link(self, index_file: Path, css_dest: Path, css_hash: str):
        """Inject a <link> tag for custom.css into an index.html file.

        Idempotent: removes any existing custom CSS link before injecting.
        """
        content = index_file.read_text(**UTF8)

        if "</head>" not in content.lower():
            self.log.warning(f"[lite] [customcss] no </head> found in {index_file}, skipping")
            return

        rel_path = self._get_relative_css_path(index_file, css_dest)
        link_tag = (
            f'    <link id="{CUSTOM_CSS_LINK_ID}" '
            f'rel="stylesheet" '
            f'href="{rel_path}?_={css_hash[:8]}">\n  '
        )

        parser = CSSLinkInjector(link_tag)
        parser.feed(content)
        new_content = parser.get_output()

        index_file.write_text(new_content, **UTF8)
        self.maybe_timestamp(index_file)
        self.log.debug(f"[lite] [customcss] injected link into {index_file}")

    def _get_relative_css_path(self, index_file: Path, css_dest: Path) -> str:
        """Calculate the relative path from an index.html to the custom.css file."""
        output_dir = self.manager.output_dir
        css_rel = css_dest.relative_to(output_dir)
        index_rel = index_file.parent.relative_to(output_dir)
        levels_up = len(index_rel.parts)

        if levels_up == 0:
            return f"./{css_rel.as_posix()}"

        prefix = "/".join([".."] * levels_up)
        return f"{prefix}/{css_rel.as_posix()}"

    def _get_file_hash(self, path: Path) -> str:
        """Calculate a SHA256 hash of a file for cache busting."""
        return hashlib.sha256(path.read_bytes()).hexdigest()
