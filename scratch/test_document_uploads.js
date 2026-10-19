const BASE_URL = 'http://localhost:5000/api';

async function request(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

// Helper to construct sample valid buffers for each format
function createMockFileBuffer(ext) {
  switch (ext) {
    case '.pdf':
      return Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    case '.png':
      // PNG magic header: \x89PNG\r\n\x1a\n
      return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);
    case '.jpg':
    case '.jpeg':
      // JPEG SOI marker: \xFF\xD8\xFF
      return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    case '.docx':
    case '.xlsx':
    case '.pptx':
      // OpenXML Zip header: PK\x03\x04
      return Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00]);
    case '.doc':
    case '.xls':
    case '.ppt':
      // OLE2 Compound Document Header
      return Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00, 0x00, 0x00]);
    case '.txt':
      return Buffer.from('Sample plain text document content.');
    default:
      return Buffer.from('Generic sample content for testing.');
  }
}

async function runDocTests() {
  console.log('=== RUNNING DOCUMENT UPLOAD & SECURITY VALIDATION SUITE ===\n');
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

  try {
    const ts = Date.now();
    const userEmail = `doctest_${ts}@example.com`;
    const password = 'Password123!';

    // 1. Auth Setup
    console.log('1. User Registration & Login...');
    await request(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `user_${ts}`, email: userEmail, password })
    });

    const loginRes = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password })
    });
    assert(loginRes.status === 200, 'User logged in');
    const token = loginRes.data.token;

    // 2. Upload Document Suite
    console.log('\n2. Testing Common Document & Media Formats Upload...');
    const testFiles = [
      { name: 'sample.pdf', ext: '.pdf', expectedMime: 'application/pdf' },
      { name: 'sample.doc', ext: '.doc', expectedMime: 'application/msword' },
      { name: 'sample.docx', ext: '.docx', expectedMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'sample.xls', ext: '.xls', expectedMime: 'application/vnd.ms-excel' },
      { name: 'sample.xlsx', ext: '.xlsx', expectedMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { name: 'sample.ppt', ext: '.ppt', expectedMime: 'application/vnd.ms-powerpoint' },
      { name: 'sample.pptx', ext: '.pptx', expectedMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { name: 'sample.txt', ext: '.txt', expectedMime: 'text/plain' },
      { name: 'sample.jpg', ext: '.jpg', expectedMime: 'image/jpeg' },
      { name: 'sample.png', ext: '.png', expectedMime: 'image/png' }
    ];

    const uploadedIds = {};

    for (const tf of testFiles) {
      const buffer = createMockFileBuffer(tf.ext);
      const form = new FormData();
      form.append('files', new Blob([buffer], { type: tf.expectedMime }), tf.name);

      const res = await request(`${BASE_URL}/files/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });

      if (res.status !== 201) {
        console.error(`  Upload failed for ${tf.name}:`, res.status, res.data);
      }

      assert(res.status === 201, `Uploaded '${tf.name}' successfully`);
      const fileDoc = res.data.files[0];
      assert(fileDoc.originalName === tf.name, `Original filename '${tf.name}' preserved in DB`);
      assert(fileDoc.mimeType === tf.expectedMime, `Correct canonical MIME type '${tf.expectedMime}' recorded`);
      assert(fileDoc.size === buffer.length, `Correct file size ${buffer.length} bytes recorded`);
      assert(fileDoc.version === 1, `Initial version recorded as 1`);
      assert(fileDoc.userId, `Owner recorded`);
      assert(fileDoc.createdAt, `Upload timestamp recorded`);

      uploadedIds[tf.name] = fileDoc._id;
    }

    // 3. Verify Download and Preview endpoints for all documents
    console.log('\n3. Testing Preview and Download for Uploaded Documents...');
    for (const tf of testFiles) {
      const id = uploadedIds[tf.name];
      const previewRes = await request(`${BASE_URL}/files/preview/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert(previewRes.status === 200, `Preview endpoint returned HTTP 200 for '${tf.name}'`);

      const downloadRes = await request(`${BASE_URL}/files/download/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      assert(downloadRes.status === 200, `Download endpoint returned HTTP 200 for '${tf.name}'`);
    }

    // 4. Security & Negative Testing
    console.log('\n4. Security & Malicious Upload Prevention Testing...');

    // A. Unsupported file type (.exe)
    const exeForm = new FormData();
    exeForm.append('files', new Blob([Buffer.from('MZ...fake exe content')], { type: 'application/x-msdownload' }), 'installer.exe');
    const exeRes = await request(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: exeForm
    });
    assert(exeRes.status === 400, 'Rejected dangerous executable (.exe) upload with HTTP 400');

    // B. Renamed Executable (evil.exe renamed to evil.pdf but containing MZ header)
    const disguisedForm = new FormData();
    const mzHeader = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable signature
    disguisedForm.append('files', new Blob([mzHeader], { type: 'application/pdf' }), 'evil_disguised.pdf');
    const disguisedRes = await request(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: disguisedForm
    });
    assert(disguisedRes.status === 400 && disguisedRes.data.message.includes('executable'), 'Blocked disguised Windows PE binary renamed as .pdf');

    // C. Renamed Linux ELF Binary
    const elfForm = new FormData();
    const elfHeader = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00]); // \x7fELF signature
    elfForm.append('files', new Blob([elfHeader], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'malware.docx');
    const elfRes = await request(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: elfForm
    });
    assert(elfRes.status === 400 && elfRes.data.message.includes('executable'), 'Blocked disguised ELF binary renamed as .docx');

    // D. Empty file (0 bytes)
    const emptyForm = new FormData();
    emptyForm.append('files', new Blob([], { type: 'text/plain' }), 'empty.txt');
    const emptyRes = await request(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: emptyForm
    });
    assert(emptyRes.status === 400 && emptyRes.data.message.includes('empty'), 'Rejected empty 0-byte file upload with clear error');

    // E. Unauthorized upload (missing token)
    const unauthForm = new FormData();
    unauthForm.append('files', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'unauth.txt');
    const unauthRes = await request(`${BASE_URL}/files/upload`, {
      method: 'POST',
      body: unauthForm
    });
    assert(unauthRes.status === 401, 'Unauthorized upload rejected with HTTP 401');

    console.log(`\n=== DOCUMENT & SECURITY SUITE FINISHED: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err) {
    console.error('Test error:', err);
  }
}

runDocTests();
