import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname } from 'path';

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveImportPath(baseDir, importPath) {
  // importPath is relative like './encryption' or './types'
  const fullPath = join(baseDir, importPath);

  // Check if it's a directory with index.js
  const indexPath = join(fullPath, 'index.js');
  if (await exists(indexPath)) {
    return `${importPath}/index.js`;
  }

  // Otherwise just add .js
  return `${importPath}.js`;
}

async function fixImports(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await fixImports(fullPath);
    } else if (entry.name.endsWith('.js')) {
      let content = await readFile(fullPath, 'utf8');
      const baseDir = dirname(fullPath);

      // Fix relative imports to add .js extension
      const importMatches = content.matchAll(/from\s+['"](\.[^'"]+)['"]/g);
      for (const match of importMatches) {
        const importPath = match[1];
        if (!importPath.endsWith('.js') && !importPath.endsWith('.json')) {
          const resolved = await resolveImportPath(baseDir, importPath);
          content = content.replace(
            new RegExp(`from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
            `from '${resolved}'`
          );
        }
      }

      // Fix export from
      const exportMatches = content.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g);
      for (const match of exportMatches) {
        const importPath = match[1];
        if (!importPath.endsWith('.js') && !importPath.endsWith('.json')) {
          const resolved = await resolveImportPath(baseDir, importPath);
          content = content.replace(
            new RegExp(`export\\s+\\*\\s+from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
            `export * from '${resolved}'`
          );
        }
      }

      await writeFile(fullPath, content);
    }
  }
}

fixImports('./dist').then(() => console.log('Fixed ESM imports'));
