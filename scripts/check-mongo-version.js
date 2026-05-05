import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
  const uri = process.env.MONGODB_URI || process.env.DOCDB_URI;
  if (!uri) {
    console.error('No MONGODB_URI or DOCDB_URI in env.');
    process.exit(1);
  }

  const isDocDb = !process.env.MONGODB_URI && !!process.env.DOCDB_URI;
  const opts = isDocDb
    ? { tls: true, tlsCAFile: '/app/global-bundle.pem', retryWrites: false }
    : { directConnection: true };

  console.log('Connecting to:', uri.replace(/\/\/[^@]+@/, '//<creds>@'));
  console.log('Mode:', isDocDb ? 'DocumentDB (TLS)' : 'MongoDB');

  await mongoose.connect(uri, opts);
  const admin = mongoose.connection.db.admin();

  const buildInfo = await admin.buildInfo();
  console.log('\nbuildInfo.version:', buildInfo.version);
  console.log('buildInfo.versionArray:', buildInfo.versionArray);
  if (buildInfo.gitVersion) console.log('buildInfo.gitVersion:', buildInfo.gitVersion);

  // DocumentDB reports its emulated version here. The real signal is whether
  // specific aggregation operators we want to use are actually supported.
  const probes = [
    {
      name: '$percentile (Mongo 7+; not in DocumentDB)',
      pipeline: [
        { $documents: [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }] },
        { $group: { _id: null, p: { $percentile: { input: '$x', p: [0.5], method: 'approximate' } } } },
      ],
    },
    {
      name: '$median (Mongo 7+)',
      pipeline: [
        { $documents: [{ x: 1 }, { x: 2 }, { x: 3 }] },
        { $group: { _id: null, m: { $median: { input: '$x', method: 'approximate' } } } },
      ],
    },
  ];

  console.log('\nOperator support:');
  for (const probe of probes) {
    try {
      await mongoose.connection.db.aggregate(probe.pipeline).toArray();
      console.log(`  ✓ ${probe.name}`);
    } catch (err) {
      console.log(`  ✗ ${probe.name} — ${err.codeName || err.message}`);
    }
  }

  await mongoose.disconnect();
}

check().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
