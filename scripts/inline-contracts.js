/**
 * Post-packaging step: converts .es contract files in dist/ to .es.js modules
 * so consumers can import them without custom Vite loaders.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

if (!existsSync(distDir)) {
    console.log('dist/ not found, skipping contract inlining.');
    process.exit(0);
}

function processDir(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            processDir(fullPath);
        } else if (entry.name.endsWith('.es')) {
            const content = readFileSync(fullPath, 'utf-8');
            const jsPath = fullPath + '.js';
            writeFileSync(jsPath, `export default ${JSON.stringify(content)};\n`);
            console.log(`  Inlined: ${entry.name} → ${entry.name}.js`);
        }
    }
}

// Also fix imports in .js files from '.es' to '.es.js'
function fixImports(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            fixImports(fullPath);
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.es.js')) {
            let content = readFileSync(fullPath, 'utf-8');
            const original = content;
            // Replace: from './path.es' → from './path.es.js'
            // Replace: from "../path.es" → from "../path.es.js"
            content = content.replace(/(from\s+['"])([^'"]*\.es)(['"])/g, '$1$2.js$3');
            if (content !== original) {
                writeFileSync(fullPath, content);
                console.log(`  Fixed imports in: ${entry.name}`);
            }
        }
    }
}

console.log('Inlining .es contracts...');
processDir(distDir);
console.log('Fixing imports...');
fixImports(distDir);
console.log('Done.');
