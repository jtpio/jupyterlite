"""Tests for the custom CSS addon."""

import json
import re


def test_custom_css_basic(an_empty_lite_dir, script_runner):
    """Test that a root custom.css file is copied and injected."""
    css_content = """
/* Test custom CSS */
.jp-Notebook {
  background-color: #e8f5e9;
}
"""
    (an_empty_lite_dir / "custom.css").write_text(css_content)

    result = script_runner.run(
        ["jupyter", "lite", "build"],
        cwd=str(an_empty_lite_dir),
    )
    assert result.success

    output = an_empty_lite_dir / "_output"

    # Check that the CSS file was copied
    css_dest = output / "static" / "custom.css"
    assert css_dest.exists()
    assert css_dest.read_text() == css_content

    # Check that the link tag was injected into index.html files
    lab_index = output / "lab" / "index.html"
    assert lab_index.exists()
    lab_html = lab_index.read_text()
    assert 'id="jupyterlite-custom-css"' in lab_html
    assert "static/custom.css" in lab_html

    # Verify cache-busting hash is present
    match = re.search(r"custom\.css\?_=([a-f0-9]+)", lab_html)
    assert match is not None, "Cache-busting hash not found"


def test_custom_css_per_app(an_empty_lite_dir, script_runner):
    """Test that per-app custom.css files are merged with root CSS."""
    root_css = "/* Root CSS */\nbody { color: black; }"
    repl_css = "/* REPL CSS */\nbody { color: blue; }"

    (an_empty_lite_dir / "custom.css").write_text(root_css)
    (an_empty_lite_dir / "repl").mkdir()
    (an_empty_lite_dir / "repl" / "custom.css").write_text(repl_css)

    config = {"LiteBuildConfig": {"apps": ["lab", "repl"]}}
    (an_empty_lite_dir / "jupyter_lite_config.json").write_text(json.dumps(config))

    result = script_runner.run(
        ["jupyter", "lite", "build"],
        cwd=str(an_empty_lite_dir),
    )
    assert result.success

    output = an_empty_lite_dir / "_output"

    # Check root CSS exists unchanged
    root_css_dest = output / "static" / "custom.css"
    assert root_css_dest.exists()
    assert root_css_dest.read_text() == root_css

    # Check REPL CSS is merged (root + app)
    repl_css_dest = output / "repl" / "static" / "custom.css"
    assert repl_css_dest.exists()
    repl_merged = repl_css_dest.read_text()
    # Merged CSS should contain both root and app CSS
    assert "/* Root CSS */" in repl_merged
    assert "body { color: black; }" in repl_merged
    assert "/* REPL CSS */" in repl_merged
    assert "body { color: blue; }" in repl_merged
    # Root CSS should come before app CSS (for cascade override)
    assert repl_merged.index("Root CSS") < repl_merged.index("REPL CSS")

    # Lab should use root CSS
    lab_index = output / "lab" / "index.html"
    lab_html = lab_index.read_text()
    assert "../static/custom.css" in lab_html

    # REPL should use its own merged CSS (relative to repl/, not root)
    repl_index = output / "repl" / "index.html"
    repl_html = repl_index.read_text()
    assert 'href="static/custom.css' in repl_html


def test_custom_css_status(an_empty_lite_dir, script_runner):
    """Test that jupyter lite status reports custom.css files."""
    (an_empty_lite_dir / "custom.css").write_text("/* CSS */")

    result = script_runner.run(
        ["jupyter", "lite", "status"],
        cwd=str(an_empty_lite_dir),
    )
    assert result.success
    assert "custom.css: 1" in result.stdout


def test_custom_css_idempotent(an_empty_lite_dir, script_runner):
    """Test that rebuilding doesn't duplicate the link tag."""
    (an_empty_lite_dir / "custom.css").write_text("/* CSS */")

    # Build twice
    for _ in range(2):
        result = script_runner.run(
            ["jupyter", "lite", "build"],
            cwd=str(an_empty_lite_dir),
        )
        assert result.success

    output = an_empty_lite_dir / "_output"
    lab_index = output / "lab" / "index.html"
    lab_html = lab_index.read_text()

    # Should only have one custom CSS link
    matches = re.findall(r'id="jupyterlite-custom-css"', lab_html)
    assert len(matches) == 1


def test_custom_css_app_only(an_empty_lite_dir, script_runner):
    """Test that app-only CSS works without root CSS."""
    repl_css = "/* REPL only */\nbody { color: blue; }"

    (an_empty_lite_dir / "repl").mkdir()
    (an_empty_lite_dir / "repl" / "custom.css").write_text(repl_css)

    config = {"LiteBuildConfig": {"apps": ["lab", "repl"]}}
    (an_empty_lite_dir / "jupyter_lite_config.json").write_text(json.dumps(config))

    result = script_runner.run(
        ["jupyter", "lite", "build"],
        cwd=str(an_empty_lite_dir),
    )
    assert result.success

    output = an_empty_lite_dir / "_output"

    # No root CSS should exist
    root_css_dest = output / "static" / "custom.css"
    assert not root_css_dest.exists()

    # REPL CSS should exist standalone (not merged)
    repl_css_dest = output / "repl" / "static" / "custom.css"
    assert repl_css_dest.exists()
    assert repl_css_dest.read_text() == repl_css

    # Lab should have no CSS link
    lab_index = output / "lab" / "index.html"
    lab_html = lab_index.read_text()
    assert 'id="jupyterlite-custom-css"' not in lab_html

    # REPL should have CSS link
    repl_index = output / "repl" / "index.html"
    repl_html = repl_index.read_text()
    assert 'id="jupyterlite-custom-css"' in repl_html


def test_no_custom_css(an_empty_lite_dir, script_runner):
    """Test that build works without custom.css."""
    result = script_runner.run(
        ["jupyter", "lite", "build"],
        cwd=str(an_empty_lite_dir),
    )
    assert result.success

    output = an_empty_lite_dir / "_output"

    # No custom CSS should be present
    css_dest = output / "static" / "custom.css"
    assert not css_dest.exists()

    # No link tag should be injected
    lab_index = output / "lab" / "index.html"
    lab_html = lab_index.read_text()
    assert 'id="jupyterlite-custom-css"' not in lab_html
