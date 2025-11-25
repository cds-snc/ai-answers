import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const extensions = ['.js', '.jsx', '.json'];

// Directories to scan for files
const sourceDirs = [
    'src',
    'server',
    'api',
    'services',
    'agents',
    'models',
    'middleware',
    'config'
];

// Entry points
const entryPoints = [
    path.join(rootDir, 'src', 'index.js'),
    path.join(rootDir, 'server', 'server.js')
];

// Helper to recursively get files
function getFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '__tests__') {
                getFiles(filePath, fileList);
            }
        } else {
            if (extensions.includes(path.extname(file)) &&
                !file.endsWith('.test.js') &&
                !file.endsWith('.spec.js') &&
                file !== 'setupTests.js') {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

// Get all potential files
let allFiles = [];
sourceDirs.forEach(d => {
    allFiles = allFiles.concat(getFiles(path.join(rootDir, d)));
});

const allFilesSet = new Set(allFiles);
const usedFiles = new Set();

// Queue for traversal
const queue = [...entryPoints];
queue.forEach(f => {
    if (fs.existsSync(f)) {
        usedFiles.add(f);
    }
});

// Regex for imports
// import X from '...'
// import '...'
// require('...')
// import('...')
// export ... from '...'
const importRegex = /from\s+['"]([^'"]+)['"]|import\s*\(['"]([^'"]+)['"]\)|require\s*\(['"]([^'"]+)['"]\)|import\s+['"]([^'"]+)['"]/g;

function resolvePath(sourceFile, importPath) {
    if (!importPath.startsWith('.')) {
        // Check if it's an absolute import from src (CRA feature)
        const srcAbs = path.join(rootDir, 'src', importPath);
        if (fs.existsSync(srcAbs) || extensions.some(ext => fs.existsSync(srcAbs + ext))) {
            return resolveFile(srcAbs);
        }
        // Check if it resolves to a file in our sourceDirs (e.g. if there are aliases we missed)
        // But for now, assume node_modules if not relative and not in src
        return null;
    }

    const absPath = path.resolve(path.dirname(sourceFile), importPath);
    return resolveFile(absPath);
}

function resolveFile(absPath) {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) return absPath;
    for (const ext of extensions) {
        if (fs.existsSync(absPath + ext)) return absPath + ext;
    }
    // index file
    const indexBase = path.join(absPath, 'index');
    for (const ext of extensions) {
        if (fs.existsSync(indexBase + ext)) return indexBase + ext;
    }
    return null;
}

// BFS traversal
let head = 0;
while (head < queue.length) {
    const currentFile = queue[head++];
    if (!fs.existsSync(currentFile)) continue;

    try {
        const content = fs.readFileSync(currentFile, 'utf-8');
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1] || match[2] || match[3] || match[4];
            if (importPath) {
                const resolved = resolvePath(currentFile, importPath);
                if (resolved && allFilesSet.has(resolved) && !usedFiles.has(resolved)) {
                    usedFiles.add(resolved);
                    queue.push(resolved);
                }
            }
        }
    } catch (e) {
        console.error(`Error reading ${currentFile}: ${e.message}`);
    }
}

const unused = allFiles.filter(f => !usedFiles.has(f));
console.log('Unused files:');
if (unused.length === 0) {
    console.log('No unused files found.');
} else {
    unused.forEach(f => console.log(path.relative(rootDir, f)));
}
