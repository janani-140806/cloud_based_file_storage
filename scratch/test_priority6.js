const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
    console.log('====================================================');
    console.log('🚀 RUNNING PRIORITY 6 TEST SUITE: ADVANCED SEARCH & DUPLICATE DETECTION');
    console.log('====================================================\n');

    const testTimestamp = Date.now();
    const userA = {
        username: `searchUserA_${testTimestamp}`,
        email: `searchA_${testTimestamp}@example.com`,
        password: 'Password123!'
    };
    const userB = {
        username: `searchUserB_${testTimestamp}`,
        email: `searchB_${testTimestamp}@example.com`,
        password: 'Password123!'
    };

    let tokenA = '';
    let tokenB = '';

    // 1. Register & Login Users
    console.log('1. Registering and authenticating Test Users...');
    await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userA)
    });
    const loginARes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userA.email, password: userA.password })
    });
    const loginA = await loginARes.json();
    tokenA = loginA.token;

    await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userB)
    });
    const loginBRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userB.email, password: userB.password })
    });
    const loginB = await loginBRes.json();
    tokenB = loginB.token;

    console.log('   ✅ User A and User B registered and logged in successfully.\n');

    // 2. Prepare test files with proper magic bytes and controlled content hashes
    console.log('2. Creating sample test files for search & duplicates testing...');
    const tmpDir = path.join(__dirname, 'tmp_test_p6');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Proper Magic Bytes:
    // PDF: %PDF-1.5 ...
    // DOCX/ZIP: PK\x03\x04 ...
    // PNG: \x89PNG\r\n\x1a\n ...
    const pdfMagic = Buffer.from('%PDF-1.5\n%HeaderPayload\n');
    const docxMagic = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);

    const identicalContent1 = Buffer.concat([pdfMagic, Buffer.from('UNIQUE_CONTENT_ALPHA_1234567890_IDENTICAL_PAYLOAD')]); // Hash Alpha
    const identicalContent2 = Buffer.concat([docxMagic, Buffer.from('UNIQUE_CONTENT_BETA_9876543210_IDENTICAL_PAYLOAD')]);  // Hash Beta
    const differentContentSameName = Buffer.concat([docxMagic, Buffer.from('DIFFERENT_CONTENT_FOR_SAME_FILENAME_XYZ_9999999')]);

    const fileAlpha1Path = path.join(tmpDir, 'Project_Report_Q1.pdf');
    fs.writeFileSync(fileAlpha1Path, identicalContent1);

    const fileAlpha2Path = path.join(tmpDir, 'Copy_of_Project_Report_Q1.pdf');
    fs.writeFileSync(fileAlpha2Path, identicalContent1); // Identical to Alpha 1

    const fileAlpha3RenamedPath = path.join(tmpDir, 'Completely_Different_Name.pdf');
    fs.writeFileSync(fileAlpha3RenamedPath, identicalContent1); // Identical to Alpha 1 & 2!

    const fileBeta1Path = path.join(tmpDir, 'Invoice_October_2026.docx');
    fs.writeFileSync(fileBeta1Path, identicalContent2);

    const fileBeta2Path = path.join(tmpDir, 'Invoice_October_2026_Backup.docx');
    fs.writeFileSync(fileBeta2Path, identicalContent2); // Identical to Beta 1

    const fileUniqueImage = path.join(tmpDir, 'photo_vacation_hawaii.png');
    fs.writeFileSync(fileUniqueImage, Buffer.concat([pngMagic, Buffer.from('PNG_IMAGE_BODY_1122334455')]));

    const fileUniqueText = path.join(tmpDir, 'notes_project_architecture.txt');
    fs.writeFileSync(fileUniqueText, 'ARCHITECTURE NOTES: MongoDB + Express + Node.js');

    console.log('   ✅ Test payload files prepared on disk.\n');

    // Helper to upload with native fetch & FormData
    async function upload(token, filePath, customName = null, folderId = null) {
        const formData = new FormData();
        const buffer = fs.readFileSync(filePath);
        const fileName = customName || path.basename(filePath);
        const blob = new Blob([buffer]);
        formData.append('files', blob, fileName);
        if (folderId) formData.append('folderId', folderId);

        const res = await fetch(`${BASE_URL}/files/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');
        return data.files[0];
    }

    // 3. Create folder structure
    console.log('3. Setting up folder structure for User A...');
    const folderRes = await fetch(`${BASE_URL}/files/folders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({ name: 'Finance_2026' })
    });
    const folderData = await folderRes.json();
    const financeFolderId = folderData._id || folderData.folder?._id;
    console.log(`   ✅ Created folder "Finance_2026" (ID: ${financeFolderId})\n`);

    // 4. Upload files
    console.log('4. Uploading files with duplicate contents and distinct attributes...');
    const uploadedAlpha1 = await upload(tokenA, fileAlpha1Path);
    const uploadedAlpha2 = await upload(tokenA, fileAlpha2Path);
    const uploadedAlpha3 = await upload(tokenA, fileAlpha3RenamedPath, null, financeFolderId);

    const uploadedBeta1 = await upload(tokenA, fileBeta1Path);
    const uploadedBeta2 = await upload(tokenA, fileBeta2Path);

    // Upload same filename but different content in folder
    fs.writeFileSync(fileBeta1Path, differentContentSameName);
    const uploadedSameNameDiff = await upload(tokenA, fileBeta1Path, 'Invoice_October_2026.docx', financeFolderId);
    // Restore beta file content
    fs.writeFileSync(fileBeta1Path, identicalContent2);

    const uploadedImage = await upload(tokenA, fileUniqueImage);
    const uploadedText = await upload(tokenA, fileUniqueText);

    console.log('   ✅ Uploaded:');
    console.log(`      - Alpha 1: "${uploadedAlpha1.originalName}" (Hash: ${uploadedAlpha1.hash?.substring(0, 10)}...)`);
    console.log(`      - Alpha 2: "${uploadedAlpha2.originalName}" (Hash: ${uploadedAlpha2.hash?.substring(0, 10)}...)`);
    console.log(`      - Alpha 3: "${uploadedAlpha3.originalName}" in folder (Hash: ${uploadedAlpha3.hash?.substring(0, 10)}...)`);
    console.log(`      - Beta 1: "${uploadedBeta1.originalName}" (Hash: ${uploadedBeta1.hash?.substring(0, 10)}...)`);
    console.log(`      - Beta 2: "${uploadedBeta2.originalName}" (Hash: ${uploadedBeta2.hash?.substring(0, 10)}...)`);
    console.log(`      - Same name diff content: "${uploadedSameNameDiff.originalName}" in folder (Hash: ${uploadedSameNameDiff.hash?.substring(0, 10)}...)`);
    console.log(`      - Unique image: "${uploadedImage.originalName}"`);
    console.log(`      - Unique text: "${uploadedText.originalName}"\n`);

    // 5. Test Advanced Search Capabilities
    console.log('5. TESTING ADVANCED SEARCH FILTERS...');

    // Test 5.1: Partial & Case-Insensitive Filename Matching
    console.log('   5.1 Testing Partial & Case-Insensitive search for "project"...');
    const searchRes1 = await fetch(`${BASE_URL}/files?search=project&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const searchData1 = await searchRes1.json();
    const names1 = searchData1.files.map(f => f.originalName);
    console.log('       Results found:', names1);
    if (names1.includes('Project_Report_Q1.pdf') && names1.includes('Copy_of_Project_Report_Q1.pdf') && names1.includes('notes_project_architecture.txt')) {
        console.log('       ✅ Partial case-insensitive search PASSED.');
    } else {
        throw new Error('Partial filename search failed: expected matches not returned.');
    }

    // Test 5.2: Specific Extension Filter
    console.log('   5.2 Testing Extension filter for "docx"...');
    const searchResExt = await fetch(`${BASE_URL}/files?ext=docx&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const searchDataExt = await searchResExt.json();
    const extFiles = searchDataExt.files;
    console.log(`       Found ${extFiles.length} docx files:`, extFiles.map(f => f.originalName));
    if (extFiles.length >= 3 && extFiles.every(f => f.originalName.endsWith('.docx'))) {
        console.log('       ✅ Extension filter PASSED.');
    } else {
        throw new Error('Extension filter failed.');
    }

    // Test 5.3: MIME Type Filter
    console.log('   5.3 Testing MIME type filter for "image"...');
    const searchResType = await fetch(`${BASE_URL}/files?type=image&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const searchDataType = await searchResType.json();
    const imageFiles = searchDataType.files;
    console.log(`       Found ${imageFiles.length} image files:`, imageFiles.map(f => f.originalName));
    if (imageFiles.length === 1 && imageFiles[0].originalName === 'photo_vacation_hawaii.png') {
        console.log('       ✅ MIME type filter PASSED.');
    } else {
        throw new Error('MIME type filter failed.');
    }

    // Test 5.4: Multi-Filter Combination (Type + Search + Date preset)
    console.log('   5.4 Testing Multi-Filter combination (type=document + search=Report + date=today)...');
    const multiFilterRes = await fetch(`${BASE_URL}/files?type=document&search=Report&date=today&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const multiData = await multiFilterRes.json();
    const multiFiles = multiData.files;
    console.log(`       Found ${multiFiles.length} files:`, multiFiles.map(f => f.originalName));
    if (multiFiles.length >= 2 && multiFiles.every(f => f.originalName.includes('Report'))) {
        console.log('       ✅ Multi-filter combination PASSED.');
    } else {
        throw new Error('Multi-filter combination failed.');
    }

    // Test 5.5: Size Range Filter
    console.log('   5.5 Testing Size Range filter (sizeRange=small -> < 1MB)...');
    const sizeRangeRes = await fetch(`${BASE_URL}/files?sizeRange=small&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const sizeRangeData = await sizeRangeRes.json();
    if (sizeRangeData.files.length >= 5) {
        console.log(`       ✅ Size range filter (< 1MB) PASSED (${sizeRangeData.files.length} matching files).`);
    } else {
        throw new Error('Size range filter failed.');
    }

    // Test 5.6: Sorting (Name A-Z vs Size Desc)
    console.log('   5.6 Testing Sorting (sort=name-asc)...');
    const sortRes = await fetch(`${BASE_URL}/files?sort=name-asc&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const sortData = await sortRes.json();
    const sortedNames = sortData.files.map(f => f.originalName);
    const expectedFirst = [...sortedNames].sort((a, b) => a.localeCompare(b))[0];
    if (sortedNames[0] === expectedFirst) {
        console.log(`       ✅ Sort name-asc PASSED (First item: "${sortedNames[0]}").`);
    } else {
        throw new Error('Sort by name failed.');
    }

    // 6. Test Duplicate File Detection
    console.log('\n6. TESTING DUPLICATE FILE DETECTION (SHA-256 Content Hashing)...');
    const dupRes = await fetch(`${BASE_URL}/files/duplicates`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const dupData = await dupRes.json();
    console.log(`   - Total Duplicate Groups: ${dupData.totalGroups}`);
    console.log(`   - Total Redundant Copies: ${dupData.totalDuplicateFiles - dupData.totalGroups}`);
    console.log(`   - Total Wasted Storage: ${dupData.totalWastedStorage} bytes`);

    if (dupData.totalGroups < 2) {
        throw new Error(`Expected at least 2 duplicate groups, got ${dupData.totalGroups}`);
    }

    // Find Alpha Group (should have 3 files: Project_Report_Q1.pdf, Copy_of_Project_Report_Q1.pdf, Completely_Different_Name.pdf)
    const alphaGroup = dupData.duplicateGroups.find(g => g.files.some(f => f.originalName === 'Completely_Different_Name.pdf'));
    if (!alphaGroup) throw new Error('Alpha duplicate group not found.');
    console.log(`   ✅ Group 1 (Alpha content): ${alphaGroup.count} files (Different filenames with identical content detected)`);
    console.log(`      Files in group:`, alphaGroup.files.map(f => `${f.originalName} in [${f.folderName}]`));

    if (alphaGroup.count !== 3) {
        throw new Error(`Expected 3 files in Alpha duplicate group, got ${alphaGroup.count}`);
    }

    // Verify Beta Group (should have 2 files: Invoice_October_2026.docx at root, Invoice_October_2026_Backup.docx at root)
    // Note: Invoice_October_2026.docx in Finance_2026 folder has different content, so it must NOT be in the group!
    const betaGroup = dupData.duplicateGroups.find(g => g.files.some(f => f.originalName === 'Invoice_October_2026_Backup.docx'));
    if (!betaGroup) throw new Error('Beta duplicate group not found.');
    console.log(`   ✅ Group 2 (Beta content): ${betaGroup.count} files`);
    console.log(`      Files in group:`, betaGroup.files.map(f => `${f.originalName} in [${f.folderName}]`));

    const betaHasDifferentContent = betaGroup.files.some(f => f.originalName === 'Invoice_October_2026.docx' && f.folderName === 'Finance_2026');
    if (betaHasDifferentContent) {
        throw new Error('Same filename with different content was incorrectly flagged as duplicate!');
    } else {
        console.log('   ✅ Verified: Same filename with different content was correctly NOT grouped as duplicate.');
    }

    // Test 6.2: Search filter with "duplicatesOnly=true"
    console.log('\n   6.2 Testing Search with duplicatesOnly=true filter...');
    const dupOnlySearchRes = await fetch(`${BASE_URL}/files?duplicatesOnly=true&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const dupOnlyData = await dupOnlySearchRes.json();
    const dupOnlyFiles = dupOnlyData.files;
    console.log(`       Found ${dupOnlyFiles.length} duplicate files in vault:`, dupOnlyFiles.map(f => f.originalName));
    if (dupOnlyFiles.length >= 5) {
        console.log('       ✅ "duplicatesOnly=true" search filter PASSED.');
    } else {
        throw new Error('duplicatesOnly filter failed to return all duplicate items.');
    }

    // 7. Test Safe Duplicate Resolution (Clean Group to Recycle Bin)
    console.log('\n7. TESTING SAFE DUPLICATE RESOLUTION (Clean Group)...');
    const keepFile = alphaGroup.files[0];
    const duplicateCopies = alphaGroup.files.slice(1);
    const duplicateCopyIds = duplicateCopies.map(f => f._id);

    console.log(`   Keeping primary file: "${keepFile.originalName}" (${keepFile._id})`);
    console.log(`   Moving ${duplicateCopyIds.length} redundant copies to Recycle Bin:`, duplicateCopies.map(f => f.originalName));

    const cleanRes = await fetch(`${BASE_URL}/files/duplicates/clean-group`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({
            keepFileId: keepFile._id,
            duplicateFileIds: duplicateCopyIds,
            permanent: false // Safely move to Recycle Bin
        })
    });
    const cleanData = await cleanRes.json();

    console.log(`   Clean Response: ${cleanData.message}`);
    if (cleanData.removedCount !== duplicateCopyIds.length) {
        throw new Error(`Expected ${duplicateCopyIds.length} cleaned items, got ${cleanData.removedCount}`);
    }
    console.log('   ✅ Clean group endpoint returned success.');

    // Verify Primary File is still active
    const verifyPrimaryRes = await fetch(`${BASE_URL}/files?search=Project_Report_Q1.pdf&folderId=all`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const verifyPrimary = await verifyPrimaryRes.json();
    const primaryDoc = verifyPrimary.files.find(f => f._id === keepFile._id);
    if (primaryDoc && !primaryDoc.isTrash) {
        console.log(`   ✅ Primary file "${primaryDoc.originalName}" remains intact and active.`);
    } else {
        throw new Error('Primary file was erroneously deleted or trashed!');
    }

    // Verify Duplicate Copies are in Recycle Bin (isTrash: true)
    const trashRes = await fetch(`${BASE_URL}/files/trash`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const trashData = await trashRes.json();
    const trashIds = trashData.items.map(i => i._id);
    const allInTrash = duplicateCopyIds.every(id => trashIds.includes(id));
    if (allInTrash) {
        console.log('   ✅ Redundant copies are safely available in Recycle Bin.');
    } else {
        throw new Error('Cleaned duplicate files not found in Recycle Bin.');
    }

    // Re-check Duplicate Groups (Alpha group should now be gone from duplicates list)
    const dupResAfter = await fetch(`${BASE_URL}/files/duplicates`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const dupDataAfter = await dupResAfter.json();
    const alphaGroupAfter = dupDataAfter.duplicateGroups.find(g => g.hash === alphaGroup.hash);
    if (!alphaGroupAfter) {
        console.log('   ✅ Alpha duplicate group successfully resolved and removed from duplicates scanner.');
    } else {
        throw new Error('Resolved duplicate group still appears in duplicate scanner.');
    }

    // 8. Test IDOR Security Isolation on Duplicate Clean
    console.log('\n8. TESTING SECURITY & TENANT ISOLATION (IDOR)...');
    const idorRes = await fetch(`${BASE_URL}/files/duplicates/clean-group`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenB}` // User B auth
        },
        body: JSON.stringify({
            keepFileId: uploadedBeta1._id,
            duplicateFileIds: [uploadedBeta2._id]
        })
    });
    if (idorRes.status === 404 || idorRes.status === 403) {
        console.log('   ✅ IDOR Protection PASSED: User B was rejected from altering User A files.');
    } else {
        throw new Error(`Security vulnerability: User B was able to clean User A duplicate files! (Status: ${idorRes.status})`);
    }

    // Cleanup tmp files
    fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log('\n====================================================');
    console.log('🎉 ALL PRIORITY 6 TESTS PASSED WITH 100% SUCCESS!');
    console.log('====================================================\n');
}

runTests().catch(err => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
});
