const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url || (API_BASE + options.path));
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', reject);

    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(data));
      } else {
        req.write(data);
      }
    }
    req.end();
  });
}

function buildMultipartFormData(fields = {}, files = []) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  for (const file of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname || 'files'}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`));
    parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  return {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    },
    body
  };
}

async function runPriority5Tests() {
  console.log('=== STARTING PRIORITY 5 TEST SUITE (STORAGE + PERFORMANCE) ===\n');

  const rand = Math.floor(Math.random() * 1000000);
  const userEmail = `p5_user_${rand}@test.com`;
  const userPassword = 'TestPassword123!';
  let userToken = '';
  let userId = '';

  // 1. Register & Login
  console.log('1. User Registration & Initial Quota...');
  const regRes = await request({
    path: '/auth/register',
    method: 'POST'
  }, {
    username: `p5user_${rand}`,
    email: userEmail,
    password: userPassword
  });
  assert(regRes.status === 201, 'User registered');

  const loginRes = await request({
    path: '/auth/login',
    method: 'POST'
  }, {
    email: userEmail,
    password: userPassword
  });
  assert(loginRes.status === 200 && loginRes.json.token, 'User logged in');
  userToken = loginRes.json.token;
  userId = loginRes.json.user.id;

  // 2. Test Initial Analytics & Storage
  console.log('\n2. Testing Initial Storage Analytics...');
  const initAnalytics = await request({
    path: '/files/analytics',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert(initAnalytics.status === 200, 'Analytics endpoint returns HTTP 200');
  assert(initAnalytics.json.stats.usedStorage === 0, 'Initial used storage is 0 bytes');
  assert(initAnalytics.json.stats.storageQuota === 500 * 1024 * 1024, 'Default storage quota is 500MB');
  assert(initAnalytics.json.stats.percentUsed === 0, 'Initial percent used is 0%');
  assert(initAnalytics.json.storageByType.documents.count === 0, 'Documents count is 0');

  // 3. Upload File & Verify Accurate Storage Calculation
  console.log('\n3. Uploading Sample File and Checking Usage...');
  const testFilePayload = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const uploadForm = buildMultipartFormData({}, [{
    fieldname: 'files',
    filename: 'test_report.pdf',
    contentType: 'application/pdf',
    content: testFilePayload
  }]);

  const uploadRes = await request({
    path: '/files/upload',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      ...uploadForm.headers
    }
  }, uploadForm.body);

  assert(uploadRes.status === 201, 'File uploaded successfully');
  const fileId = uploadRes.json.file._id;
  const fileSize = uploadRes.json.file.size;

  const afterUploadAnalytics = await request({
    path: '/files/analytics',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert(afterUploadAnalytics.json.stats.usedStorage === fileSize, `Storage calculated accurately (${fileSize} bytes)`);
  assert(afterUploadAnalytics.json.storageByType.documents.count === 1, 'Documents category count incremented to 1');
  assert(afterUploadAnalytics.json.storageByType.documents.size === fileSize, 'Documents category size matches file size');
  assert(afterUploadAnalytics.json.largestFiles.length === 1, 'Largest files list contains uploaded file');

  // 4. Upload Version and Verify Storage Includes Versions
  console.log('\n4. Uploading Version and Checking Aggregated Storage...');
  const v2Payload = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Version 2 Content Extended) >>\nendobj\ntrailer\n<<>>\n%%EOF');
  const v2Form = buildMultipartFormData({ changeSummary: 'Updated version 2' }, [{
    fieldname: 'versionFile',
    filename: 'test_report.pdf',
    contentType: 'application/pdf',
    content: v2Payload
  }]);

  const v2Res = await request({
    path: `/files/${fileId}/versions`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      ...v2Form.headers
    }
  }, v2Form.body);
  assert(v2Res.status === 201, 'Version 2 uploaded');

  const afterV2Analytics = await request({
    path: '/files/analytics',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const expectedTotal = fileSize + v2Payload.length;
  assert(afterV2Analytics.json.stats.usedStorage === expectedTotal, `Total storage accounts for active file + version history (${expectedTotal} bytes)`);

  // 5. Soft Delete to Recycle Bin and Verify Storage Still Accounted For Until Purged
  console.log('\n5. Trashing File and Checking Storage Persistence...');
  const trashRes = await request({
    path: `/files/${fileId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert(trashRes.status === 200, 'File soft deleted to Recycle Bin');

  const afterTrashAnalytics = await request({
    path: '/files/analytics',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert(afterTrashAnalytics.json.stats.usedStorage === expectedTotal, 'Trashed files and versions correctly counted in total physical usage');
  assert(afterTrashAnalytics.json.stats.trashedFilesCount === 1, 'Trashed files count is 1');

  // Restore file
  await request({
    path: `/files/trash/${fileId}/restore`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });

  // 6. Resumable / Chunked Upload Testing
  console.log('\n6. Testing Resumable / Chunked Upload Pipeline...');
  const chunkInitRes = await request({
    path: '/files/upload/chunk-init',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userToken}` }
  }, {
    originalName: 'large_dataset.txt',
    totalSize: 300,
    chunkSize: 100,
    totalChunks: 3
  });

  assert(chunkInitRes.status === 200, 'Chunk upload initialized');
  const uploadId = chunkInitRes.json.uploadId;
  assert(uploadId && chunkInitRes.json.totalChunks === 3, 'Received valid upload session with 3 chunks');

  // Upload Chunk 0
  const chunk0Form = buildMultipartFormData({ uploadId, chunkIndex: '0' }, [{
    fieldname: 'chunk',
    filename: 'part_0',
    contentType: 'application/octet-stream',
    content: Buffer.from('A'.repeat(100))
  }]);
  const c0Res = await request({
    path: '/files/upload/chunk',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      ...chunk0Form.headers
    }
  }, chunk0Form.body);
  assert(c0Res.status === 200 && c0Res.json.progress === 33, 'Chunk 0 uploaded (33% progress)');

  // Upload Chunk 1
  const chunk1Form = buildMultipartFormData({ uploadId, chunkIndex: '1' }, [{
    fieldname: 'chunk',
    filename: 'part_1',
    contentType: 'application/octet-stream',
    content: Buffer.from('B'.repeat(100))
  }]);
  const c1Res = await request({
    path: '/files/upload/chunk',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      ...chunk1Form.headers
    }
  }, chunk1Form.body);
  assert(c1Res.status === 200 && c1Res.json.progress === 67, 'Chunk 1 uploaded (67% progress)');

  // Upload Chunk 2
  const chunk2Form = buildMultipartFormData({ uploadId, chunkIndex: '2' }, [{
    fieldname: 'chunk',
    filename: 'part_2',
    contentType: 'application/octet-stream',
    content: Buffer.from('C'.repeat(100))
  }]);
  const c2Res = await request({
    path: '/files/upload/chunk',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      ...chunk2Form.headers
    }
  }, chunk2Form.body);
  assert(c2Res.status === 200 && c2Res.json.progress === 100, 'Chunk 2 uploaded (100% progress)');

  // Complete Chunked Upload
  const completeRes = await request({
    path: '/files/upload/chunk-complete',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userToken}` }
  }, { uploadId });
  assert(completeRes.status === 201, 'Chunked upload assembled and finalized successfully');
  assert(completeRes.json.file.size === 300, 'Assembled file has exact total size of 300 bytes');

  // Test Chunk Upload Cancellation
  const cancelInitRes = await request({
    path: '/files/upload/chunk-init',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userToken}` }
  }, {
    originalName: 'cancel_test.txt',
    totalSize: 200,
    chunkSize: 100,
    totalChunks: 2
  });
  const cancelUploadId = cancelInitRes.json.uploadId;
  const cancelRes = await request({
    path: '/files/upload/chunk-cancel',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userToken}` }
  }, { uploadId: cancelUploadId });
  assert(cancelRes.status === 200, 'Cancelled chunk upload cleaned up session');

  // 7. Storage Quota Exceeded Enforcement
  console.log('\n7. Storage Quota Exceeded Prevention & Error Messaging...');
  // Register User C with tiny quota simulation (via API or test)
  const quotaUserRand = Math.floor(Math.random() * 1000000);
  const quotaUserEmail = `quota_user_${quotaUserRand}@test.com`;
  await request({
    path: '/auth/register',
    method: 'POST'
  }, {
    username: `quota_${quotaUserRand}`,
    email: quotaUserEmail,
    password: userPassword
  });
  const qLoginRes = await request({
    path: '/auth/login',
    method: 'POST'
  }, {
    email: quotaUserEmail,
    password: userPassword
  });
  const qToken = qLoginRes.json.token;

  // Upload chunk-init with totalSize larger than quota (e.g. 600MB)
  const quotaInitRes = await request({
    path: '/files/upload/chunk-init',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${qToken}` }
  }, {
    originalName: 'overflow.txt',
    totalSize: 600 * 1024 * 1024,
    chunkSize: 5 * 1024 * 1024,
    totalChunks: 120
  });
  assert(quotaInitRes.status === 400, 'Rejected upload initialization when exceeding user storage quota');
  assert(quotaInitRes.json.message.includes('Storage quota exceeded'), 'Returned clear explanatory quota error message');

  // 8. Performance & Pagination Verification
  console.log('\n8. Performance & Server-Side Pagination Verification...');
  const listRes = await request({
    path: '/files?page=1&limit=5',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert(listRes.status === 200, 'Listing endpoint returns HTTP 200');
  assert(listRes.json.storageStats !== undefined, 'Listing endpoint includes real-time storageStats');
  assert(Array.isArray(listRes.json.files), 'Files returned as paginated array');

  // 9. Security & Authorization Checks
  console.log('\n9. Security & Quota IDOR Hardening...');
  // Unauthorized chunk complete attempt
  const unauthComplete = await request({
    path: '/files/upload/chunk-complete',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${qToken}` }
  }, { uploadId: 'non-existent-or-other-user-session' });
  assert(unauthComplete.status === 404, 'Cannot complete unowned or non-existent chunk session');

  console.log(`\n=== PRIORITY 5 TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runPriority5Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
