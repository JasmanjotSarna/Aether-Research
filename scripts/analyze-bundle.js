const fs = require('fs');
const path = require('path');

const nftFiles = [
  '.next/server/app/api/agent/route.js.nft.json',
  '.next/server/app/api/health/route.js.nft.json',
  '.next/server/app/api/pdf/route.js.nft.json',
  '.next/server/app/page.js.nft.json',
  '.next/server/app/app/page.js.nft.json',
  '.next/server/app/privacy/page.js.nft.json',
  '.next/server/app/_not-found/page.js.nft.json'
];

const allTracedFiles = new Map(); // file path -> size
const packageSizes = new Map(); // package name -> size
const routeSizes = {};

for (const nftPath of nftFiles) {
  if (!fs.existsSync(nftPath)) continue;
  const nftDir = path.dirname(nftPath);
  const data = JSON.parse(fs.readFileSync(nftPath, 'utf8'));
  let totalRouteSize = 0;
  const files = data.files || [];
  
  for (const relFile of files) {
    const absFile = path.resolve(nftDir, relFile);
    let size = 0;
    try {
      const stat = fs.statSync(absFile);
      if (stat.isFile()) {
        size = stat.size;
      }
    } catch (e) {
      // ignore missing
    }
    totalRouteSize += size;
    allTracedFiles.set(absFile, size);

    // identify package
    if (absFile.includes('node_modules')) {
      const match = absFile.match(/node_modules[\\\/](@?[^\\\/]+(?:[\\\/][^\\\/]+)?)/);
      if (match) {
        const pkgName = match[1].replace(/\\/g, '/');
        packageSizes.set(pkgName, (packageSizes.get(pkgName) || 0) + size);
      }
    } else {
      packageSizes.set('[project-src]', (packageSizes.get('[project-src]') || 0) + size);
    }
  }
  routeSizes[nftPath] = totalRouteSize;
}

console.log('=== ROUTE SIZES (SUM OF TRACED FILES) ===');
for (const [route, size] of Object.entries(routeSizes)) {
  console.log(`${route}: ${(size / (1024 * 1024)).toFixed(2)} MB (${size} bytes)`);
}

console.log('\n=== TOP 20 LARGEST TRACED PACKAGES ===');
const sortedPackages = Array.from(packageSizes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [pkg, size] of sortedPackages) {
  console.log(`${pkg}: ${(size / (1024 * 1024)).toFixed(2)} MB`);
}

console.log('\n=== TOP 20 LARGEST INDIVIDUAL TRACED FILES ===');
const sortedFiles = Array.from(allTracedFiles.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [file, size] of sortedFiles) {
  const rel = path.relative(process.cwd(), file);
  console.log(`${rel}: ${(size / (1024 * 1024)).toFixed(2)} MB`);
}

