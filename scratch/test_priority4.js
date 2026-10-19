const fs = require('fs');
const path = require('path');

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

async function runTests() {
  console.log('=== STARTING PRIORITY 4 AUTOMATED TEST SUITE ===\n');
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
    const timestamp = Date.now();
    const userA_email = `p4_usera_${timestamp}@example.com`;
    const userB_email = `p4_userb_${timestamp}@example.com`;
    const password = 'Password123!';

    // 1. Register User A and User B
    console.log('1. Registering Users...');
    const regA = await request(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `userA_${timestamp}`, email: userA_email, password })
    });
    assert(regA.status === 201, 'User A registered');

    const loginA = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA_email, password })
    });
    assert(loginA.status === 200, 'User A logged in');
    const tokenA = loginA.data.token;

    const regB = await request(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `userB_${timestamp}`, email: userB_email, password })
    });
    assert(regB.status === 201, 'User B registered');

    const loginB = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB_email, password })
    });
    assert(loginB.status === 200, 'User B logged in');
    const tokenB = loginB.data.token;

    // 2. User A Uploads File (v1)
    console.log('\n2. User A uploads file (v1)...');
    const form1 = new FormData();
    const fileBlob1 = new Blob(['Initial Version Content 1'], { type: 'text/plain' });
    form1.append('files', fileBlob1, 'document_v1.txt');

    const upload1 = await request(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: form1
    });
    if (upload1.status !== 201) console.log('Upload1 status:', upload1.status, upload1.data);
    assert(upload1.status === 201, 'File v1 uploaded');
    const fileId = upload1.data.files[0]._id;

    // 3. User A Uploads New Version (v2)
    console.log('\n3. User A uploads Version 2...');
    const form2 = new FormData();
    const fileBlob2 = new Blob(['Updated Content Version 2'], { type: 'text/plain' });
    form2.append('versionFile', fileBlob2, 'document_v2.txt');
    form2.append('changeSummary', 'Added section 2');

    const uploadV2 = await request(`${BASE_URL}/files/${fileId}/versions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: form2
    });
    if (uploadV2.status !== 201) console.log('uploadV2 status:', uploadV2.status, uploadV2.data);
    assert(uploadV2.status === 201, 'Version 2 uploaded');
    assert(uploadV2.data.version === 2, 'Version incremented to 2');

    // 4. User A Uploads Version 3
    console.log('\n4. User A uploads Version 3...');
    const form3 = new FormData();
    const fileBlob3 = new Blob(['Final Content Version 3'], { type: 'text/plain' });
    form3.append('versionFile', fileBlob3, 'document_v3.txt');
    form3.append('changeSummary', 'Final Polish');

    const uploadV3 = await request(`${BASE_URL}/files/${fileId}/versions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: form3
    });
    assert(uploadV3.status === 201, 'Version 3 uploaded');
    assert(uploadV3.data.version === 3, 'Version incremented to 3');

    // 5. Fetch Version History
    console.log('\n5. Fetch Version History...');
    const versionsRes = await request(`${BASE_URL}/files/${fileId}/versions`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(versionsRes.status === 200, 'Version history fetched');
    assert(versionsRes.data.versions.length === 3, 'Contains 3 versions in history');
    assert(versionsRes.data.versions[0].versionNumber === 3 && versionsRes.data.versions[0].isCurrent, 'v3 is current version');
    assert(versionsRes.data.versions[1].versionNumber === 2, 'v2 in history');
    assert(versionsRes.data.versions[2].versionNumber === 1, 'v1 in history');

    // 6. Preview and Download older versions
    console.log('\n6. Preview and Download older versions...');
    const prevV1 = await request(`${BASE_URL}/files/${fileId}/versions/1/preview`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(prevV1.status === 200 && prevV1.data === 'Initial Version Content 1', 'v1 preview streams correct initial content');

    const dlV2 = await request(`${BASE_URL}/files/${fileId}/versions/2/download`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(dlV2.status === 200 && dlV2.data === 'Updated Content Version 2', 'v2 download returns correct v2 content');

    // 7. Restore Version 1 (Creates v4 without deleting v1, v2, v3)
    console.log('\n7. Restore Version 1 as new Version 4...');
    const restoreRes = await request(`${BASE_URL}/files/${fileId}/versions/1/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(restoreRes.status === 200, 'Version 1 restored successfully');
    assert(restoreRes.data.newVersion === 4, 'Restoration created new Version 4');

    const versionsAfterRestore = await request(`${BASE_URL}/files/${fileId}/versions`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(versionsAfterRestore.data.versions.length === 4, 'History preserved: 4 total versions exist');
    assert(versionsAfterRestore.data.versions[0].versionNumber === 4 && versionsAfterRestore.data.versions[0].isCurrent, 'v4 is new active version');

    // Check content of current active file matches v1 content
    const currentPreview = await request(`${BASE_URL}/files/preview/${fileId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(currentPreview.data === 'Initial Version Content 1', 'Active file content matches restored v1 content');

    // 8. Soft Delete to Recycle Bin
    console.log('\n8. Soft Delete File to Recycle Bin...');
    const deleteRes = await request(`${BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(deleteRes.status === 200, 'File soft-deleted (moved to trash)');

    // Verify it is excluded from active files list
    const activeFilesRes = await request(`${BASE_URL}/files`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(activeFilesRes.data.files.length === 0, 'Trashed file excluded from active files list');

    // Verify it appears in Trash list
    const trashRes = await request(`${BASE_URL}/files/trash`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(trashRes.status === 200, 'Trash items fetched');
    assert(trashRes.data.items.length === 1 && trashRes.data.items[0]._id === fileId, 'File is present in Recycle Bin');

    // 9. Restore file from Recycle Bin
    console.log('\n9. Restore file from Recycle Bin...');
    const restoreFileRes = await request(`${BASE_URL}/files/trash/${fileId}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(restoreFileRes.status === 200, 'File restored from trash');

    const activeFilesAfterRestore = await request(`${BASE_URL}/files`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(activeFilesAfterRestore.data.files.length === 1, 'File is back in active files list');

    // 10. Folder Soft Delete and Restore
    console.log('\n10. Folder Soft Delete and Restore...');
    const folderRes = await request(`${BASE_URL}/files/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'TrashTestFolder' })
    });
    const folderId = folderRes.data.folder._id;

    // Delete folder
    const delFolderRes = await request(`${BASE_URL}/files/folders/${folderId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(delFolderRes.status === 200, 'Folder soft-deleted to Recycle Bin');

    const trashFoldersRes = await request(`${BASE_URL}/files/trash`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(trashFoldersRes.data.items.some(i => i._id === folderId), 'Folder is present in Recycle Bin');

    // Restore folder
    const restoreFolderRes = await request(`${BASE_URL}/files/folders/trash/${folderId}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(restoreFolderRes.status === 200, 'Folder restored from Recycle Bin');

    // 11. Permanent Delete & Empty Trash
    console.log('\n11. Permanent Delete & Empty Trash...');
    // Delete file again
    await request(`${BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    const permDel = await request(`${BASE_URL}/files/trash/${fileId}/permanent`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(permDel.status === 200, 'File permanently deleted from disk and DB');

    // Verify it no longer exists anywhere
    const trashAfterPerm = await request(`${BASE_URL}/files/trash`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(!trashAfterPerm.data.items.some(i => i._id === fileId), 'File removed completely from Recycle Bin');

    // 12. Security & IDOR Testing
    console.log('\n12. Security & IDOR Authorization Tests...');
    // User B attempts to access User A's folder in trash or versions
    const unauthVersion = await request(`${BASE_URL}/files/${fileId}/versions`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(unauthVersion.status === 404 || unauthVersion.status === 403, 'Unauthorized user cannot access private version history (IDOR protected)');

    const unauthTrashRestore = await request(`${BASE_URL}/files/folders/trash/${folderId}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(unauthTrashRestore.status === 404 || unauthTrashRestore.status === 403, 'Unauthorized user cannot restore another user items from trash');

    console.log(`\n=== ALL TESTS FINISHED: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err) {
    console.error('Fatal error in test script:', err);
  }
}

runTests();
