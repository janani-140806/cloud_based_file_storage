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

async function runFullSuite() {
  console.log('=== RUNNING FULL END-TO-END REGRESSION TEST SUITE ===\n');
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
    const userA_email = `full_a_${ts}@example.com`;
    const userB_email = `full_b_${ts}@example.com`;
    const password = 'Password123!';

    // Priority 1: Auth & User creation
    console.log('1. Authentication & Route Hardening...');
    await request(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `userA_${ts}`, email: userA_email, password })
    });
    const loginA = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA_email, password })
    });
    const tokenA = loginA.data.token;

    await request(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `userB_${ts}`, email: userB_email, password })
    });
    const loginB = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB_email, password })
    });
    const tokenB = loginB.data.token;

    const meRes = await request(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(meRes.status === 200 && meRes.data.email === userA_email, 'Protected /me returns authenticated user');

    // Priority 2: Folders & Multi-Upload & File Operations
    console.log('\n2. Folders, Uploads & File Management...');
    const folderRes = await request(`${BASE_URL}/files/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Project_Alpha' })
    });
    assert(folderRes.status === 201, 'Folder creation works');
    const folderId = folderRes.data.folder._id;

    const form = new FormData();
    form.append('files', new Blob(['Hello World text'], { type: 'text/plain' }), 'note.txt');
    form.append('files', new Blob(['console.log("hello");'], { type: 'text/javascript' }), 'script.js');
    form.append('folderId', folderId);

    const uploadRes = await request(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: form
    });
    if (uploadRes.status !== 201) console.log('uploadRes status:', uploadRes.status, uploadRes.data);
    assert(uploadRes.status === 201 && uploadRes.data.files.length === 2, 'Multi-file upload inside folder works');
    const noteId = uploadRes.data.files[0]._id;
    const scriptId = uploadRes.data.files[1]._id;

    // Rename
    const renameRes = await request(`${BASE_URL}/files/${noteId}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'meeting_notes.txt' })
    });
    assert(renameRes.status === 200 && renameRes.data.file.originalName === 'meeting_notes.txt', 'File renaming works');

    // Copy
    const copyRes = await request(`${BASE_URL}/files/${noteId}/copy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(copyRes.status === 201, 'File copying works');

    // Priority 3: Sharing & Public Link
    console.log('\n3. File Sharing & Access Permissions...');
    const shareRes = await request(`${BASE_URL}/files/${noteId}/share/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ emailOrUsername: userB_email, permission: 'view' })
    });
    assert(shareRes.status === 200, 'User A shared file with User B (view-only)');

    const sharedWithMeRes = await request(`${BASE_URL}/files/shared-with-me`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(sharedWithMeRes.data.files.length === 1 && sharedWithMeRes.data.files[0]._id === noteId, 'Shared file appears in User B "Shared With Me"');

    // User B tries to download when permission is view-only -> 403 Forbidden
    const unauthDownload = await request(`${BASE_URL}/files/download/${noteId}`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(unauthDownload.status === 403, 'User B view-only cannot download (strictly enforced)');

    // Public Link
    const linkRes = await request(`${BASE_URL}/files/${noteId}/share/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ isEnabled: true, permission: 'view', password: 'sharepassword' })
    });
    assert(linkRes.status === 200, 'Public link enabled with password');
    const linkToken = linkRes.data.shareLink.token;

    const publicWithoutPass = await request(`${BASE_URL}/files/share/public/${linkToken}`);
    assert(publicWithoutPass.status === 401 && publicWithoutPass.data.requiresPassword, 'Public link correctly requires password');

    const publicWithPass = await request(`${BASE_URL}/files/share/public/${linkToken}?password=sharepassword`);
    assert(publicWithPass.status === 200, 'Public link validated with password');

    // Priority 4: Versioning & Recycle Bin
    console.log('\n4. Version History & Recycle Bin...');
    const vForm = new FormData();
    vForm.append('versionFile', new Blob(['Meeting notes updated version 2'], { type: 'text/plain' }), 'meeting_notes.txt');
    vForm.append('changeSummary', 'Added action items');

    const vRes = await request(`${BASE_URL}/files/${noteId}/versions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: vForm
    });
    assert(vRes.status === 201 && vRes.data.version === 2, 'Version 2 created');

    const restoreVer = await request(`${BASE_URL}/files/${noteId}/versions/1/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(restoreVer.status === 200 && restoreVer.data.newVersion === 3, 'Restored v1 as new v3 without history loss');

    // Soft delete folder
    const delFolder = await request(`${BASE_URL}/files/folders/${folderId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(delFolder.status === 200, 'Folder soft-deleted to Recycle Bin');

    const trashCheck = await request(`${BASE_URL}/files/trash`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(trashCheck.data.items.length >= 2, 'Recycle Bin contains trashed folder and its files');

    // Restore folder
    const restoreFolder = await request(`${BASE_URL}/files/folders/trash/${folderId}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(restoreFolder.status === 200, 'Folder and its nested files restored from Recycle Bin');

    console.log(`\n=== FULL SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err) {
    console.error('Test suite failed:', err);
  }
}

runFullSuite();
