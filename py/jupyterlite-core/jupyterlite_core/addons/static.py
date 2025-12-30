"""a JupyterLite addon for jupyterlab core"""

import json
import re
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

import doit
from traitlets import Instance, default

from ..constants import JUPYTERLITE_JSON, UTF8
from .base import BaseAddon


class StaticAddon(BaseAddon):
    """Copy the core "gold master" artifacts into the output folder"""

    app_archive = Instance(
        Path,
        help=(
            """The path to a custom npm-style tarball (e.g. with `package/package.json`) """
            """or a directory containing the app. """
            """This may alternately be specified with the `$JUPYTERLITE_APP_ARCHIVE` """
            """environment variable."""
        ),
    ).tag(config=True)

    __all__ = ["pre_init", "init", "post_init", "pre_status"]

    @property
    def _is_app_archive_dir(self):
        """Check if app_archive is a directory instead of an archive file."""
        return self.app_archive is not None and self.app_archive.is_dir()

    def pre_status(self, manager):
        yield self.task(
            name=JUPYTERLITE_JSON,
            actions=[
                lambda: print(
                    f"""    app dir:         {self.app_archive}"""
                    if self._is_app_archive_dir
                    else (
                        f"""    tarball:         {self.app_archive.name} """
                        f"""{int(self.app_archive.stat().st_size / (1024 * 1024))}MB"""
                        if self.app_archive.exists()
                        else "    tarball:        none"
                    )
                ),
                lambda: print(f"""    output:          {self.manager.output_dir}"""),
                lambda: print(f"""    lite dir:        {self.manager.lite_dir}"""),
                lambda: print(f"""    apps:            {", ".join(self.manager.apps)}"""),
                lambda: print(f"""    sourcemaps:      {not self.manager.no_sourcemaps}"""),
                lambda: print(
                    f"""    unused packages: {not self.manager.no_unused_shared_packages}"""
                ),
            ],
        )

    def _validate_app_archive_dir(self):
        pkg_json_path = self.app_archive / "package.json"
        if not pkg_json_path.exists():
            return (
                "[static] App archive directory must contain a package.json at its root: "
                f"{pkg_json_path}"
            )

        try:
            pkg_data = json.loads(pkg_json_path.read_text(**UTF8))
        except json.JSONDecodeError as err:
            return f"[static] Invalid package.json in app archive: {err}"

        jupyterlite_meta = pkg_data.get("jupyterlite") or {}
        apps = jupyterlite_meta.get("apps")
        if not isinstance(apps, list):
            return "[static] App archive package.json must contain a 'jupyterlite.apps' list"

        return None

    def _validate_app_archive_file(self):
        if not self.app_archive.is_file():
            return (
                f"[static] App archive must be a file (tarball) or a directory: {self.app_archive}"
            )

        try:
            with tarfile.open(str(self.app_archive), "r:*") as tar:
                tar.getmember("package/package.json")
        except KeyError:
            return "[static] App archive tarball must contain package/package.json"
        except tarfile.TarError as err:
            return f"[static] Invalid app archive tarball: {err}"

        return None

    def _validate_app_archive(self):
        if self.app_archive is None:
            msg = "[static] No app archive configured"
            self.log.error(msg)
            print(msg, file=sys.stderr)
            return False

        if not self.app_archive.exists():
            msg = f"[static] App archive path does not exist: {self.app_archive}"
            self.log.error(msg)
            print(msg, file=sys.stderr)
            return False

        error = (
            self._validate_app_archive_dir()
            if self._is_app_archive_dir
            else self._validate_app_archive_file()
        )
        if error:
            self.log.error(error)
            print(error, file=sys.stderr)
            return False

        return True

    def pre_init(self, manager):
        """well before anything else, we need to ensure that the output_dir exists
        and is empty (if the baseline tarball has changed)
        """
        output_dir = manager.output_dir

        task_kwargs = dict(
            name="output_dir",
            doc="ensure output dir exists and is clean",
            actions=[
                (self._validate_app_archive, []),
                lambda: [output_dir.exists() and shutil.rmtree(output_dir), None][-1],
                (doit.tools.create_folder, [output_dir]),
            ],
            # If the output dir was removed, this task must run again.
            targets=[output_dir],
        )

        if self._is_app_archive_dir:
            # A directory-based app archive is primarily a development workflow.
            # Always reset the output directory to avoid stale assets and to avoid
            # interacting with any symlinked output (e.g. _site/build -> app/build).
            task_kwargs["uptodate"] = [False]
        else:
            task_kwargs["file_dep"] = [self.app_archive]
            task_kwargs["uptodate"] = [
                doit.tools.config_changed(
                    dict(
                        apps=self.manager.apps,
                        no_sourcemaps=self.manager.no_sourcemaps,
                        no_unused_shared_packages=self.manager.no_unused_shared_packages,
                    )
                )
            ]

        yield self.task(**task_kwargs)

    def init(self, manager):
        """unpack and copy the tarball files into the output_dir"""
        if self._is_app_archive_dir:
            yield self.task(
                name="copy",
                doc=f"copy JupyterLite app from {self.app_archive}",
                actions=[(self._copy_from_dir, [])],
                targets=[manager.output_dir / JUPYTERLITE_JSON],
            )
        else:
            yield self.task(
                name="unpack",
                doc=f"unpack a 'gold master' JupyterLite from {self.app_archive.name}",
                actions=[(self._unpack_from_archive, [])],
                file_dep=[self.app_archive],
                targets=[manager.output_dir / JUPYTERLITE_JSON],
            )

    def post_init(self, manager):
        """maybe remove sourcemaps, or all static assets if an app is not installed"""
        output_dir = manager.output_dir

        if self._is_app_archive_dir:
            pkg_json_path = self.app_archive / "package.json"
            pkg_data = json.loads(pkg_json_path.read_text(**UTF8))
        else:
            with tarfile.open(str(self.app_archive), "r:gz") as tar:
                pkg_data = json.loads(tar.extractfile(tar.getmember("package/package.json")).read())

        all_apps = set(pkg_data["jupyterlite"]["apps"])
        mgr_apps = set(manager.apps if manager.apps else all_apps)

        for not_an_app in mgr_apps - all_apps:
            self.log.warn(f"[static] app '{not_an_app}' is not one of: {all_apps}")

        apps_to_remove = all_apps - mgr_apps
        app_prune_task_dep = []

        if apps_to_remove and self.manager.no_unused_shared_packages:
            shared_prune_name = "prune:shared-packages"
            app_prune_task_dep = [f"{self.manager.task_prefix}post_init:static:{shared_prune_name}"]
            yield self.task(
                name=shared_prune_name,
                actions=[(self.prune_unused_shared_packages, [all_apps, apps_to_remove])],
            )

        for to_remove in apps_to_remove:
            app = output_dir / to_remove
            app_build = output_dir / "build" / to_remove
            yield self.task(
                task_dep=app_prune_task_dep,
                name=f"prune:{app}",
                actions=[(self.delete_one, [app, app_build])],
            )

    @default("app_archive")
    def _default_app_archive(self):
        return self.manager.app_archive

    def _copy_from_dir(self):
        """copy the app directory into the output dir"""
        output_dir = self.manager.output_dir
        self.copy_one(self.app_archive, output_dir)
        self.maybe_timestamp(output_dir)

    def _unpack_from_archive(self):
        """extract the original static assets into the output dir"""
        output_dir = self.manager.output_dir

        with tempfile.TemporaryDirectory() as td:
            tdp = Path(td)
            self.extract_one(self.app_archive, tdp)
            self.copy_one(tdp / "package", output_dir)

        self.maybe_timestamp(output_dir)

    def prune_unused_shared_packages(self, all_apps, apps_to_remove):
        """manually remove unused webpack chunks from shared packages"""
        chunk_pattern = r'"(\d+)":"([\da-f]+)"'
        used_chunks = {}
        removed_used_chunks = {}
        build_dir = self.manager.output_dir / "build"

        for app in all_apps:
            bundle = build_dir / app / "bundle.js"
            if not bundle.exists():  # pragma: no cover
                continue
            bundle_txt = bundle.read_text(**UTF8)
            chunks = dict(re.findall(chunk_pattern, bundle_txt, re.VERBOSE))
            if app in apps_to_remove:
                removed_used_chunks.update(chunks)
            else:
                used_chunks.update(chunks)

        for chunk_id, chunk_hash in sorted(removed_used_chunks.items()):
            if chunk_id in used_chunks:
                continue
            unused = sorted(build_dir.glob(f"{chunk_id}.{chunk_hash}.*"))
            if unused:
                self.log.debug(
                    f"[static] pruning unused shared package {chunk_id}: {len(unused)} files"
                )
                self.delete_one(*unused)
