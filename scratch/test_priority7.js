const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';

async function runPriority7Tests() {
    console.log('====================================================');
    console.log('🚀 RUNNING PRIORITY 7 NOTIFICATIONS & ACTIVITY TESTS');
    console.log('====================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failedTests++;
        }
    }

    try {
        const rand = Date.now();
        const userAEmail = `notif_user_a_${rand}@example.com`;
        const userBEmail = `notif_user_b_${rand}@example.com`;
        const password = 'Password123!';

        // 1. Register & Login User A and User B
        console.log('📌 Test 1: User Registration & Authentication');
        await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: `UserA_${rand}`, email: userAEmail, password })
        });
        const loginARes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userAEmail, password })
        });
        const loginAData = await loginARes.json();
        const tokenA = loginAData.token;
        const userAId = loginAData.user?.id || loginAData.user?._id;
        assert(tokenA && userAId, `User A logged in with ID: ${userAId}`);

        await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: `UserB_${rand}`, email: userBEmail, password })
        });
        const loginBRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userBEmail, password })
        });
        const loginBData = await loginBRes.json();
        const tokenB = loginBData.token;
        const userBId = loginBData.user?.id || loginBData.user?._id;
        assert(tokenB && userBId, `User B logged in with ID: ${userBId}`);

        const authHeaderA = { 'Authorization': `Bearer ${tokenA}` };
        const authHeaderB = { 'Authorization': `Bearer ${tokenB}` };

        // 2. Upload file as User A
        console.log('\n📌 Test 2: File Upload & Activity Logging');
        const fileContent = 'Priority 7 Notification and Activity Test File Content';
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, `test_p7_doc_${rand}.txt`);

        const uploadRes = await fetch(`${BASE_URL}/files/upload`, {
            method: 'POST',
            headers: authHeaderA,
            body: formData
        });
        const uploadData = await uploadRes.json();
        const fileA = uploadData.file;
        assert(uploadRes.status === 201 && fileA && fileA._id, `File uploaded with ID: ${fileA?._id}`);

        // 3. Check User A Activities (FILE_UPLOADED)
        console.log('\n📌 Test 3: Verify FILE_UPLOADED in Activity Log');
        const actRes1 = await fetch(`${BASE_URL}/activities?limit=10`, { headers: authHeaderA });
        const actData1 = await actRes1.json();
        const activities1 = actData1.activities || [];
        const uploadAct = activities1.find(a => a.action === 'FILE_UPLOADED' && String(a.fileId?._id || a.fileId) === String(fileA._id));
        assert(uploadAct !== undefined, 'FILE_UPLOADED activity logged correctly in MongoDB');
        assert(uploadAct && (uploadAct.fileName === fileA.originalName || uploadAct.fileId?.originalName === fileA.originalName), `Activity contains file name: ${uploadAct?.fileName}`);

        // 4. Preview & Download Activity Logging
        console.log('\n📌 Test 4: Verify Preview and Download Activities');
        await fetch(`${BASE_URL}/files/preview/${fileA._id}`, { headers: authHeaderA });
        await fetch(`${BASE_URL}/files/download/${fileA._id}`, { headers: authHeaderA });

        const actRes2 = await fetch(`${BASE_URL}/activities?limit=10`, { headers: authHeaderA });
        const actData2 = await actRes2.json();
        const previewAct = actData2.activities.find(a => a.action === 'FILE_PREVIEWED' && String(a.fileId?._id || a.fileId) === String(fileA._id));
        const downloadAct = actData2.activities.find(a => a.action === 'FILE_DOWNLOADED' && String(a.fileId?._id || a.fileId) === String(fileA._id));
        assert(previewAct !== undefined, 'FILE_PREVIEWED activity logged');
        assert(downloadAct !== undefined, 'FILE_DOWNLOADED activity logged');

        // 5. File Rename & Version Activity
        console.log('\n📌 Test 5: File Rename and Version Activity');
        await fetch(`${BASE_URL}/files/${fileA._id}/rename`, {
            method: 'PATCH',
            headers: { ...authHeaderA, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `renamed_doc_${rand}.txt` })
        });
        
        // Upload new version
        const v2Blob = new Blob(['Version 2 updated content'], { type: 'text/plain' });
        const v2Form = new FormData();
        v2Form.append('file', v2Blob, `renamed_doc_${rand}.txt`);
        const v2Res = await fetch(`${BASE_URL}/files/${fileA._id}/versions`, {
            method: 'POST',
            headers: authHeaderA,
            body: v2Form
        });
        assert(v2Res.status === 201, 'Version 2 uploaded successfully');

        const actRes3 = await fetch(`${BASE_URL}/activities?limit=10`, { headers: authHeaderA });
        const actData3 = await actRes3.json();
        const renameAct = actData3.activities.find(a => a.action === 'FILE_RENAMED');
        const versionAct = actData3.activities.find(a => a.action === 'VERSION_CREATED');
        assert(renameAct !== undefined, 'FILE_RENAMED activity logged');
        assert(versionAct !== undefined, 'VERSION_CREATED activity logged');

        // 6. Share File with User B -> Notification and Activity verification
        console.log('\n📌 Test 6: Sharing File & Notification Emission to Recipient');
        const shareRes = await fetch(`${BASE_URL}/files/${fileA._id}/share/user`, {
            method: 'POST',
            headers: { ...authHeaderA, 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailOrUsername: userBEmail, permission: 'download' })
        });
        const shareData = await shareRes.json();
        if (!shareRes.ok) console.log('DEBUG share failed:', shareRes.status, shareData);
        assert(shareRes.ok, 'File shared with User B successfully');

        // Check User A activity for sharing
        const actRes4 = await fetch(`${BASE_URL}/activities?limit=10`, { headers: authHeaderA });
        const actData4 = await actRes4.json();
        const shareAct = actData4.activities.find(a => a.action === 'FILE_SHARED');
        assert(shareAct !== undefined, 'FILE_SHARED activity logged for file owner (User A)');

        // Check User B notification
        const notifBRes1 = await fetch(`${BASE_URL}/notifications`, { headers: authHeaderB });
        const notifBData1 = await notifBRes1.json();
        const notifsB = notifBData1.notifications || [];
        const shareNotif = notifsB.find(n => String(n.fileId?._id || n.fileId) === String(fileA._id) && (n.type === 'FILE_SHARED' || n.type === 'SHARED_WITH_YOU'));
        assert(shareNotif !== undefined, `User B received file shared notification: "${shareNotif?.title}"`);
        assert(shareNotif && shareNotif.isRead === false, 'Notification is marked unread initially');

        // Check User B unread count
        const unreadCountRes = await fetch(`${BASE_URL}/notifications/unread-count`, { headers: authHeaderB });
        const unreadData = await unreadCountRes.json();
        assert(unreadData.unreadCount >= 1, `User B unread count is >= 1 (Actual: ${unreadData.unreadCount})`);

        // 7. Update permission -> Notification to User B
        console.log('\n📌 Test 7: Permission Update Notification');
        const permRes = await fetch(`${BASE_URL}/files/${fileA._id}/share/user/${userBId}`, {
            method: 'PATCH',
            headers: { ...authHeaderA, 'Content-Type': 'application/json' },
            body: JSON.stringify({ permission: 'view' })
        });
        assert(permRes.ok, 'Permission updated successfully on server');

        const notifBRes2 = await fetch(`${BASE_URL}/notifications`, { headers: authHeaderB });
        const notifBData2 = await notifBRes2.json();
        const permNotif = notifBData2.notifications.find(n => n.type === 'PERMISSION_CHANGED');
        assert(permNotif !== undefined, `User B received PERMISSION_CHANGED notification: "${permNotif?.title}"`);

        // 8. Notification Read & Mark-All-Read Operations
        console.log('\n📌 Test 8: Notification Read Management');
        const patchReadRes = await fetch(`${BASE_URL}/notifications/${shareNotif._id}/read`, {
            method: 'PATCH',
            headers: authHeaderB
        });
        const patchReadData = await patchReadRes.json();
        assert(patchReadRes.status === 200 && patchReadData.notification.isRead === true, 'Single notification marked as read');

        const readAllRes = await fetch(`${BASE_URL}/notifications/read-all`, {
            method: 'PATCH',
            headers: authHeaderB
        });
        assert(readAllRes.status === 200, 'All notifications marked as read via PATCH /read-all');

        const unreadCountAfter = await fetch(`${BASE_URL}/notifications/unread-count`, { headers: authHeaderB });
        const unreadAfterData = await unreadCountAfter.json();
        assert(unreadAfterData.unreadCount === 0, 'User B unread count is now 0');

        // 9. Trash and Restore Activity Logging
        console.log('\n📌 Test 9: Trash & Restore Activity Logging');
        await fetch(`${BASE_URL}/files/${fileA._id}`, {
            method: 'DELETE',
            headers: authHeaderA
        });
        await fetch(`${BASE_URL}/files/trash/${fileA._id}/restore`, {
            method: 'POST',
            headers: authHeaderA
        });

        const actRes5 = await fetch(`${BASE_URL}/activities?limit=10`, { headers: authHeaderA });
        const actData5 = await actRes5.json();
        const trashAct = actData5.activities.find(a => a.action === 'FILE_TRASHED');
        const restoreAct = actData5.activities.find(a => a.action === 'FILE_RESTORED');
        assert(trashAct !== undefined, 'FILE_TRASHED activity logged');
        assert(restoreAct !== undefined, 'FILE_RESTORED activity logged');

        // 10. Activity Summary & Multi-Filter Query
        console.log('\n📌 Test 10: Activity Summary Metrics & Filtering');
        const summaryRes = await fetch(`${BASE_URL}/activities/summary`, { headers: authHeaderA });
        const summaryData = await summaryRes.json();
        assert(summaryData.summary.totalActivities > 0, `Summary reports ${summaryData.summary.totalActivities} total activities`);
        assert(summaryData.summary.uploadCount >= 1, `Summary reports ${summaryData.summary.uploadCount} uploads`);

        // Filter by action FILE_UPLOADED
        const filteredByAction = await fetch(`${BASE_URL}/activities?action=FILE_UPLOADED`, { headers: authHeaderA });
        const filteredActionData = await filteredByAction.json();
        const allAreUploads = filteredActionData.activities.every(a => a.action === 'FILE_UPLOADED');
        assert(allAreUploads && filteredActionData.activities.length > 0, 'Activity filtering by action returns only matched actions');

        // Filter by search query
        const filteredBySearch = await fetch(`${BASE_URL}/activities?search=renamed_doc`, { headers: authHeaderA });
        const filteredSearchData = await filteredBySearch.json();
        assert(filteredSearchData.activities.length > 0, 'Activity filtering by keyword search succeeds');

        // 11. Security & IDOR Isolation
        console.log('\n📌 Test 11: Security & IDOR Isolation (Cross-User Protection)');
        // User A attempts to read/modify User B's notification
        const idorPatch = await fetch(`${BASE_URL}/notifications/${shareNotif._id}/read`, {
            method: 'PATCH',
            headers: authHeaderA
        });
        assert(idorPatch.status === 404, 'IDOR blocked: User A cannot mutate User B notification (returns 404)');

        // User A attempts to delete User B's notification
        const idorDel = await fetch(`${BASE_URL}/notifications/${shareNotif._id}`, {
            method: 'DELETE',
            headers: authHeaderA
        });
        assert(idorDel.status === 404, 'IDOR blocked: User A cannot delete User B notification (returns 404)');

        // 12. Notification Deletion & Clear All
        console.log('\n📌 Test 12: Notification Deletion');
        const delRes = await fetch(`${BASE_URL}/notifications/${shareNotif._id}`, {
            method: 'DELETE',
            headers: authHeaderB
        });
        assert(delRes.status === 200, 'User B successfully deleted single notification');

        const clearRes = await fetch(`${BASE_URL}/notifications/clear-all`, {
            method: 'DELETE',
            headers: authHeaderB
        });
        assert(clearRes.status === 200, 'User B successfully cleared all notifications');

        const notifBResAfterClear = await fetch(`${BASE_URL}/notifications`, { headers: authHeaderB });
        const notifBDataAfterClear = await notifBResAfterClear.json();
        assert(notifBDataAfterClear.notifications.length === 0, 'Notification center is empty after clear-all');

    } catch (error) {
        console.error('❌ Test suite failed with exception:', error);
        failedTests++;
    }

    console.log('\n====================================================');
    console.log(`🏁 PRIORITY 7 TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
    console.log('====================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
}

runPriority7Tests();
