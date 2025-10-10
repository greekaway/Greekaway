#!/usr/bin/env node
// tools/upload_to_s3.js
// Upload one or more files to an S3 bucket using AWS SDK v3

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

async function upload(bucket, files) {
  if (!bucket) throw new Error('S3 bucket not provided');
  const client = new S3Client({}); // relies on AWS env vars or shared credentials
  for (const f of files) {
    const key = path.basename(f);
    const body = fs.createReadStream(f);
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body });
    await client.send(cmd);
    console.log('Uploaded', f, '-> s3://'+bucket+'/'+key);
  }
}

if (require.main === module) {
  const bucket = process.env.S3_BUCKET;
  const files = process.argv.slice(2);
  if (!bucket) {
    console.error('S3_BUCKET env var not set');
    process.exit(2);
  }
  if (!files || files.length === 0) {
    console.error('Provide files to upload');
    process.exit(2);
  }
  upload(bucket, files).catch(err => { console.error(err && err.stack ? err.stack : err); process.exit(1); });
}
