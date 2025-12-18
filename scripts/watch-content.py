#!/usr/bin/env python
"""Watch the examples directory and rebuild JupyterLite when content changes."""

import shutil
import subprocess
import sys
from pathlib import Path

from watchfiles import watch

# Paths
ROOT = Path(__file__).parent.parent
EXAMPLES_DIR = ROOT / "examples"
SITE_DIR = ROOT / "_site"
APP_BUILD = ROOT / "app" / "build"


def should_ignore(path: Path) -> bool:
    """Check if the path should be ignored."""
    ignore_patterns = {".cache", ".jupyterlite.doit.db", "__pycache__", ".git"}
    path_str = str(path)
    return any(pattern in path_str for pattern in ignore_patterns)


def setup_symlink():
    """Set up the _site/build -> app/build symlink, preserving schema files."""
    build_dir = SITE_DIR / "build"

    # If already a symlink, nothing to do
    if build_dir.is_symlink():
        return

    # Copy schema files to app/build before symlinking
    schema_src = build_dir / "schemas" / "all_federated.json"
    schema_dest = APP_BUILD / "schemas" / "all_federated.json"
    if schema_src.exists():
        schema_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(schema_src, schema_dest)

    # Remove _site/build directory
    if build_dir.exists():
        shutil.rmtree(build_dir)

    # Create symlink
    build_dir.symlink_to(Path("..") / "app" / "build")
    print("🔗 Symlink created: _site/build -> ../app/build")


def rebuild():
    """Run jupyter lite build and restore the symlink."""
    print("\n🔄 Content changed, rebuilding...")

    cmd = [
        "jupyter",
        "lite",
        "build",
        "--app-archive",
        "app",
        "--lite-dir",
        "examples",
        "--contents",
        "examples",
        "--output-dir",
        "_site",
    ]

    try:
        subprocess.run(cmd, cwd=ROOT, check=True)
        print("✅ Build complete")
        setup_symlink()
    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")


def main():
    """Main entry point."""
    if not EXAMPLES_DIR.exists():
        print(f"Error: {EXAMPLES_DIR} does not exist")
        sys.exit(1)

    # Set up symlink on startup
    setup_symlink()

    print(f"👀 Watching {EXAMPLES_DIR} for content changes...")
    print("Press Ctrl+C to stop\n")

    try:
        for changes in watch(EXAMPLES_DIR, debounce=1000, step=100):
            # Filter out ignored paths
            relevant_changes = [
                (change_type, path)
                for change_type, path in changes
                if not should_ignore(Path(path))
            ]

            if relevant_changes:
                rebuild()

    except KeyboardInterrupt:
        print("\n👋 Stopped watching")


if __name__ == "__main__":
    main()
