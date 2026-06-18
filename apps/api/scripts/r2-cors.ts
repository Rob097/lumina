/**
 * r2-cors — set the CORS policy on the R2 bucket so browsers can do the presigned PUT (upload) and GET
 * (read results) cross-origin from any merchant storefront. The presigned URL (signed, short-lived,
 * single-key) is the security boundary, and sign-upload already gates issuance by site_key + Origin, so
 * AllowedOrigins '*' is the correct multi-tenant setting. Run:
 *   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
 *   pnpm -F @lumina/api exec tsx scripts/r2-cors.ts
 */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main(): Promise<void> {
  const accountId = reqEnv('R2_ACCOUNT_ID');
  const bucket = reqEnv('R2_BUCKET');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: reqEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: reqEnv('R2_SECRET_ACCESS_KEY'),
    },
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`✓ CORS set on bucket "${bucket}"`);

  const got = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log(JSON.stringify(got.CORSRules, null, 2));
}

main().catch((e: unknown) => {
  console.error('FAILED ✗');
  console.error(e);
  process.exit(1);
});
