import hashlib
import stat
from contextlib import suppress
from pathlib import Path
from shutil import copyfile, rmtree
from subprocess import run
from urllib.request import Request, urlopen

import jupyterlab

ROOT = Path(__file__).parent
CACHE_DIR = ROOT / ".cache" / "media"
STAGED_MEDIA_DIR = ROOT / "contents" / "media-fixtures"
JUPYTERLAB_DEMO_COMMIT = "fe0c447c1af3faa361075c2a79f1d9dfb9613ffd"
MEDIA_FIXTURES = (
    {
        "blob_sha": "8b8f6352bb0db373eb2168bbf6732a3b14d419f4",
        "name": "rocket.wav",
        "repo_path": "data/rocket.wav",
    },
    {
        "blob_sha": "f6ff5912b4d581aaa96acf65150a7acbfb3986e8",
        "name": "jupiter.mp4",
        "repo_path": "data/jupiter.mp4",
    },
)


def _git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode()
    return hashlib.sha1(header + data, usedforsecurity=False).hexdigest()


def _download_media_fixture(fixture: dict[str, str]) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached_path = CACHE_DIR / f"{fixture['blob_sha']}-{fixture['name']}"

    if cached_path.exists():
        data = cached_path.read_bytes()
        if _git_blob_sha(data) == fixture["blob_sha"]:
            return cached_path
        cached_path.unlink()

    raw_url = (
        "https://raw.githubusercontent.com/"
        f"jupyterlab/jupyterlab-demo/{JUPYTERLAB_DEMO_COMMIT}/{fixture['repo_path']}"
    )
    request = Request(  # noqa: S310 - pinned HTTPS URL to immutable upstream fixture
        raw_url,
        headers={"User-Agent": "jupyterlite-ui-tests"},
    )
    with urlopen(  # noqa: S310 - pinned HTTPS URL to immutable upstream fixture
        request, timeout=30
    ) as response:
        data = response.read()

    blob_sha = _git_blob_sha(data)
    if blob_sha != fixture["blob_sha"]:
        raise RuntimeError(
            f"Unexpected content for {fixture['name']}: got {blob_sha}, expected {fixture['blob_sha']}"
        )

    cached_path.write_bytes(data)
    return cached_path


def _stage_media_fixtures() -> None:
    rmtree(STAGED_MEDIA_DIR, ignore_errors=True)
    STAGED_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    for fixture in MEDIA_FIXTURES:
        cached_path = _download_media_fixture(fixture)
        copyfile(cached_path, STAGED_MEDIA_DIR / fixture["name"])


# Make the readonly notebook read-only before building so the Contents API
# response sets "writable": false for this file.
readonly_notebook = ROOT / "contents" / "readonly.ipynb"
readonly_notebook.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)

extra_labextensions_path = str(Path(jupyterlab.__file__).parent / "galata")

_stage_media_fixtures()

try:
    # Build the main UI tests app with content
    cmd = f"jupyter lite build --FederatedExtensionAddon.extra_labextensions_path={extra_labextensions_path}"
    run(
        cmd,
        check=True,
        shell=True,
    )

    # Build a no-content version to test for 404 errors
    # This build doesn't need Galata extensions since the test uses raw Playwright
    no_content_cmd = "jupyter lite build --config=jupyter_lite_config_no_content.json"
    run(
        no_content_cmd,
        check=True,
        shell=True,
    )
finally:
    with suppress(FileNotFoundError):
        rmtree(STAGED_MEDIA_DIR)
