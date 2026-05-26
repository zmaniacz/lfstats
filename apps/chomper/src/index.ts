// TDF file ingestion CLI
// Usage: pnpm ingest -- <file.tdf>

const [tdfPath] = process.argv.slice(2);

if (!tdfPath) {
  console.error("Usage: pnpm ingest -- <file.tdf>");
  process.exit(1);
}

console.log(`Ingesting: ${tdfPath}`);
