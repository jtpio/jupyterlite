/**
 * Script to copy Python distribution files to the dist/ folder.
 *
 * This replaces the doit dist task for copying wheel and sdist files
 * from each Python package to a central dist/ directory.
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const PY_PACKAGES = ['jupyterlite-core', 'jupyterlite'];

// Ensure dist directory exists
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy wheel and sdist files from each Python package
for (const pkg of PY_PACKAGES) {
  const pkgDist = path.join(__dirname, '..', 'py', pkg, 'dist');
  if (fs.existsSync(pkgDist)) {
    for (const file of fs.readdirSync(pkgDist)) {
      if (file.endsWith('.whl') || file.endsWith('.tar.gz')) {
        fs.copyFileSync(path.join(pkgDist, file), path.join(DIST_DIR, file));
        console.log(`Copied ${file}`);
      }
    }
  }
}

console.log(`Distribution files copied to ${DIST_DIR}`);
