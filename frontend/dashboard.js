const API_URL_FILES = 'http://localhost:5000/api/files';
const API_URL_AUTH = 'http://localhost:5000/api/auth';
const API_URL_NOTIFICATIONS = 'http://localhost:5000/api/notifications';
const API_URL_ACTIVITIES = 'http://localhost:5000/api/activities';
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
const username = localStorage.getItem('username') || sessionStorage.getItem('username');

// State Variables
let currentFolderId = null; // null represents root/home
let currentFolderDoc = null;
let breadcrumbs = [];
let allFolders = [];
let currentSubfolders = [];
let currentFiles = [];
let sharedWithMeFiles = [];
let totalFilesCount = 0;
let currentPage = 1;
const itemsPerPage = 12;
let totalPages = 1;
let currentViewMode = localStorage.getItem('cloudstore_view_mode') || 'list';
let currentActiveSection = 'dashboardSection';

let itemToDelete = null; // { type: 'file'|'folder'|'shared_leave'|'trash_file'|'trash_folder'|'trash_empty', id, name }
let itemToRename = null; // { type: 'file'|'folder', id, name }
let fileToMove = null;   // { id, name }
let activeSharingFileId = null;
let activeVersionFileId = null;
let activeUploadXhr = null;
let trashItems = [];
let currentPreviewUrl = null;
let searchDebounceTimeout = null;

// Activity & Notification State
let activitiesList = [];
let activityTotalPages = 1;
let activityCurrentPage = 1;
let notificationsList = [];
let notificationTotalPages = 1;
let notificationCurrentPage = 1;
let notificationUnreadCount = 0;
let activityDebounceTimeout = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Set UI Profile Details
    const usernameEl = document.getElementById('usernameDisplay');
    if (usernameEl) usernameEl.innerText = username || 'User';
    const avatarEl = document.getElementById('profileAvatar');
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'U')}&background=4F46E5&color=fff`;

    // Sidebar Toggle Mobile
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('show');
        });
    }

    // Setup Event Listeners
    setupDragAndDrop();
    document.getElementById('fileInput').addEventListener('change', handleFileInputSelect);
    document.getElementById('searchInput').addEventListener('input', handleSearchInput);
    document.getElementById('typeFilter').addEventListener('change', handleFilterChange);
    document.getElementById('dateFilter').addEventListener('change', handleDateFilterChange);
    document.getElementById('sizeRangeFilter')?.addEventListener('change', handleSizeFilterChange);
    document.getElementById('sortSelect').addEventListener('change', handleFilterChange);
    
    // Advanced Filters
    document.getElementById('extInput')?.addEventListener('input', handleDebouncedFilterChange);
    document.getElementById('scopeFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('startDateInput')?.addEventListener('change', handleFilterChange);
    document.getElementById('endDateInput')?.addEventListener('change', handleFilterChange);
    document.getElementById('minSizeMbInput')?.addEventListener('input', handleDebouncedFilterChange);
    document.getElementById('maxSizeMbInput')?.addEventListener('input', handleDebouncedFilterChange);
    document.getElementById('duplicatesOnlyFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('resetFiltersBtn')?.addEventListener('click', resetAllFilters);

    // Activity Filters
    document.getElementById('activitySearchInput')?.addEventListener('input', handleActivitySearchInput);
    document.getElementById('activityActionFilter')?.addEventListener('change', handleActivityFilterChange);
    document.getElementById('activityScopeFilter')?.addEventListener('change', handleActivityFilterChange);
    document.getElementById('activityStartDate')?.addEventListener('change', handleActivityFilterChange);
    document.getElementById('activityEndDate')?.addEventListener('change', handleActivityFilterChange);
    document.getElementById('resetActivityFiltersBtn')?.addEventListener('click', resetActivityFilters);

    // Notification Filter
    document.getElementById('notificationStatusFilter')?.addEventListener('change', () => {
        notificationCurrentPage = 1;
        fetchNotifications();
    });

    // Shared with me search
    const sharedSearch = document.getElementById('sharedSearchInput');
    if (sharedSearch) sharedSearch.addEventListener('input', handleSharedSearch);

    // Modal buttons
    document.getElementById('createFolderBtn').addEventListener('click', executeCreateFolder);
    document.getElementById('confirmRenameBtn').addEventListener('click', executeRename);
    document.getElementById('confirmMoveBtn').addEventListener('click', executeMove);
    document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);
    
    // Share Modal handlers
    document.getElementById('addUserShareBtn').addEventListener('click', executeAddUserShare);
    document.getElementById('linkEnableToggle').addEventListener('change', handleLinkToggleChange);
    document.getElementById('saveLinkSettingsBtn').addEventListener('click', executeSaveLinkSettings);

    // Preview Modal & Fullscreen handler
    const viewModalEl = document.getElementById('viewModal');
    if (viewModalEl) {
        viewModalEl.addEventListener('hidden.bs.modal', () => {
            if (currentPreviewUrl) {
                URL.revokeObjectURL(currentPreviewUrl);
                currentPreviewUrl = null;
            }
            const container = document.getElementById('previewContainer');
            if (container) container.innerHTML = '';
            const modalDialog = document.getElementById('previewModalDialog');
            if (modalDialog) modalDialog.classList.remove('modal-fullscreen');
            const fsBtn = document.getElementById('previewFullscreenBtn');
            if (fsBtn) fsBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        });
    }

    const fsBtn = document.getElementById('previewFullscreenBtn');
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            const modalDialog = document.getElementById('previewModalDialog');
            modalDialog.classList.toggle('modal-fullscreen');
            const isFull = modalDialog.classList.contains('modal-fullscreen');
            fsBtn.innerHTML = isFull ? '<i class="bi bi-fullscreen-exit"></i>' : '<i class="bi bi-arrows-fullscreen"></i>';
        });
    }

    // Initialize View Mode
    setViewMode(currentViewMode);

    // Initial Fetch
    fetchAllFoldersForDropdowns();
    fetchFilesAndFolders();
    fetchStorageAnalytics();
    fetchDuplicateCountBadge();
    fetchNotificationCount();
    fetchNotifications();

    // Periodic Notification Poller (every 45s)
    setInterval(() => {
        if (token) {
            fetchNotificationCount();
        }
    }, 45000);
});

// Tab Switching
window.switchTab = function(sectionId, element) {
    currentActiveSection = sectionId;
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.add('d-none'));
    const targetSection = document.getElementById(sectionId);
    if (targetSection) targetSection.classList.remove('d-none');
    
    document.querySelectorAll('.nav-link-custom').forEach(nav => nav.classList.remove('active'));
    if (element) element.classList.add('active');
    
    if (window.innerWidth <= 768) {
       const sidebar = document.getElementById('sidebar');
       if (sidebar) sidebar.classList.remove('show');
    }

    if (sectionId === 'dashboardSection') {
        fetchFilesAndFolders();
        fetchStorageAnalytics();
        fetchDuplicateCountBadge();
        fetchNotificationCount();
    } else if (sectionId === 'filesSection') {
        fetchFilesAndFolders();
    } else if (sectionId === 'sharedSection') {
        fetchSharedWithMe();
    } else if (sectionId === 'duplicatesSection') {
        fetchDuplicates();
    } else if (sectionId === 'activitySection') {
        fetchActivities();
        fetchActivitySummary();
        fetchNotifications();
    } else if (sectionId === 'trashSection') {
        fetchTrash();
    }
};

// View Mode (Grid vs List)
window.setViewMode = function(mode) {
    currentViewMode = mode;
    localStorage.setItem('cloudstore_view_mode', mode);

    const listBtn = document.getElementById('listViewBtn');
    const gridBtn = document.getElementById('gridViewBtn');
    const listContainer = document.getElementById('listViewContainer');
    const gridContainer = document.getElementById('gridViewContainer');

    if (mode === 'grid') {
        if (gridBtn) gridBtn.classList.add('active');
        if (listBtn) listBtn.classList.remove('active');
        if (gridContainer) gridContainer.classList.remove('d-none');
        if (listContainer) listContainer.classList.add('d-none');
    } else {
        if (listBtn) listBtn.classList.add('active');
        if (gridBtn) gridBtn.classList.remove('active');
        if (listContainer) listContainer.classList.remove('d-none');
        if (gridContainer) gridContainer.classList.add('d-none');
    }

    renderFiles();
};

/* ============================
   FETCH DATA & API CALLS
============================ */
async function fetchFilesAndFolders() {
    showLoader(true);
    try {
        const search = (document.getElementById('searchInput')?.value || '').trim();
        const type = document.getElementById('typeFilter')?.value || 'all';
        const date = document.getElementById('dateFilter')?.value || 'all';
        const sizeRange = document.getElementById('sizeRangeFilter')?.value || 'all';
        const sort = document.getElementById('sortSelect')?.value || 'date-desc';
        
        // Advanced filters
        const ext = (document.getElementById('extInput')?.value || '').trim();
        const scope = document.getElementById('scopeFilter')?.value || 'my_files';
        const duplicatesOnly = document.getElementById('duplicatesOnlyFilter')?.checked || false;
        const startDate = document.getElementById('startDateInput')?.value || '';
        const endDate = document.getElementById('endDateInput')?.value || '';
        const minSizeMb = document.getElementById('minSizeMbInput')?.value || '';
        const maxSizeMb = document.getElementById('maxSizeMbInput')?.value || '';

        const params = new URLSearchParams();
        if (currentFolderId) {
            params.append('folderId', currentFolderId);
        } else {
            params.append('folderId', (search || ext || duplicatesOnly || scope === 'all' || scope === 'shared' || date === 'custom' || sizeRange === 'custom') ? 'all' : 'root');
        }

        if (search) params.append('search', search);
        if (type && type !== 'all') params.append('type', type);
        if (ext) params.append('ext', ext);
        if (date && date !== 'all') params.append('date', date);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (sizeRange && sizeRange !== 'all') params.append('sizeRange', sizeRange);
        if (minSizeMb) params.append('minSize', Math.round(parseFloat(minSizeMb) * 1024 * 1024));
        if (maxSizeMb) params.append('maxSize', Math.round(parseFloat(maxSizeMb) * 1024 * 1024));
        if (scope) params.append('scope', scope);
        if (duplicatesOnly) params.append('duplicatesOnly', 'true');
        if (sort) params.append('sort', sort);
        params.append('page', currentPage);
        params.append('limit', itemsPerPage);

        const response = await fetch(`${API_URL_FILES}?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) {
            logout();
            return;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to fetch items');

        if (Array.isArray(data)) {
            currentFiles = data;
            currentSubfolders = [];
            totalFilesCount = data.length;
            totalPages = 1;
        } else {
            currentFiles = data.files || [];
            currentSubfolders = data.folders || [];
            totalFilesCount = data.totalFiles || 0;
            totalPages = data.totalPages || 1;
            currentFolderDoc = data.currentFolder || null;
            breadcrumbs = data.breadcrumbs || [];

            updateDashboardStats(data.storageStats || { totalFiles: data.totalFiles, usedStorage: data.totalStorage });
        }

        renderBreadcrumbs();
        renderFolders();
        renderFiles();
        renderPagination();

    } catch (err) {
        showToast(err.message || 'Error loading files.', 'bg-danger');
    } finally {
        showLoader(false);
    }
}

async function fetchAllFoldersForDropdowns() {
    try {
        const response = await fetch(`${API_URL_FILES}/folders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            allFolders = await response.json();
            populateFolderDropdowns();
        }
    } catch (_) {}
}

function populateFolderDropdowns() {
    const uploadSelect = document.getElementById('uploadFolderSelect');
    const moveSelect = document.getElementById('moveFolderSelect');

    let optionsHtml = '<option value="root">📁 Root / Home</option>';
    allFolders.forEach(f => {
        optionsHtml += `<option value="${f._id}">📁 ${escapeHtml(f.name)}</option>`;
    });

    if (uploadSelect) {
        uploadSelect.innerHTML = optionsHtml;
        if (currentFolderId) uploadSelect.value = currentFolderId;
    }
    if (moveSelect) {
        moveSelect.innerHTML = optionsHtml;
    }
}

/* ============================
   SHARED WITH ME LOGIC
============================ */
async function fetchSharedWithMe() {
    showLoader(true);
    try {
        const query = (document.getElementById('sharedSearchInput')?.value || '').trim();
        let url = `${API_URL_FILES}/shared-with-me`;
        if (query) url += `?search=${encodeURIComponent(query)}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to fetch shared files');

        sharedWithMeFiles = data.files || [];
        renderSharedFiles();
    } catch (err) {
        showToast(err.message || 'Error loading shared files', 'bg-danger');
    } finally {
        showLoader(false);
    }
}

function handleSharedSearch() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        fetchSharedWithMe();
    }, 300);
}

function renderSharedFiles() {
    const tbody = document.getElementById('sharedTableBody');
    const emptyState = document.getElementById('sharedEmptyState');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (sharedWithMeFiles.length === 0) {
        if (emptyState) emptyState.classList.remove('d-none');
        return;
    } else {
        if (emptyState) emptyState.classList.add('d-none');
    }

    sharedWithMeFiles.forEach(file => {
        const safeName = escapeHtml(file.originalName);
        const safeMime = escapeHtml(file.mimeType || '');
        const sizeFormatted = formatBytes(file.size);
        const dateFormatted = new Date(file.sharedAt || file.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const ownerName = escapeHtml(file.owner?.username || file.owner?.email || 'Unknown');

        let permBadge = '<span class="badge bg-secondary">View Only</span>';
        if (file.myPermission === 'download') {
            permBadge = '<span class="badge bg-info text-dark"><i class="bi bi-download me-1"></i> Can Download</span>';
        } else if (file.myPermission === 'edit') {
            permBadge = '<span class="badge bg-success"><i class="bi bi-pencil me-1"></i> Can Edit</span>';
        }

        const canDownload = file.myPermission === 'download' || file.myPermission === 'edit';
        const canEdit = file.myPermission === 'edit';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center gap-3">
                    ${getFileIcon(file.mimeType)}
                    <span class="fw-semibold text-truncate" style="max-width: 250px;" title="${safeName}">${safeName}</span>
                </div>
            </td>
            <td><span class="text-dark small fw-medium"><i class="bi bi-person me-1 text-primary"></i> ${ownerName}</span></td>
            <td class="text-muted small">${sizeFormatted}</td>
            <td>${permBadge}</td>
            <td class="text-muted small">${dateFormatted}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-light text-primary me-1" onclick="openPreview('${file._id}', '${safeName}', '${safeMime}', ${file.size})" title="Preview">
                    <i class="bi bi-eye"></i>
                </button>
                ${canDownload ? `
                    <button class="btn btn-sm btn-light text-success me-1" onclick="downloadFile('${file._id}', '${safeName}')" title="Download">
                        <i class="bi bi-download"></i>
                    </button>
                ` : ''}
                <div class="dropdown d-inline-block">
                    <button class="btn btn-sm btn-light text-muted" data-bs-toggle="dropdown">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                        ${canEdit ? `<li><a class="dropdown-item" href="#" onclick="promptRename('file', '${file._id}', '${safeName}')"><i class="bi bi-pencil me-2"></i> Rename</a></li>` : ''}
                        ${canDownload ? `<li><a class="dropdown-item" href="#" onclick="copyFile('${file._id}', '${safeName}')"><i class="bi bi-files me-2"></i> Save Copy to My Files</a></li>` : ''}
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" onclick="promptLeaveSharedFile('${file._id}', '${safeName}')"><i class="bi bi-box-arrow-right me-2"></i> Remove My Access</a></li>
                    </ul>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.promptLeaveSharedFile = function(fileId, fileName) {
    itemToDelete = { type: 'shared_leave', id: fileId, name: fileName };
    document.getElementById('deleteFileName').innerText = fileName;
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteModal'));
    modal.show();
};

/* ============================
   SHARING MANAGEMENT DIALOG
============================ */
window.openShareModal = async function(fileId, fileName) {
    activeSharingFileId = fileId;
    document.getElementById('shareModalFileName').innerText = `Share ${fileName}`;
    document.getElementById('shareUserInput').value = '';
    document.getElementById('shareUserPermission').value = 'view';
    document.getElementById('linkPasswordInput').value = '';

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('shareModal'));
    modal.show();

    loadShareDetails();
};

async function loadShareDetails() {
    if (!activeSharingFileId) return;
    try {
        const res = await fetch(`${API_URL_FILES}/${activeSharingFileId}/share`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load sharing info');

        const data = await res.json();
        renderShareUsersList(data.owner, data.sharedWith || []);
        renderShareLinkSettings(data.shareLink);
        renderShareActivityLog(data.activities || []);
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
}

function renderShareUsersList(owner, sharedWith) {
    const list = document.getElementById('shareUsersList');
    if (!list) return;

    let html = `
        <div class="list-group-item d-flex justify-content-between align-items-center py-3 bg-light">
            <div class="d-flex align-items-center gap-3">
                <div class="avatar bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 38px; height: 38px;">
                    <i class="bi bi-person-fill"></i>
                </div>
                <div>
                    <span class="fw-bold text-dark d-block">${escapeHtml(owner?.username || 'Owner')} (You)</span>
                    <small class="text-muted">${escapeHtml(owner?.email || '')}</small>
                </div>
            </div>
            <span class="badge bg-primary px-3 py-2">Owner</span>
        </div>
    `;

    if (sharedWith.length === 0) {
        html += `<div class="list-group-item text-center py-4 text-muted small">No other users have access yet.</div>`;
    } else {
        sharedWith.forEach(item => {
            const u = item.userId;
            const uId = u?._id || item.userId;
            const uName = u?.username || 'User';
            const uEmail = u?.email || '';

            html += `
                <div class="list-group-item d-flex justify-content-between align-items-center py-3">
                    <div class="d-flex align-items-center gap-3 text-truncate me-2">
                        <div class="avatar bg-secondary bg-opacity-25 text-dark rounded-circle d-flex align-items-center justify-content-center" style="width: 38px; height: 38px;">
                            <i class="bi bi-person"></i>
                        </div>
                        <div class="text-truncate">
                            <span class="fw-semibold text-dark d-block text-truncate">${escapeHtml(uName)}</span>
                            <small class="text-muted text-truncate d-block">${escapeHtml(uEmail)}</small>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <select class="form-select form-select-sm" style="width: 140px;" onchange="changeSharedUserPermission('${activeSharingFileId}', '${uId}', this.value)">
                            <option value="view" ${item.permission === 'view' ? 'selected' : ''}>Can View</option>
                            <option value="download" ${item.permission === 'download' ? 'selected' : ''}>Can Download</option>
                            <option value="edit" ${item.permission === 'edit' ? 'selected' : ''}>Can Edit</option>
                        </select>
                        <button class="btn btn-sm btn-outline-danger p-1" onclick="removeSharedUser('${activeSharingFileId}', '${uId}')" title="Remove Access">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    }

    list.innerHTML = html;
}

function renderShareLinkSettings(link) {
    const toggle = document.getElementById('linkEnableToggle');
    const container = document.getElementById('linkSettingsContainer');
    const permSelect = document.getElementById('linkPermissionSelect');
    const linkInput = document.getElementById('generatedShareLink');

    if (!link) return;

    toggle.checked = link.isEnabled;
    if (link.isEnabled) {
        container.classList.remove('d-none');
        permSelect.value = link.permission || 'view';

        const origin = window.location.origin;
        const pathname = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const fullLinkUrl = `${origin}${pathname}/shared.html?token=${link.token}`;
        linkInput.value = fullLinkUrl;
    } else {
        container.classList.add('d-none');
        linkInput.value = '';
    }
}

function renderShareActivityLog(activities) {
    const logList = document.getElementById('shareActivityList');
    if (!logList) return;

    if (activities.length === 0) {
        logList.innerHTML = '<div class="text-center py-4 text-muted small">No recent activity recorded.</div>';
        return;
    }

    let html = '';
    activities.forEach(act => {
        const date = new Date(act.createdAt).toLocaleString();
        const actionLabel = act.action.replace(/_/g, ' ');
        html += `
            <div class="list-group-item py-2 px-0 d-flex justify-content-between align-items-start border-0 border-bottom">
                <div>
                    <span class="badge bg-light text-dark border me-2">${actionLabel}</span>
                    <span class="small text-dark">${escapeHtml(act.details)}</span>
                </div>
                <small class="text-muted text-nowrap ms-2" style="font-size: 0.75rem;">${date}</small>
            </div>
        `;
    });
    logList.innerHTML = html;
}

async function executeAddUserShare() {
    const input = document.getElementById('shareUserInput');
    const permission = document.getElementById('shareUserPermission').value;
    const value = (input.value || '').trim();

    if (!value) {
        showToast('Please enter an email or username.', 'bg-danger');
        return;
    }

    try {
        const res = await fetch(`${API_URL_FILES}/${activeSharingFileId}/share/user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ emailOrUsername: value, permission })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to share');

        showToast(data.message, 'bg-success');
        input.value = '';
        loadShareDetails();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
}

window.changeSharedUserPermission = async function(fileId, targetUserId, newPermission) {
    try {
        const res = await fetch(`${API_URL_FILES}/${fileId}/share/user/${targetUserId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ permission: newPermission })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Update failed');

        showToast('Permission updated.', 'bg-success');
        loadShareDetails();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
};

window.removeSharedUser = async function(fileId, targetUserId) {
    try {
        const res = await fetch(`${API_URL_FILES}/${fileId}/share/user/${targetUserId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Removal failed');

        showToast('User access removed.', 'bg-success');
        loadShareDetails();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
};

function handleLinkToggleChange(e) {
    const isChecked = e.target.checked;
    const container = document.getElementById('linkSettingsContainer');
    if (isChecked) {
        container.classList.remove('d-none');
    } else {
        container.classList.add('d-none');
    }
}

async function executeSaveLinkSettings() {
    if (!activeSharingFileId) return;

    const isEnabled = document.getElementById('linkEnableToggle').checked;
    const permission = document.getElementById('linkPermissionSelect').value;
    const expiryChoice = document.getElementById('linkExpirySelect').value;
    const password = document.getElementById('linkPasswordInput').value;

    let expiresAt = null;
    const now = new Date();
    if (expiryChoice === '24h') expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    else if (expiryChoice === '7d') expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    else if (expiryChoice === '30d') expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    try {
        const res = await fetch(`${API_URL_FILES}/${activeSharingFileId}/share/link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                isEnabled,
                permission,
                expiresAt,
                password
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to save link settings');

        showToast(data.message, 'bg-success');
        loadShareDetails();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
}

window.copyShareLinkText = function() {
    const linkInput = document.getElementById('generatedShareLink');
    if (!linkInput || !linkInput.value) return;

    navigator.clipboard.writeText(linkInput.value).then(() => {
        showToast('Share link copied to clipboard!', 'bg-success');
    }).catch(() => {
        linkInput.select();
        document.execCommand('copy');
        showToast('Share link copied!', 'bg-success');
    });
};

/* ============================
   BREADCRUMBS & FOLDER NAV
============================ */
function renderBreadcrumbs() {
    const container = document.getElementById('breadcrumbsContainer');
    if (!container) return;

    let html = `<a href="#" onclick="navigateToFolder(null, event)"><i class="bi bi-house-door-fill"></i> Home</a>`;
    
    breadcrumbs.forEach((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        html += `<span class="breadcrumb-separator"><i class="bi bi-chevron-right"></i></span>`;
        if (isLast) {
            html += `<span class="fw-bold text-dark">${escapeHtml(crumb.name)}</span>`;
        } else {
            html += `<a href="#" onclick="navigateToFolder('${crumb.id}', event)">${escapeHtml(crumb.name)}</a>`;
        }
    });

    container.innerHTML = html;
}

window.navigateToFolder = function(folderId, event) {
    if (event) event.preventDefault();
    currentFolderId = folderId;
    currentPage = 1;
    
    document.getElementById('searchInput').value = '';
    
    const uploadSelect = document.getElementById('uploadFolderSelect');
    if (uploadSelect) uploadSelect.value = folderId || 'root';

    fetchFilesAndFolders();
};

/* ============================
   RENDER FOLDERS
============================ */
function renderFolders() {
    const section = document.getElementById('foldersSection');
    const container = document.getElementById('foldersContainer');
    if (!section || !container) return;

    if (currentSubfolders.length === 0) {
        section.classList.add('d-none');
        container.innerHTML = '';
        return;
    }

    section.classList.remove('d-none');
    container.innerHTML = '';

    currentSubfolders.forEach(folder => {
        const col = document.createElement('div');
        col.className = 'col-lg-3 col-md-4 col-sm-6';

        const safeName = escapeHtml(folder.name);
        col.innerHTML = `
            <div class="folder-card" onclick="navigateToFolder('${folder._id}')">
                <div class="d-flex align-items-center gap-3 text-truncate">
                    <div class="folder-icon-box bg-primary bg-opacity-10 text-primary">
                        <i class="bi bi-folder-fill"></i>
                    </div>
                    <div class="text-truncate">
                        <span class="fw-semibold text-dark text-truncate d-block">${safeName}</span>
                        <small class="text-muted" style="font-size: 0.75rem;">Folder</small>
                    </div>
                </div>
                <div class="dropdown" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-light border-0 text-muted p-1" data-bs-toggle="dropdown">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                        <li><a class="dropdown-item" href="#" onclick="promptRename('folder', '${folder._id}', '${safeName}')"><i class="bi bi-pencil me-2"></i> Rename</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" onclick="promptDelete('folder', '${folder._id}', '${safeName}')"><i class="bi bi-trash me-2"></i> Delete</a></li>
                    </ul>
                </div>
            </div>
        `;
        container.appendChild(col);
    });
}

/* ============================
   RENDER FILES (LIST & GRID)
============================ */
function getFileIcon(mimeType = '', filename = '') {
    const lowerMime = (mimeType || '').toLowerCase();
    const lowerName = (filename || '').toLowerCase();

    // Microsoft Word
    if (lowerMime.includes('word') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) {
        return '<i class="bi bi-file-earmark-word rounded p-2 bg-primary bg-opacity-10 text-primary"></i>';
    }
    // Microsoft Excel
    if (lowerMime.includes('excel') || lowerMime.includes('spreadsheet') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
        return '<i class="bi bi-file-earmark-excel rounded p-2 bg-success bg-opacity-10 text-success"></i>';
    }
    // Microsoft PowerPoint
    if (lowerMime.includes('powerpoint') || lowerMime.includes('presentation') || lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) {
        return '<i class="bi bi-file-earmark-ppt rounded p-2 bg-warning bg-opacity-10 text-warning"></i>';
    }
    // PDF
    if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) {
        return '<i class="bi bi-file-earmark-pdf rounded p-2 bg-danger bg-opacity-10 text-danger"></i>';
    }
    // Images
    if (lowerMime.includes('image') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp') || lowerName.endsWith('.gif') || lowerName.endsWith('.svg')) {
        return '<i class="bi bi-file-earmark-image rounded p-2 bg-primary bg-opacity-10 text-primary"></i>';
    }
    // Videos
    if (lowerMime.includes('video') || lowerName.endsWith('.mp4') || lowerName.endsWith('.webm')) {
        return '<i class="bi bi-file-earmark-play rounded p-2 bg-warning bg-opacity-10 text-warning"></i>';
    }
    // Audio
    if (lowerMime.includes('audio') || lowerName.endsWith('.mp3') || lowerName.endsWith('.wav')) {
        return '<i class="bi bi-file-earmark-music rounded p-2 bg-info bg-opacity-10 text-info"></i>';
    }
    // Code & Text
    if (lowerMime.includes('text') || lowerMime.includes('json') || lowerMime.includes('javascript') || lowerMime.includes('csv') || lowerMime.includes('html') || lowerMime.includes('css') || lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.js') || lowerName.endsWith('.json') || lowerName.endsWith('.csv') || lowerName.endsWith('.html') || lowerName.endsWith('.css')) {
        return '<i class="bi bi-file-earmark-code rounded p-2 bg-success bg-opacity-10 text-success"></i>';
    }
    return '<i class="bi bi-file-earmark rounded p-2 bg-light text-secondary"></i>';
}

function renderFiles() {
    const tbody = document.getElementById('filesTableBody');
    const gridBody = document.getElementById('filesGridBody');
    const emptyState = document.getElementById('emptyState');
    const countDisplay = document.getElementById('fileCountDisplay');

    if (tbody) tbody.innerHTML = '';
    if (gridBody) gridBody.innerHTML = '';

    const hasNoItems = currentFiles.length === 0 && currentSubfolders.length === 0;
    if (hasNoItems) {
        if (emptyState) emptyState.classList.remove('d-none');
    } else {
        if (emptyState) emptyState.classList.add('d-none');
    }

    if (countDisplay) {
        countDisplay.innerText = `Showing ${currentFiles.length} of ${totalFilesCount} file${totalFilesCount !== 1 ? 's' : ''}`;
    }

    currentFiles.forEach(file => {
        const safeName = escapeHtml(file.originalName);
        const safeMime = escapeHtml(file.mimeType || '');
        const sizeFormatted = formatBytes(file.size);
        const dateFormatted = new Date(file.updatedAt || file.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const typeLabel = (file.mimeType ? file.mimeType.split('/')[1] : 'FILE').toUpperCase();

        const isShared = (file.sharedWith && file.sharedWith.length > 0) || file.shareLink?.isEnabled;

        const vNum = file.version || 1;

        // 1. List View Row
        if (tbody) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                  <div class="d-flex align-items-center gap-3">
                     ${getFileIcon(file.mimeType, file.originalName)}
                     <div>
                        <span class="fw-semibold text-truncate d-block" style="max-width: 250px;" title="${safeName}">${safeName}</span>
                        <div class="d-flex gap-1 align-items-center mt-1">
                          <span class="badge bg-secondary bg-opacity-10 text-secondary" style="font-size:0.65rem;">v${vNum}</span>
                          ${isShared ? '<span class="badge bg-primary bg-opacity-10 text-primary" style="font-size:0.65rem;"><i class="bi bi-share-fill me-1"></i> Shared</span>' : ''}
                        </div>
                     </div>
                  </div>
                </td>
                <td><span class="badge bg-light text-dark border">${typeLabel}</span></td>
                <td class="text-muted small">${sizeFormatted}</td>
                <td class="text-muted small">${dateFormatted}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-light text-primary me-1" onclick="openShareModal('${file._id}', '${safeName}')" title="Share">
                        <i class="bi bi-share"></i>
                    </button>
                    <button class="btn btn-sm btn-light text-primary me-1" onclick="openPreview('${file._id}', '${safeName}', '${safeMime}', ${file.size})" title="Preview">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-light text-success me-1" onclick="downloadFile('${file._id}', '${safeName}')" title="Download">
                        <i class="bi bi-download"></i>
                    </button>
                    <div class="dropdown d-inline-block">
                        <button class="btn btn-sm btn-light text-muted" data-bs-toggle="dropdown">
                            <i class="bi bi-three-dots-vertical"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                            <li><a class="dropdown-item" href="#" onclick="openVersionModal('${file._id}', '${safeName}')"><i class="bi bi-clock-history me-2"></i> Version History (v${vNum})</a></li>
                            <li><a class="dropdown-item" href="#" onclick="openShareModal('${file._id}', '${safeName}')"><i class="bi bi-share me-2"></i> Share Settings</a></li>
                            <li><a class="dropdown-item" href="#" onclick="promptRename('file', '${file._id}', '${safeName}')"><i class="bi bi-pencil me-2"></i> Rename</a></li>
                            <li><a class="dropdown-item" href="#" onclick="promptMove('${file._id}', '${safeName}')"><i class="bi bi-folder-symlink me-2"></i> Move to Folder</a></li>
                            <li><a class="dropdown-item" href="#" onclick="copyFile('${file._id}', '${safeName}')"><i class="bi bi-files me-2"></i> Make a Copy</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item text-danger" href="#" onclick="promptDelete('file', '${file._id}', '${safeName}')"><i class="bi bi-trash me-2"></i> Delete</a></li>
                        </ul>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        }

        // 2. Grid View Card
        if (gridBody) {
            const card = document.createElement('div');
            card.className = 'file-grid-card';
            
            let thumbContent = getFileIcon(file.mimeType, file.originalName);
            card.innerHTML = `
                <div>
                    <div class="file-grid-thumb" role="button" onclick="openPreview('${file._id}', '${safeName}', '${safeMime}', ${file.size})">
                        ${thumbContent}
                    </div>
                    <div class="fw-semibold text-truncate text-dark small" title="${safeName}">${safeName}</div>
                    <div class="d-flex justify-content-between align-items-center mt-1">
                        <span class="text-muted" style="font-size: 0.75rem;">${sizeFormatted}</span>
                        <div class="d-flex gap-1 align-items-center">
                            <span class="badge bg-secondary bg-opacity-10 text-secondary" style="font-size: 0.65rem;">v${vNum}</span>
                            ${isShared ? '<span class="badge bg-primary bg-opacity-10 text-primary" style="font-size:0.65rem;"><i class="bi bi-share-fill"></i></span>' : `<span class="badge bg-light text-dark border" style="font-size: 0.65rem;">${typeLabel}</span>`}
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                    <span class="text-muted" style="font-size: 0.7rem;">${dateFormatted}</span>
                    <div>
                        <button class="btn btn-sm btn-light text-primary p-1 me-1" onclick="openShareModal('${file._id}', '${safeName}')" title="Share"><i class="bi bi-share"></i></button>
                        <button class="btn btn-sm btn-light text-primary p-1 me-1" onclick="openPreview('${file._id}', '${safeName}', '${safeMime}', ${file.size})" title="Preview"><i class="bi bi-eye"></i></button>
                        <button class="btn btn-sm btn-light text-success p-1 me-1" onclick="downloadFile('${file._id}', '${safeName}')" title="Download"><i class="bi bi-download"></i></button>
                        <div class="dropdown d-inline-block">
                            <button class="btn btn-sm btn-light text-muted p-1" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                                <li><a class="dropdown-item" href="#" onclick="openVersionModal('${file._id}', '${safeName}')"><i class="bi bi-clock-history me-2"></i> Version History (v${vNum})</a></li>
                                <li><a class="dropdown-item" href="#" onclick="openShareModal('${file._id}', '${safeName}')"><i class="bi bi-share me-2"></i> Share</a></li>
                                <li><a class="dropdown-item" href="#" onclick="promptRename('file', '${file._id}', '${safeName}')"><i class="bi bi-pencil me-2"></i> Rename</a></li>
                                <li><a class="dropdown-item" href="#" onclick="promptMove('${file._id}', '${safeName}')"><i class="bi bi-folder-symlink me-2"></i> Move</a></li>
                                <li><a class="dropdown-item" href="#" onclick="copyFile('${file._id}', '${safeName}')"><i class="bi bi-files me-2"></i> Duplicate</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger" href="#" onclick="promptDelete('file', '${file._id}', '${safeName}')"><i class="bi bi-trash me-2"></i> Delete</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
            gridBody.appendChild(card);
        }
    });
}

function renderPagination() {
    const ul = document.getElementById('paginationControls');
    if (!ul) return;
    ul.innerHTML = '';

    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="changePage(${i}, event)">${i}</a>`;
        ul.appendChild(li);
    }
}

window.changePage = function(page, event) {
    if (event) event.preventDefault();
    currentPage = page;
    fetchFilesAndFolders();
};

function handleSearchInput() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        currentPage = 1;
        fetchFilesAndFolders();
    }, 300);
}

function handleDebouncedFilterChange() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        currentPage = 1;
        fetchFilesAndFolders();
    }, 350);
}

function handleFilterChange() {
    currentPage = 1;
    fetchFilesAndFolders();
}

function handleDateFilterChange() {
    const val = document.getElementById('dateFilter')?.value;
    const customCollapse = document.getElementById('advancedFilterCollapse');
    if (val === 'custom' && customCollapse && !customCollapse.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(customCollapse).show();
        document.getElementById('startDateInput')?.focus();
    }
    handleFilterChange();
}

function handleSizeFilterChange() {
    const val = document.getElementById('sizeRangeFilter')?.value;
    const customCollapse = document.getElementById('advancedFilterCollapse');
    if (val === 'custom' && customCollapse && !customCollapse.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(customCollapse).show();
        document.getElementById('minSizeMbInput')?.focus();
    }
    handleFilterChange();
}

function resetAllFilters() {
    const searchInp = document.getElementById('searchInput');
    if (searchInp) searchInp.value = '';

    const typeSel = document.getElementById('typeFilter');
    if (typeSel) typeSel.value = 'all';

    const sizeSel = document.getElementById('sizeRangeFilter');
    if (sizeSel) sizeSel.value = 'all';

    const dateSel = document.getElementById('dateFilter');
    if (dateSel) dateSel.value = 'all';

    const sortSel = document.getElementById('sortSelect');
    if (sortSel) sortSel.value = 'date-desc';

    const extInp = document.getElementById('extInput');
    if (extInp) extInp.value = '';

    const scopeSel = document.getElementById('scopeFilter');
    if (scopeSel) scopeSel.value = 'my_files';

    const startInp = document.getElementById('startDateInput');
    if (startInp) startInp.value = '';

    const endInp = document.getElementById('endDateInput');
    if (endInp) endInp.value = '';

    const minSizeInp = document.getElementById('minSizeMbInput');
    if (minSizeInp) minSizeInp.value = '';

    const maxSizeInp = document.getElementById('maxSizeMbInput');
    if (maxSizeInp) maxSizeInp.value = '';

    const dupCheck = document.getElementById('duplicatesOnlyFilter');
    if (dupCheck) dupCheck.checked = false;

    currentPage = 1;
    fetchFilesAndFolders();
    showToast('Search filters reset.', 'bg-info');
}

/* ============================
   DUPLICATE FILES MANAGEMENT
============================ */
let activeDuplicateGroups = [];

async function fetchDuplicateCountBadge() {
    try {
        const res = await fetch(`${API_URL_FILES}/duplicates`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            const count = data.totalDuplicates !== undefined ? data.totalDuplicates : (data.totalRedundantCopies || 0);
            const badge = document.getElementById('duplicateNavBadge');
            if (badge) {
                if (count > 0) {
                    badge.innerText = count;
                    badge.classList.remove('d-none');
                } else {
                    badge.classList.add('d-none');
                }
            }
        }
    } catch (_) {}
}

async function fetchDuplicates() {
    showLoader(true);
    try {
        const res = await fetch(`${API_URL_FILES}/duplicates`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to fetch duplicate files');

        activeDuplicateGroups = data.duplicateGroups || [];

        const wastedBytes = data.wastedBytes !== undefined ? data.wastedBytes : (data.wastedStorage || 0);
        const groupCount = data.totalGroups !== undefined ? data.totalGroups : (data.totalDuplicateGroups || 0);
        const redundantCount = data.totalDuplicates !== undefined ? data.totalDuplicates : (data.totalRedundantCopies || 0);

        // Update Stats
        const wastedEl = document.getElementById('dupWastedStorage');
        if (wastedEl) wastedEl.innerText = formatBytes(wastedBytes);

        const groupCountEl = document.getElementById('dupGroupCount');
        if (groupCountEl) groupCountEl.innerText = groupCount;

        const redundantEl = document.getElementById('dupRedundantCount');
        if (redundantEl) redundantEl.innerText = redundantCount;

        const badge = document.getElementById('duplicateNavBadge');
        if (badge) {
            if (redundantCount > 0) {
                badge.innerText = redundantCount;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }

        renderDuplicates(activeDuplicateGroups);
    } catch (err) {
        showToast(err.message || 'Error loading duplicates', 'bg-danger');
    } finally {
        showLoader(false);
    }
}

function renderDuplicates(groups = []) {
    const container = document.getElementById('duplicatesListContainer');
    const emptyState = document.getElementById('duplicatesEmptyState');
    if (!container) return;

    container.innerHTML = '';
    if (!groups || groups.length === 0) {
        if (emptyState) emptyState.classList.remove('d-none');
        return;
    }
    if (emptyState) emptyState.classList.add('d-none');

    groups.forEach((group, gIdx) => {
        const groupCard = document.createElement('div');
        groupCard.className = 'glass-panel p-4 mb-3';
        
        const shortHash = (group.hash || '').substring(0, 16);
        const copyCount = group.count || group.files.length;
        const groupWasted = group.wastedStorage || ((copyCount - 1) * group.size);

        let rowsHtml = '';
        group.files.forEach((file, fIdx) => {
            const safeName = escapeHtml(file.originalName);
            const safeMime = escapeHtml(file.mimeType || '');
            const safeLocation = escapeHtml(file.folderName || 'Root / Home');
            const dateFormatted = new Date(file.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const isFirst = fIdx === 0;

            const otherFileIds = group.files.filter(f => f._id !== file._id).map(f => f._id);
            const otherIdsJson = JSON.stringify(otherFileIds).replace(/"/g, '&quot;');

            rowsHtml += `
                <tr>
                    <td style="width: 40px;">
                        <input class="form-check-input" type="radio" name="keepRadio_${gIdx}" id="radio_${file._id}" value="${file._id}" ${isFirst ? 'checked' : ''} title="Select this file to keep">
                    </td>
                    <td>
                        <div class="d-flex align-items-center gap-3">
                            ${getFileIcon(file.mimeType, file.originalName)}
                            <div>
                                <span class="fw-semibold text-dark text-truncate d-block" style="max-width: 280px;" title="${safeName}">${safeName}</span>
                                <small class="text-muted"><i class="bi bi-folder me-1"></i>${safeLocation}</small>
                            </div>
                        </div>
                    </td>
                    <td><span class="badge bg-light text-dark border">${(file.mimeType ? file.mimeType.split('/')[1] : 'FILE').toUpperCase()}</span></td>
                    <td class="text-muted small">${formatBytes(file.size)}</td>
                    <td class="text-muted small">${dateFormatted}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-light text-primary me-1" onclick="openPreview('${file._id}', '${safeName}', '${safeMime}', ${file.size})" title="Preview">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-light text-success me-1" onclick="downloadFile('${file._id}', '${safeName}')" title="Download">
                            <i class="bi bi-download"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="executeCleanSpecificGroup('${file._id}', ${otherIdsJson}, '${safeName}')" title="Keep this copy and trash all other duplicates in this group">
                            <i class="bi bi-check2-circle me-1"></i> Keep This &amp; Trash Others
                        </button>
                    </td>
                </tr>
            `;
        });

        groupCard.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 pb-2 border-bottom">
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-warning text-dark px-3 py-2 fw-bold"><i class="bi bi-files-alt me-1"></i> Duplicate Group #${gIdx + 1}</span>
                    <span class="badge bg-light text-secondary border font-monospace" title="SHA-256 Hash: ${escapeHtml(group.hash)}">sha256:${shortHash}...</span>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <small class="text-muted"><strong>${copyCount}</strong> identical copies</small>
                    <small class="text-danger fw-semibold"><i class="bi bi-arrow-down-circle me-1"></i>${formatBytes(groupWasted)} recoverable</small>
                    <button class="btn btn-sm btn-danger rounded-3" onclick="cleanGroupFromRadioSelection(${gIdx}, '${group.hash}')">
                        <i class="bi bi-trash me-1"></i> Clean Group
                    </button>
                </div>
            </div>

            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 custom-table">
                    <thead>
                        <tr>
                            <th scope="col" style="width: 40px;" title="Keep primary copy">Keep</th>
                            <th scope="col">File Name &amp; Location</th>
                            <th scope="col">Type</th>
                            <th scope="col">Size</th>
                            <th scope="col">Uploaded</th>
                            <th scope="col" class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        container.appendChild(groupCard);
    });
}

window.cleanGroupFromRadioSelection = function(gIdx, hash) {
    const radios = document.getElementsByName(`keepRadio_${gIdx}`);
    let keepFileId = null;
    for (const r of radios) {
        if (r.checked) {
            keepFileId = r.value;
            break;
        }
    }

    const group = activeDuplicateGroups[gIdx];
    if (!group) return;

    if (!keepFileId && group.files.length > 0) {
        keepFileId = group.files[0]._id;
    }

    const keepFile = group.files.find(f => f._id === keepFileId);
    const duplicateFileIds = group.files.filter(f => f._id !== keepFileId).map(f => f._id);
    
    executeCleanSpecificGroup(keepFileId, duplicateFileIds, keepFile?.originalName || 'Selected File');
};

window.executeCleanSpecificGroup = function(keepFileId, duplicateFileIds, keepFileName) {
    if (!duplicateFileIds || duplicateFileIds.length === 0) {
        showToast('No redundant duplicate copies to remove in this group.', 'bg-info');
        return;
    }

    const count = duplicateFileIds.length;
    const confirmMsg = `Are you sure you want to keep "${keepFileName}" and move the other ${count} duplicate ${count === 1 ? 'file' : 'files'} to the Recycle Bin?\n\nYou can restore them at any time from the Recycle Bin.`;

    if (confirm(confirmMsg)) {
        showLoader(true);
        fetch(`${API_URL_FILES}/duplicates/clean-group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                keepFileId,
                duplicateFileIds,
                permanent: false
            })
        })
        .then(res => res.json().then(data => ({ ok: res.ok, status: res.status, data })))
        .then(({ ok, data }) => {
            if (!ok) throw new Error(data.message || 'Failed to clean duplicate group');
            showToast(data.message || 'Duplicate copies moved to Recycle Bin!', 'bg-success');
            fetchDuplicates();
            fetchStorageAnalytics();
            fetchFilesAndFolders();
        })
        .catch(err => {
            showToast(err.message, 'bg-danger');
        })
        .finally(() => {
            showLoader(false);
        });
    }
};

/* ============================
   STATS & STORAGE ANALYTICS
============================ */
function updateDashboardStats(stats = {}) {
    const totalFiles = stats.totalFiles !== undefined ? stats.totalFiles : totalFilesCount;
    const usedStorage = stats.usedStorage !== undefined ? stats.usedStorage : (stats.totalStorage || 0);
    const quota = stats.storageQuota || (500 * 1024 * 1024);
    const available = stats.availableStorage !== undefined ? stats.availableStorage : Math.max(0, quota - usedStorage);
    const percent = stats.percentUsed !== undefined ? stats.percentUsed : Math.min(100, Math.round((usedStorage / quota) * 100));

    const totalFilesEl = document.getElementById('statTotalFiles');
    if (totalFilesEl) totalFilesEl.innerText = totalFiles;
    
    const storageEl = document.getElementById('statTotalStorage');
    if (storageEl) storageEl.innerText = formatBytes(usedStorage);

    const storagePercentEl = document.getElementById('statStoragePercent');
    if (storagePercentEl) storagePercentEl.innerText = `${percent}% of ${formatBytes(quota)}`;

    const foldersEl = document.getElementById('statTotalFolders');
    if (foldersEl) foldersEl.innerText = stats.totalFolders !== undefined ? stats.totalFolders : allFolders.length;

    const trashEl = document.getElementById('statTrashCount');
    if (trashEl) trashEl.innerText = stats.trashedFilesCount !== undefined ? (stats.trashedFilesCount + (stats.trashedFoldersCount || 0)) : trashItems.length;

    // Quota Progress Card
    const quotaBadge = document.getElementById('quotaBadge');
    if (quotaBadge) {
        quotaBadge.innerText = `${percent}% Used`;
        quotaBadge.className = `badge px-3 py-2 ${percent >= 90 ? 'bg-danger' : (percent >= 75 ? 'bg-warning text-dark' : 'bg-primary')}`;
    }

    const progBar = document.getElementById('storageProgressBar');
    if (progBar) {
        progBar.style.width = `${percent}%`;
        progBar.innerText = `${percent}%`;
        progBar.className = `progress-bar progress-bar-striped ${percent >= 90 ? 'bg-danger' : (percent >= 75 ? 'bg-warning text-dark' : 'bg-primary')}`;
    }

    const quotaUsedEl = document.getElementById('quotaUsedDisplay');
    if (quotaUsedEl) quotaUsedEl.innerText = formatBytes(usedStorage);

    const quotaAvailEl = document.getElementById('quotaAvailableDisplay');
    if (quotaAvailEl) quotaAvailEl.innerText = formatBytes(available);

    const quotaLimitEl = document.getElementById('quotaLimitDisplay');
    if (quotaLimitEl) quotaLimitEl.innerText = formatBytes(quota);

    // Warning Banner if approaching or exceeded limit
    const warningAlert = document.getElementById('storageWarningAlert');
    const warningTitle = document.getElementById('storageWarningTitle');
    const warningText = document.getElementById('storageWarningText');

    if (warningAlert) {
        if (percent >= 90 || stats.isQuotaExceeded) {
            warningAlert.classList.remove('d-none');
            warningAlert.className = 'alert alert-danger d-flex align-items-center justify-content-between p-3 mb-4 rounded-4 shadow-sm border-0';
            if (warningTitle) warningTitle.innerText = percent >= 100 ? 'Storage Quota Exceeded!' : 'Critical Storage Warning';
            if (warningText) warningText.innerText = `You have used ${percent}% of your storage quota (${formatBytes(usedStorage)} / ${formatBytes(quota)}). Please clean up old files or empty your Recycle Bin to prevent upload failures.`;
        } else if (percent >= 80) {
            warningAlert.classList.remove('d-none');
            warningAlert.className = 'alert alert-warning d-flex align-items-center justify-content-between p-3 mb-4 rounded-4 shadow-sm border-0';
            if (warningTitle) warningTitle.innerText = 'Storage Warning';
            if (warningText) warningText.innerText = `You have used ${percent}% of your storage space. Consider deleting unused files.`;
        } else {
            warningAlert.classList.add('d-none');
        }
    }
}

async function fetchStorageAnalytics() {
    try {
        const res = await fetch(`${API_URL_FILES}/analytics`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.stats) updateDashboardStats(data.stats);
            if (data.storageByType) renderStorageCategoryGrid(data.storageByType);
            if (data.largestFiles) renderLargestFilesList(data.largestFiles);
        }
    } catch (_) {}
}

function renderStorageCategoryGrid(byType = {}) {
    const container = document.getElementById('storageCategoryGrid');
    if (!container) return;

    const categories = [
        { key: 'documents', label: 'Documents & PDFs', icon: 'bi-file-earmark-text', color: 'primary', bg: 'bg-primary bg-opacity-10 text-primary' },
        { key: 'images', label: 'Photos & Images', icon: 'bi-file-earmark-image', color: 'success', bg: 'bg-success bg-opacity-10 text-success' },
        { key: 'videos', label: 'Videos & Media', icon: 'bi-file-earmark-play', color: 'warning', bg: 'bg-warning bg-opacity-10 text-warning' },
        { key: 'audio', label: 'Audio & Music', icon: 'bi-file-earmark-music', color: 'info', bg: 'bg-info bg-opacity-10 text-info' },
        { key: 'code_text', label: 'Code & Text', icon: 'bi-file-earmark-code', color: 'dark', bg: 'bg-dark bg-opacity-10 text-dark' },
        { key: 'others', label: 'Other Formats', icon: 'bi-file-earmark', color: 'secondary', bg: 'bg-secondary bg-opacity-10 text-secondary' }
    ];

    let html = '';
    categories.forEach(cat => {
        const item = byType[cat.key] || { count: 0, size: 0 };
        html += `
            <div class="col-lg-2 col-md-4 col-6">
                <div class="type-breakdown-card h-100">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="type-badge-icon ${cat.bg}">
                            <i class="bi ${cat.icon}"></i>
                        </div>
                        <div class="text-truncate">
                            <span class="fw-bold small text-dark d-block text-truncate">${cat.label}</span>
                            <small class="text-muted" style="font-size: 0.72rem;">${item.count} file${item.count !== 1 ? 's' : ''}</small>
                        </div>
                    </div>
                    <div class="fw-bold text-dark mt-2" style="font-size: 0.95rem;">${formatBytes(item.size)}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderLargestFilesList(files = []) {
    const list = document.getElementById('largestFilesList');
    if (!list) return;

    if (!files || files.length === 0) {
        list.innerHTML = '<div class="text-center py-4 text-muted small">No files in your cloud storage yet.</div>';
        return;
    }

    let html = '';
    files.forEach(file => {
        const safeName = escapeHtml(file.originalName);
        const safeMime = escapeHtml(file.mimeType || '');
        const sizeFormatted = formatBytes(file.size);
        const vNum = file.version || 1;

        html += `
            <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                <div class="d-flex align-items-center gap-2 text-truncate me-2">
                    <div style="font-size: 1.25rem;">${getFileIcon(file.mimeType, file.originalName)}</div>
                    <div class="text-truncate">
                        <span class="fw-semibold text-dark text-truncate d-block small" title="${safeName}">${safeName}</span>
                        <div class="d-flex gap-2 align-items-center">
                            <span class="text-muted" style="font-size: 0.72rem;">${sizeFormatted}</span>
                            <span class="badge bg-secondary bg-opacity-10 text-secondary" style="font-size: 0.65rem;">v${vNum}</span>
                        </div>
                    </div>
                </div>
                <div class="d-flex gap-1 align-items-center">
                    <button class="btn btn-sm btn-light text-primary p-1" onclick="openPreview('${file._id}', '${safeName}', '${safeMime}', ${file.size})" title="Preview">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-light text-success p-1" onclick="downloadFile('${file._id}', '${safeName}')" title="Download">
                        <i class="bi bi-download"></i>
                    </button>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

/* ============================
   UPLOAD LOGIC (MULTI-FILE & DRAG-AND-DROP)
============================ */
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length) {
            uploadFiles(dt.files);
        }
    }, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleFileInputSelect(e) {
    if (this.files && this.files.length) {
        uploadFiles(this.files);
    }
}

window.cancelActiveUpload = function() {
    if (activeUploadXhr) {
        activeUploadXhr.abort();
        activeUploadXhr = null;
        showToast('Upload cancelled.', 'bg-info');
    }
    const progContainer = document.getElementById('uploadProgressContainer');
    if (progContainer) progContainer.classList.add('d-none');
    document.getElementById('fileInput').value = '';
};

function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const folderSelect = document.getElementById('uploadFolderSelect');
    const targetFolder = (folderSelect && folderSelect.value !== 'root') ? folderSelect.value : currentFolderId;

    const formData = new FormData();
    if (targetFolder) formData.append('folderId', targetFolder);

    for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]);
    }

    const progContainer = document.getElementById('uploadProgressContainer');
    const progBar = document.getElementById('uploadProgressBar');
    const statusText = document.getElementById('uploadStatusText');

    if (progContainer) progContainer.classList.remove('d-none');
    if (statusText) statusText.innerText = `Uploading ${fileList.length} file${fileList.length > 1 ? 's' : ''}...`;
    if (progBar) {
        progBar.style.width = '0%';
        progBar.innerText = '0%';
    }

    const xhr = new XMLHttpRequest();
    activeUploadXhr = xhr;

    xhr.open('POST', `${API_URL_FILES}/upload`, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            if (progBar) {
                progBar.style.width = percentComplete + '%';
                progBar.innerText = percentComplete + '%';
            }
            if (statusText) {
                statusText.innerText = `Uploading ${fileList.length} file${fileList.length > 1 ? 's' : ''} (${percentComplete}%)...`;
            }
        }
    };

    xhr.onload = function() {
        activeUploadXhr = null;
        if (xhr.status === 201) {
            showToast('Files uploaded successfully!', 'bg-success');
            if (progBar) {
                progBar.style.width = '100%';
                progBar.innerText = '100%';
            }
            setTimeout(() => {
                if (progContainer) progContainer.classList.add('d-none');
                document.getElementById('fileInput').value = '';
                fetchFilesAndFolders();
                fetchStorageAnalytics();
            }, 800);
        } else {
            let errorMsg = 'Error uploading files.';
            try {
                const res = JSON.parse(xhr.responseText);
                errorMsg = res.message || errorMsg;
            } catch (_) {}
            showToast(errorMsg, 'bg-danger');
            if (progContainer) progContainer.classList.add('d-none');
        }
    };

    xhr.onerror = function() {
        activeUploadXhr = null;
        showToast('Network error during upload.', 'bg-danger');
        if (progContainer) progContainer.classList.add('d-none');
    };

    xhr.onabort = function() {
        activeUploadXhr = null;
    };

    xhr.send(formData);
}

/* ============================
   FOLDER MANAGEMENT
============================ */
window.openNewFolderModal = function() {
    document.getElementById('newFolderName').value = '';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('newFolderModal'));
    modal.show();
};

async function executeCreateFolder() {
    const nameInput = document.getElementById('newFolderName');
    const name = (nameInput.value || '').trim();
    if (!name) {
        showToast('Please enter a folder name.', 'bg-danger');
        return;
    }

    try {
        const res = await fetch(`${API_URL_FILES}/folders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                parentId: currentFolderId
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to create folder');

        showToast('Folder created successfully!', 'bg-success');
        bootstrap.Modal.getInstance(document.getElementById('newFolderModal')).hide();
        fetchAllFoldersForDropdowns();
        fetchFilesAndFolders();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
}

/* ============================
   RENAME, MOVE, COPY, DELETE ACTIONS
============================ */
window.promptRename = function(type, id, currentName) {
    itemToRename = { type, id, name: currentName };
    const input = document.getElementById('renameInput');
    input.value = currentName;
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('renameModal'));
    modal.show();
};

async function executeRename() {
    if (!itemToRename) return;
    const newName = (document.getElementById('renameInput').value || '').trim();
    if (!newName) {
        showToast('Please enter a valid name.', 'bg-danger');
        return;
    }

    const endpoint = itemToRename.type === 'folder'
        ? `${API_URL_FILES}/folders/${itemToRename.id}/rename`
        : `${API_URL_FILES}/${itemToRename.id}/rename`;

    try {
        const res = await fetch(endpoint, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: newName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Rename failed');

        showToast(`${itemToRename.type === 'folder' ? 'Folder' : 'File'} renamed successfully!`, 'bg-success');
        bootstrap.Modal.getInstance(document.getElementById('renameModal')).hide();
        fetchAllFoldersForDropdowns();
        if (currentActiveSection === 'sharedSection') {
            fetchSharedWithMe();
        } else {
            fetchFilesAndFolders();
        }
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
}

window.promptMove = function(fileId, fileName) {
    fileToMove = { id: fileId, name: fileName };
    document.getElementById('moveFileName').innerText = fileName;
    populateFolderDropdowns();
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('moveModal'));
    modal.show();
};

async function executeMove() {
    if (!fileToMove) return;
    const targetFolderId = document.getElementById('moveFolderSelect').value;

    try {
        const res = await fetch(`${API_URL_FILES}/${fileToMove.id}/move`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ folderId: targetFolderId === 'root' ? null : targetFolderId })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Move failed');

        showToast('File moved successfully!', 'bg-success');
        bootstrap.Modal.getInstance(document.getElementById('moveModal')).hide();
        fetchFilesAndFolders();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    }
}

window.copyFile = async function(fileId, fileName) {
    showLoader(true);
    try {
        const res = await fetch(`${API_URL_FILES}/${fileId}/copy`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Copy failed');

        showToast('File copied to your storage!', 'bg-success');
        if (currentActiveSection === 'sharedSection') {
            fetchSharedWithMe();
        } else {
            fetchFilesAndFolders();
        }
    } catch (err) {
        showToast(err.message, 'bg-danger');
    } finally {
        showLoader(false);
    }
};

/* ============================
   RECYCLE BIN & DELETE OPERATIONS
============================ */
window.promptDelete = function(type, id, name) {
    itemToDelete = { type, id, name };
    const titleEl = document.getElementById('deleteModalTitle');
    const bodyEl = document.getElementById('deleteModalBody');
    const btnEl = document.getElementById('confirmDeleteBtn');

    if (titleEl) titleEl.innerHTML = '<i class="bi bi-trash me-2"></i> Move to Recycle Bin';
    if (bodyEl) bodyEl.innerHTML = `Are you sure you want to move <strong>${escapeHtml(name)}</strong> to the Recycle Bin? You can restore it later.`;
    if (btnEl) {
        btnEl.innerText = 'Move to Trash';
        btnEl.className = 'btn btn-danger';
    }

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteModal'));
    modal.show();
};

window.promptPermanentDelete = function(type, id, name) {
    itemToDelete = { type: 'trash_' + type, id, name };
    const titleEl = document.getElementById('deleteModalTitle');
    const bodyEl = document.getElementById('deleteModalBody');
    const btnEl = document.getElementById('confirmDeleteBtn');

    if (titleEl) titleEl.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-2"></i> Permanent Deletion';
    if (bodyEl) bodyEl.innerHTML = `Are you sure you want to <strong>permanently delete</strong> <strong>${escapeHtml(name)}</strong>? This action <strong>cannot be undone</strong> and all version files will be deleted from storage disk.`;
    if (btnEl) {
        btnEl.innerText = 'Delete Permanently';
        btnEl.className = 'btn btn-danger';
    }

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteModal'));
    modal.show();
};

window.promptEmptyTrash = function() {
    if (trashItems.length === 0) {
        showToast('Recycle Bin is already empty.', 'bg-info');
        return;
    }
    itemToDelete = { type: 'trash_empty' };
    const titleEl = document.getElementById('deleteModalTitle');
    const bodyEl = document.getElementById('deleteModalBody');
    const btnEl = document.getElementById('confirmDeleteBtn');

    if (titleEl) titleEl.innerHTML = '<i class="bi bi-trash3-fill me-2"></i> Empty Recycle Bin';
    if (bodyEl) bodyEl.innerHTML = `Are you sure you want to permanently delete <strong>all items</strong> in your Recycle Bin? This action cannot be undone.`;
    if (btnEl) {
        btnEl.innerText = 'Empty Everything';
        btnEl.className = 'btn btn-danger';
    }

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteModal'));
    modal.show();
};

async function executeDelete() {
    if (!itemToDelete) return;
    const modalEl = document.getElementById('deleteModal');
    const modalInst = bootstrap.Modal.getInstance(modalEl);

    let endpoint = '';
    if (itemToDelete.type === 'folder') {
        endpoint = `${API_URL_FILES}/folders/${itemToDelete.id}`;
    } else if (itemToDelete.type === 'shared_leave') {
        endpoint = `${API_URL_FILES}/shared/${itemToDelete.id}/leave`;
    } else if (itemToDelete.type === 'trash_file') {
        endpoint = `${API_URL_FILES}/trash/${itemToDelete.id}/permanent`;
    } else if (itemToDelete.type === 'trash_folder') {
        endpoint = `${API_URL_FILES}/folders/trash/${itemToDelete.id}/permanent`;
    } else if (itemToDelete.type === 'trash_empty') {
        endpoint = `${API_URL_FILES}/trash/empty`;
    } else {
        endpoint = `${API_URL_FILES}/${itemToDelete.id}`;
    }

    try {
        const res = await fetch(endpoint, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Action failed');

        showToast(data.message || 'Action completed successfully', 'bg-success');
        if (modalInst) modalInst.hide();
        fetchAllFoldersForDropdowns();
        
        if (currentActiveSection === 'sharedSection') {
            fetchSharedWithMe();
        } else if (currentActiveSection === 'trashSection') {
            fetchTrash();
        } else {
            fetchFilesAndFolders();
        }
    } catch (err) {
        showToast(err.message || 'Error during operation', 'bg-danger');
    }
}

async function fetchTrash() {
    showLoader(true);
    try {
        const res = await fetch(`${API_URL_FILES}/trash`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Failed to fetch recycle bin items');

        const data = await res.json();
        trashItems = data.items || [];
        renderTrash();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    } finally {
        showLoader(false);
    }
}

function renderTrash() {
    const tbody = document.getElementById('trashTableBody');
    const emptyState = document.getElementById('trashEmptyState');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (trashItems.length === 0) {
        if (emptyState) emptyState.classList.remove('d-none');
        return;
    }
    if (emptyState) emptyState.classList.add('d-none');

    trashItems.forEach(item => {
        const safeName = escapeHtml(item.originalName);
        const dateFormatted = item.deletedAt ? new Date(item.deletedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
        const sizeFormatted = item.type === 'folder' ? '-' : formatBytes(item.size);
        const icon = item.type === 'folder' 
            ? '<i class="bi bi-folder-fill text-warning fs-5"></i>' 
            : getFileIcon(item.mimeType);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
              <div class="d-flex align-items-center gap-3">
                 ${icon}
                 <div>
                    <span class="fw-semibold text-truncate d-block" style="max-width: 250px;" title="${safeName}">${safeName}</span>
                 </div>
              </div>
            </td>
            <td><span class="badge ${item.type === 'folder' ? 'bg-warning bg-opacity-10 text-dark border' : 'bg-light text-dark border'}">${item.type.toUpperCase()}</span></td>
            <td class="text-muted small">${escapeHtml(item.originalLocation || 'Root')}</td>
            <td class="text-muted small">${sizeFormatted}</td>
            <td class="text-muted small">${dateFormatted}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-success me-1" onclick="restoreTrashItem('${item.type}', '${item._id}')" title="Restore">
                    <i class="bi bi-arrow-counterclockwise me-1"></i> Restore
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="promptPermanentDelete('${item.type}', '${item._id}', '${safeName}')" title="Delete Permanently">
                    <i class="bi bi-trash3"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.restoreTrashItem = async function(type, id) {
    showLoader(true);
    const endpoint = type === 'folder'
        ? `${API_URL_FILES}/folders/trash/${id}/restore`
        : `${API_URL_FILES}/trash/${id}/restore`;

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to restore item');

        showToast(data.message || 'Restored successfully', 'bg-success');
        fetchAllFoldersForDropdowns();
        fetchTrash();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    } finally {
        showLoader(false);
    }
};

/* ============================
   FILE VERSION HISTORY
============================ */
window.openVersionModal = function(fileId, fileName) {
    activeVersionFileId = fileId;
    document.getElementById('versionModalFileName').innerText = `Versions: ${fileName}`;
    document.getElementById('versionFileInput').value = '';
    document.getElementById('versionSummaryInput').value = '';

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('versionModal'));
    modal.show();

    fetchVersionHistory(fileId);
};

async function fetchVersionHistory(fileId) {
    const tbody = document.getElementById('versionTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Loading versions...</td></tr>';

    try {
        const res = await fetch(`${API_URL_FILES}/${fileId}/versions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load version history');

        const uploadContainer = document.getElementById('uploadVersionContainer');
        if (uploadContainer) {
            if (data.canEdit) uploadContainer.classList.remove('d-none');
            else uploadContainer.classList.add('d-none');
        }

        tbody.innerHTML = '';
        if (!data.versions || data.versions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No version history available.</td></tr>';
            return;
        }

        data.versions.forEach(v => {
            const tr = document.createElement('tr');
            if (v.isCurrent) tr.className = 'table-primary bg-opacity-25';

            const dateFormatted = new Date(v.uploadedAt).toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const sizeFormatted = formatBytes(v.size);
            const uploaderName = escapeHtml(v.uploadedBy?.username || 'Owner');
            const summary = escapeHtml(v.changeSummary || (v.isCurrent ? 'Current Version' : `Version ${v.versionNumber}`));

            tr.innerHTML = `
                <td>
                    <span class="fw-bold">v${v.versionNumber}</span>
                    ${v.isCurrent ? '<span class="badge bg-success ms-2">Current</span>' : ''}
                </td>
                <td class="small text-truncate" style="max-width: 180px;" title="${summary}">${summary}</td>
                <td class="small text-muted">${sizeFormatted}</td>
                <td class="small text-muted">${uploaderName}</td>
                <td class="small text-muted">${dateFormatted}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-light text-primary me-1" onclick="openVersionPreview('${fileId}', ${v.versionNumber}, '${escapeHtml(data.fileName)}', '${v.mimeType}', ${v.size})" title="Preview Version">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${data.canDownload ? `
                    <button class="btn btn-sm btn-light text-success me-1" onclick="downloadVersion('${fileId}', ${v.versionNumber}, '${escapeHtml(data.fileName)}')" title="Download Version">
                        <i class="bi bi-download"></i>
                    </button>` : ''}
                    ${(!v.isCurrent && data.canEdit) ? `
                    <button class="btn btn-sm btn-outline-primary" onclick="restoreVersion('${fileId}', ${v.versionNumber})" title="Restore this version">
                        <i class="bi bi-arrow-counterclockwise me-1"></i> Restore
                    </button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">${escapeHtml(err.message)}</td></tr>`;
    }
}

window.executeUploadVersion = async function() {
    if (!activeVersionFileId) return;

    const fileInput = document.getElementById('versionFileInput');
    const summaryInput = document.getElementById('versionSummaryInput');

    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Please select a file to upload as the new version.', 'bg-danger');
        return;
    }

    const file = fileInput.files[0];
    const summary = (summaryInput.value || '').trim();

    const formData = new FormData();
    formData.append('versionFile', file);
    if (summary) formData.append('changeSummary', summary);

    const btn = document.getElementById('uploadVersionBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Uploading...';
    }

    try {
        const res = await fetch(`${API_URL_FILES}/${activeVersionFileId}/versions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to upload version');

        showToast(data.message || 'New version uploaded successfully!', 'bg-success');
        fileInput.value = '';
        summaryInput.value = '';

        fetchVersionHistory(activeVersionFileId);
        fetchFilesAndFolders();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-cloud-arrow-up me-1"></i> Upload Version';
        }
    }
};

window.restoreVersion = async function(fileId, versionNumber) {
    if (!confirm(`Restore Version ${versionNumber}? This will create a new current version from Version ${versionNumber} without losing any previous versions.`)) {
        return;
    }

    showLoader(true);
    try {
        const res = await fetch(`${API_URL_FILES}/${fileId}/versions/${versionNumber}/restore`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to restore version');

        showToast(data.message || 'Version restored successfully!', 'bg-success');
        fetchVersionHistory(fileId);
        fetchFilesAndFolders();
    } catch (err) {
        showToast(err.message, 'bg-danger');
    } finally {
        showLoader(false);
    }
};

window.openVersionPreview = async function(fileId, versionNumber, filename, mimeType, size) {
    const modalEl = document.getElementById('viewModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    document.getElementById('previewFileName').innerText = `${filename} (v${versionNumber})`;
    document.getElementById('previewFileType').innerText = (mimeType.split('/')[1] || 'FILE').toUpperCase();
    document.getElementById('previewFileSize').innerText = formatBytes(size);
    document.getElementById('previewFileIcon').innerHTML = getFileIcon(mimeType);

    const dlBtn = document.getElementById('previewDownloadBtn');
    dlBtn.onclick = () => downloadVersion(fileId, versionNumber, filename);

    const loader = document.getElementById('previewLoader');
    const container = document.getElementById('previewContainer');
    const errorBox = document.getElementById('previewError');

    loader.classList.remove('d-none');
    container.classList.add('d-none');
    errorBox.classList.add('d-none');
    container.innerHTML = '';

    modal.show();

    try {
        const res = await fetch(`${API_URL_FILES}/${fileId}/versions/${versionNumber}/preview`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({ message: 'Preview failed' }));
            throw new Error(errData.message || 'Could not load version preview');
        }

        const blob = await res.blob();
        if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = URL.createObjectURL(blob);

        loader.classList.add('d-none');
        container.classList.remove('d-none');

        if (mimeType.startsWith('image/')) {
            container.innerHTML = `<img src="${currentPreviewUrl}" class="img-fluid rounded shadow-sm" style="max-height: 65vh; object-fit: contain;" alt="${escapeHtml(filename)}">`;
        } else if (mimeType === 'application/pdf') {
            container.innerHTML = `<iframe src="${currentPreviewUrl}#toolbar=1" class="w-100 rounded" style="height: 65vh; border: none;"></iframe>`;
        } else if (mimeType.startsWith('video/')) {
            container.innerHTML = `<video controls autoplay class="w-100 rounded shadow-sm" style="max-height: 65vh;"><source src="${currentPreviewUrl}" type="${mimeType}">Your browser does not support video.</video>`;
        } else if (mimeType.startsWith('audio/')) {
            container.innerHTML = `
                <div class="py-5">
                    <i class="bi bi-music-note-beamed text-primary" style="font-size: 4rem;"></i>
                    <h6 class="mt-3 fw-semibold">${escapeHtml(filename)} (v${versionNumber})</h6>
                    <audio controls autoplay class="w-75 mt-3"><source src="${currentPreviewUrl}" type="${mimeType}">Your browser does not support audio.</audio>
                </div>
            `;
        } else if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'text/csv' || mimeType === 'text/markdown') {
            const textContent = await blob.text();
            container.innerHTML = `
                <div class="text-start w-100">
                    <pre class="p-3 bg-dark text-light rounded font-monospace" style="max-height: 60vh; overflow: auto; white-space: pre-wrap; font-size: 0.85rem;"><code>${escapeHtml(textContent)}</code></pre>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="py-5 text-center">
                    <div class="mb-3" style="font-size: 3.5rem;">${getFileIcon(mimeType, filename)}</div>
                    <h5 class="mt-2 fw-bold text-dark">${escapeHtml(filename)} (v${versionNumber})</h5>
                    <p class="text-muted small">Preview not available for this document format.</p>
                    <button class="btn btn-primary-custom px-4 mt-2" style="width: auto;" onclick="downloadVersion('${fileId}', ${versionNumber}, '${escapeHtml(filename)}')">
                        <i class="bi bi-download me-1"></i> Download File
                    </button>
                </div>
            `;
        }
    } catch (err) {
        loader.classList.add('d-none');
        container.classList.add('d-none');
        errorBox.classList.remove('d-none');
        document.getElementById('previewErrorMsg').innerText = err.message || 'An error occurred.';
    }
};

window.downloadVersion = function(fileId, versionNumber, filename) {
    fetch(`${API_URL_FILES}/${fileId}/versions/${versionNumber}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `v${versionNumber}_${filename}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(err => {
        showToast(err.message || 'Error downloading version', 'bg-danger');
    });
};

/* ============================
   PREVIEW & DOWNLOAD
============================ */
window.openPreview = async function(id, filename, mimeType, size) {
    const modalEl = document.getElementById('viewModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    document.getElementById('previewFileName').innerText = filename;
    document.getElementById('previewFileType').innerText = (mimeType.split('/')[1] || 'FILE').toUpperCase();
    document.getElementById('previewFileSize').innerText = formatBytes(size);
    document.getElementById('previewFileIcon').innerHTML = getFileIcon(mimeType, filename);

    const dlBtn = document.getElementById('previewDownloadBtn');
    dlBtn.onclick = () => downloadFile(id, filename);

    const loader = document.getElementById('previewLoader');
    const container = document.getElementById('previewContainer');
    const errorBox = document.getElementById('previewError');

    loader.classList.remove('d-none');
    container.classList.add('d-none');
    errorBox.classList.add('d-none');
    container.innerHTML = '';

    modal.show();

    try {
        const res = await fetch(`${API_URL_FILES}/preview/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({ message: 'Preview failed' }));
            throw new Error(errData.message || 'Could not load preview');
        }

        const blob = await res.blob();
        if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = URL.createObjectURL(blob);

        loader.classList.add('d-none');
        container.classList.remove('d-none');

        if (mimeType.startsWith('image/')) {
            container.innerHTML = `<img src="${currentPreviewUrl}" class="img-fluid rounded shadow-sm" style="max-height: 65vh; object-fit: contain;" alt="${escapeHtml(filename)}">`;
        } else if (mimeType === 'application/pdf') {
            container.innerHTML = `<iframe src="${currentPreviewUrl}#toolbar=1" class="w-100 rounded" style="height: 65vh; border: none;"></iframe>`;
        } else if (mimeType.startsWith('video/')) {
            container.innerHTML = `<video controls autoplay class="w-100 rounded shadow-sm" style="max-height: 65vh;"><source src="${currentPreviewUrl}" type="${mimeType}">Your browser does not support HTML video.</video>`;
        } else if (mimeType.startsWith('audio/')) {
            container.innerHTML = `
                <div class="py-5">
                    <i class="bi bi-music-note-beamed text-primary" style="font-size: 4rem;"></i>
                    <h6 class="mt-3 fw-semibold">${escapeHtml(filename)}</h6>
                    <audio controls autoplay class="w-75 mt-3"><source src="${currentPreviewUrl}" type="${mimeType}">Your browser does not support audio.</audio>
                </div>
            `;
        } else if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'text/csv' || mimeType === 'text/markdown') {
            const textContent = await blob.text();
            container.innerHTML = `
                <div class="text-start w-100">
                    <pre class="p-3 bg-dark text-light rounded font-monospace" style="max-height: 60vh; overflow: auto; white-space: pre-wrap; font-size: 0.85rem;"><code>${escapeHtml(textContent)}</code></pre>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="py-5 text-center">
                    <div class="mb-3" style="font-size: 3.5rem;">${getFileIcon(mimeType, filename)}</div>
                    <h5 class="mt-2 fw-bold text-dark">${escapeHtml(filename)}</h5>
                    <p class="text-muted small">Preview not available for this document format.</p>
                    <button class="btn btn-primary-custom px-4 mt-2" style="width: auto;" onclick="downloadFile('${id}', '${escapeHtml(filename)}')">
                        <i class="bi bi-download me-1"></i> Download File
                    </button>
                </div>
            `;
        }
    } catch (err) {
        loader.classList.add('d-none');
        container.classList.add('d-none');
        errorBox.classList.remove('d-none');
        document.getElementById('previewErrorMsg').innerText = err.message || 'An error occurred.';
    }
};

window.downloadFile = function(id, filename) {
    fetch(`${API_URL_FILES}/download/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
        if (response.status === 403) {
            throw new Error('Download is not permitted for view-only access.');
        }
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(err => {
        showToast(err.message || 'Error downloading file', 'bg-danger');
    });
};

/* ============================
   UTILITIES
============================ */
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function showLoader(show) {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = show ? 'block' : 'none';
}

function showToast(message, colorClass = 'bg-primary') {
    const toastEl = document.getElementById('appToast');
    const toastBody = document.getElementById('toastMessage');
    if (!toastEl || !toastBody) return;
    
    toastEl.classList.remove('bg-primary', 'bg-success', 'bg-danger', 'text-bg-primary');
    toastEl.classList.add(colorClass, 'text-white');
    
    toastBody.innerText = message;
    
    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3000 });
    toast.show();
}

function escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ============================
   NOTIFICATIONS & ACTIVITY DASHBOARD
============================ */

// Activity Center Sub-Tab Switcher
window.switchActivitySubTab = function(subTab) {
    const streamPane = document.getElementById('activityStreamPane');
    const notifPane = document.getElementById('notificationCenterPane');
    const tabStreamBtn = document.getElementById('tabActivityStream');
    const tabNotifBtn = document.getElementById('tabNotificationCenter');

    if (subTab === 'notifications') {
        if (streamPane) streamPane.classList.add('d-none');
        if (notifPane) notifPane.classList.remove('d-none');
        if (tabStreamBtn) tabStreamBtn.classList.remove('active');
        if (tabNotifBtn) tabNotifBtn.classList.add('active');
        fetchNotifications();
    } else {
        if (streamPane) streamPane.classList.remove('d-none');
        if (notifPane) notifPane.classList.add('d-none');
        if (tabStreamBtn) tabStreamBtn.classList.add('active');
        if (tabNotifBtn) tabNotifBtn.classList.remove('active');
        fetchActivities();
        fetchActivitySummary();
    }
};

// ----------------------------
// Notification API & Rendering
// ----------------------------
async function fetchNotificationCount() {
    if (!token) return;
    try {
        const res = await fetch(`${API_URL_NOTIFICATIONS}/unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            notificationUnreadCount = data.unreadCount || 0;
            updateNotificationBadges(notificationUnreadCount);
        }
    } catch (_) {}
}

function updateNotificationBadges(count) {
    const topBadge = document.getElementById('notificationBadge');
    const headerBadge = document.getElementById('notificationHeaderBadge');
    const navBadge = document.getElementById('activityUnreadNavBadge');

    if (topBadge) {
        if (count > 0) {
            topBadge.innerText = count > 99 ? '99+' : count;
            topBadge.classList.remove('d-none');
        } else {
            topBadge.classList.add('d-none');
        }
    }

    if (headerBadge) {
        if (count > 0) {
            headerBadge.innerText = `${count} unread`;
            headerBadge.classList.remove('d-none');
        } else {
            headerBadge.classList.add('d-none');
        }
    }

    if (navBadge) {
        if (count > 0) {
            navBadge.innerText = count > 99 ? '99+' : count;
            navBadge.classList.remove('d-none');
        } else {
            navBadge.classList.add('d-none');
        }
    }
}

async function fetchNotifications() {
    if (!token) return;
    try {
        const status = document.getElementById('notificationStatusFilter')?.value || 'all';
        const params = new URLSearchParams({
            page: notificationCurrentPage,
            limit: 10,
            status: status
        });

        const res = await fetch(`${API_URL_NOTIFICATIONS}?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            notificationsList = data.notifications || [];
            notificationTotalPages = data.totalPages || 1;
            notificationUnreadCount = data.unreadCount !== undefined ? data.unreadCount : notificationUnreadCount;
            updateNotificationBadges(notificationUnreadCount);
            renderNotifications();
            renderQuickNotifications();
        }
    } catch (_) {}
}

function renderQuickNotifications() {
    const listEl = document.getElementById('notificationQuickList');
    if (!listEl) return;

    if (!notificationsList || notificationsList.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="bi bi-bell-slash fs-3 d-block mb-2 text-secondary"></i>
                <span class="small">No notifications at this time</span>
            </div>
        `;
        return;
    }

    let html = '';
    notificationsList.slice(0, 5).forEach(n => {
        const iconInfo = getNotificationIconInfo(n.type);
        const isUnread = !n.isRead;
        const timeAgo = formatTimeAgo(n.createdAt);

        html += `
            <div class="p-3 border-bottom list-group-item-action ${isUnread ? 'bg-light bg-opacity-50' : ''}" style="cursor: pointer;" onclick="handleQuickNotificationClick('${n._id}', '${escapeHtml(n.link || '')}')">
                <div class="d-flex align-items-start gap-2">
                    <div class="rounded-circle p-2 ${iconInfo.bg} ${iconInfo.color} d-flex align-items-center justify-content-center flex-shrink-0" style="width: 32px; height: 32px; font-size: 0.85rem;">
                        <i class="bi ${iconInfo.icon}"></i>
                    </div>
                    <div class="flex-grow-1 min-w-0">
                        <div class="d-flex justify-content-between align-items-baseline mb-1">
                            <h6 class="mb-0 fw-semibold text-truncate small ${isUnread ? 'text-primary' : 'text-dark'}">${escapeHtml(n.title)}</h6>
                            <span class="text-muted ms-2 flex-shrink-0" style="font-size: 0.7rem;">${timeAgo}</span>
                        </div>
                        <p class="mb-0 text-muted small text-truncate" style="font-size: 0.78rem;">${escapeHtml(n.message)}</p>
                    </div>
                    ${isUnread ? '<span class="badge bg-primary rounded-pill p-1 ms-1 mt-1" style="width: 7px; height: 7px;"> </span>' : ''}
                </div>
            </div>
        `;
    });

    listEl.innerHTML = html;
}

window.handleQuickNotificationClick = async function(id, link) {
    await markNotificationAsRead(id, false);
    if (link && link.startsWith('#')) {
        const tabName = link.replace('#', '');
        const navEl = document.querySelector(`.nav-link-custom[onclick*="${tabName}"]`);
        window.switchTab(tabName, navEl);
    }
};

function renderNotifications() {
    const tbody = document.getElementById('notificationTableBody');
    if (!tbody) return;

    if (!notificationsList || notificationsList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5 text-muted">
                    <i class="bi bi-bell-slash fs-1 text-secondary d-block mb-3"></i>
                    <h6 class="fw-semibold">No notifications found</h6>
                    <p class="small mb-0">You're completely caught up!</p>
                </td>
            </tr>
        `;
        renderNotificationPagination();
        return;
    }

    let html = '';
    notificationsList.forEach(n => {
        const iconInfo = getNotificationIconInfo(n.type);
        const isUnread = !n.isRead;
        const timeAgo = formatTimeAgo(n.createdAt);
        const exactDate = new Date(n.createdAt).toLocaleString();

        html += `
            <tr class="${isUnread ? 'table-light fw-medium' : ''}">
                <td class="text-center" style="width: 50px;">
                    <div class="rounded-circle p-2 mx-auto ${iconInfo.bg} ${iconInfo.color} d-flex align-items-center justify-content-center" style="width: 36px; height: 36px;">
                        <i class="bi ${iconInfo.icon}"></i>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold ${isUnread ? 'text-primary' : 'text-dark'}">${escapeHtml(n.title)}</span>
                        ${isUnread ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle" style="font-size: 0.68rem;">Unread</span>' : ''}
                    </div>
                    <div class="text-muted small mt-1">${escapeHtml(n.message)}</div>
                </td>
                <td class="text-muted small align-middle" style="width: 170px;" title="${exactDate}">
                    <i class="bi bi-clock me-1"></i>${timeAgo}
                </td>
                <td class="text-end align-middle" style="width: 140px;">
                    <div class="btn-group btn-group-sm">
                        ${isUnread ? `
                            <button class="btn btn-outline-primary btn-sm" title="Mark as read" onclick="markNotificationAsRead('${n._id}')">
                                <i class="bi bi-check2"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-danger btn-sm" title="Delete notification" onclick="deleteNotification('${n._id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    renderNotificationPagination();
}

function renderNotificationPagination() {
    const container = document.getElementById('notificationPagination');
    if (!container) return;

    if (notificationTotalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <li class="page-item ${notificationCurrentPage <= 1 ? 'disabled' : ''}">
            <a class="page-link" href="javascript:void(0)" onclick="changeNotificationPage(${notificationCurrentPage - 1})">Previous</a>
        </li>
    `;

    for (let i = 1; i <= notificationTotalPages; i++) {
        html += `
            <li class="page-item ${i === notificationCurrentPage ? 'active' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="changeNotificationPage(${i})">${i}</a>
            </li>
        `;
    }

    html += `
        <li class="page-item ${notificationCurrentPage >= notificationTotalPages ? 'disabled' : ''}">
            <a class="page-link" href="javascript:void(0)" onclick="changeNotificationPage(${notificationCurrentPage + 1})">Next</a>
        </li>
    `;

    container.innerHTML = html;
}

window.changeNotificationPage = function(page) {
    if (page < 1 || page > notificationTotalPages) return;
    notificationCurrentPage = page;
    fetchNotifications();
};

window.markNotificationAsRead = async function(id, refresh = true) {
    try {
        const res = await fetch(`${API_URL_NOTIFICATIONS}/${id}/read`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.unreadCount !== undefined) {
                notificationUnreadCount = data.unreadCount;
                updateNotificationBadges(notificationUnreadCount);
            }
            if (refresh) fetchNotifications();
        }
    } catch (_) {}
};

window.markAllNotificationsRead = async function() {
    try {
        const res = await fetch(`${API_URL_NOTIFICATIONS}/read-all`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('All notifications marked as read', 'bg-success');
            notificationUnreadCount = 0;
            updateNotificationBadges(0);
            fetchNotifications();
        }
    } catch (err) {
        showToast('Failed to mark all as read', 'bg-danger');
    }
};

window.deleteNotification = async function(id) {
    try {
        const res = await fetch(`${API_URL_NOTIFICATIONS}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            fetchNotifications();
            fetchNotificationCount();
        }
    } catch (_) {}
};

window.clearAllNotifications = async function() {
    if (!confirm('Are you sure you want to delete all notifications?')) return;
    try {
        const res = await fetch(`${API_URL_NOTIFICATIONS}/clear-all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('All notifications cleared', 'bg-success');
            fetchNotifications();
            fetchNotificationCount();
        }
    } catch (err) {
        showToast('Failed to clear notifications', 'bg-danger');
    }
};

function getNotificationIconInfo(type) {
    switch (type) {
        case 'FILE_SHARED':
        case 'SHARED_WITH_YOU':
            return { icon: 'bi-person-plus-fill', bg: 'bg-primary-subtle', color: 'text-primary' };
        case 'PERMISSION_CHANGED':
            return { icon: 'bi-shield-check', bg: 'bg-info-subtle', color: 'text-info' };
        case 'ACCESS_REMOVED':
            return { icon: 'bi-person-x-fill', bg: 'bg-secondary-subtle', color: 'text-secondary' };
        case 'LINK_CREATED':
        case 'LINK_EXPIRED':
            return { icon: 'bi-link-45deg', bg: 'bg-indigo-subtle', color: 'text-indigo' };
        case 'VERSION_CREATED':
        case 'VERSION_RESTORED':
            return { icon: 'bi-clock-history', bg: 'bg-success-subtle', color: 'text-success' };
        case 'FILE_RENAMED':
        case 'FILE_MOVED':
        case 'FILE_COPIED':
            return { icon: 'bi-pencil-square', bg: 'bg-info-subtle', color: 'text-info' };
        case 'FILE_TRASHED':
        case 'FILE_RESTORED':
        case 'FILE_DELETED':
            return { icon: 'bi-trash', bg: 'bg-danger-subtle', color: 'text-danger' };
        case 'STORAGE_WARNING':
            return { icon: 'bi-exclamation-triangle-fill', bg: 'bg-warning-subtle', color: 'text-warning' };
        case 'STORAGE_EXCEEDED':
            return { icon: 'bi-slash-circle-fill', bg: 'bg-danger-subtle', color: 'text-danger' };
        case 'SYSTEM_ALERT':
        default:
            return { icon: 'bi-bell-fill', bg: 'bg-primary-subtle', color: 'text-primary' };
    }
}

// ----------------------------
// Activity Dashboard Logic
// ----------------------------
async function fetchActivitySummary() {
    if (!token) return;
    try {
        const res = await fetch(`${API_URL_ACTIVITIES}/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            const summary = data.summary || {};
            
            const totalEl = document.getElementById('statTotalActivities');
            if (totalEl) totalEl.innerText = summary.totalActivities || 0;

            const todayEl = document.getElementById('statTodayActivities');
            if (todayEl) todayEl.innerText = summary.todayCount || 0;

            const uploadEl = document.getElementById('statUploadActivities');
            if (uploadEl) uploadEl.innerText = summary.uploadCount || 0;

            const shareEl = document.getElementById('statShareActivities');
            if (shareEl) shareEl.innerText = summary.shareCount || 0;
        }
    } catch (_) {}
}

async function fetchActivities() {
    if (!token) return;
    try {
        const search = (document.getElementById('activitySearchInput')?.value || '').trim();
        const action = document.getElementById('activityActionFilter')?.value || 'all';
        const scope = document.getElementById('activityScopeFilter')?.value || 'all';
        const startDate = document.getElementById('activityStartDate')?.value || '';
        const endDate = document.getElementById('activityEndDate')?.value || '';

        const params = new URLSearchParams({
            page: activityCurrentPage,
            limit: 15
        });

        if (search) params.append('search', search);
        if (action && action !== 'all') params.append('action', action);
        if (scope && scope !== 'all') params.append('scope', scope);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const res = await fetch(`${API_URL_ACTIVITIES}?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            activitiesList = data.activities || [];
            activityTotalPages = data.totalPages || 1;
            renderActivities(data.total || 0);
        }
    } catch (_) {}
}

function renderActivities(totalCount = 0) {
    const tbody = document.getElementById('activityTableBody');
    if (!tbody) return;

    const countDisplay = document.getElementById('activityCountDisplay');
    if (countDisplay) {
        countDisplay.innerText = `${totalCount} logged event${totalCount !== 1 ? 's' : ''}`;
    }

    if (!activitiesList || activitiesList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-muted">
                    <i class="bi bi-clock-history fs-1 text-secondary d-block mb-3"></i>
                    <h6 class="fw-semibold">No activity logs found</h6>
                    <p class="small mb-0">Try adjusting your filters or search keywords.</p>
                </td>
            </tr>
        `;
        renderActivityPagination();
        return;
    }

    let html = '';
    activitiesList.forEach(act => {
        const badge = getActivityActionBadge(act.action);
        const timeAgo = formatTimeAgo(act.createdAt);
        const exactDate = new Date(act.createdAt).toLocaleString();
        const targetName = escapeHtml(act.fileName || act.folderName || (act.metadata && act.metadata.name) || '—');
        const userDisplay = escapeHtml(act.userId ? (act.userId.username || act.userId.email || 'User') : 'You');
        const details = escapeHtml(act.details || 'Action performed successfully');

        html += `
            <tr>
                <td class="align-middle" style="width: 180px;">
                    ${badge}
                </td>
                <td class="align-middle fw-medium text-dark text-truncate" style="max-width: 220px;" title="${targetName}">
                    <div class="d-flex align-items-center gap-2 text-truncate">
                        <i class="bi ${act.folderName ? 'bi-folder-fill text-warning' : 'bi-file-earmark-text text-primary'}"></i>
                        <span class="text-truncate">${targetName}</span>
                    </div>
                </td>
                <td class="align-middle text-muted small text-truncate" style="max-width: 280px;" title="${details}">
                    ${details}
                </td>
                <td class="align-middle small text-dark" style="width: 140px;">
                    <div class="d-flex align-items-center gap-1">
                        <i class="bi bi-person-circle text-secondary"></i>
                        <span class="text-truncate">${userDisplay}</span>
                    </div>
                </td>
                <td class="align-middle text-muted small text-end" style="width: 160px;" title="${exactDate}">
                    <i class="bi bi-clock me-1"></i>${timeAgo}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    renderActivityPagination();
}

function renderActivityPagination() {
    const container = document.getElementById('activityPagination');
    if (!container) return;

    if (activityTotalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <li class="page-item ${activityCurrentPage <= 1 ? 'disabled' : ''}">
            <a class="page-link" href="javascript:void(0)" onclick="changeActivityPage(${activityCurrentPage - 1})">Previous</a>
        </li>
    `;

    for (let i = 1; i <= activityTotalPages; i++) {
        html += `
            <li class="page-item ${i === activityCurrentPage ? 'active' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="changeActivityPage(${i})">${i}</a>
            </li>
        `;
    }

    html += `
        <li class="page-item ${activityCurrentPage >= activityTotalPages ? 'disabled' : ''}">
            <a class="page-link" href="javascript:void(0)" onclick="changeActivityPage(${activityCurrentPage + 1})">Next</a>
        </li>
    `;

    container.innerHTML = html;
}

window.changeActivityPage = function(page) {
    if (page < 1 || page > activityTotalPages) return;
    activityCurrentPage = page;
    fetchActivities();
};

function handleActivitySearchInput() {
    clearTimeout(activityDebounceTimeout);
    activityDebounceTimeout = setTimeout(() => {
        activityCurrentPage = 1;
        fetchActivities();
    }, 350);
}

function handleActivityFilterChange() {
    activityCurrentPage = 1;
    fetchActivities();
}

window.resetActivityFilters = function() {
    const search = document.getElementById('activitySearchInput');
    const action = document.getElementById('activityActionFilter');
    const scope = document.getElementById('activityScopeFilter');
    const start = document.getElementById('activityStartDate');
    const end = document.getElementById('activityEndDate');

    if (search) search.value = '';
    if (action) action.value = 'all';
    if (scope) scope.value = 'all';
    if (start) start.value = '';
    if (end) end.value = '';

    activityCurrentPage = 1;
    fetchActivities();
};

function getActivityActionBadge(action) {
    let icon = 'bi-activity';
    let bgClass = 'bg-secondary-subtle text-secondary border-secondary-subtle';
    let label = action.replace(/_/g, ' ');

    switch (action) {
        case 'FILE_UPLOADED':
            icon = 'bi-cloud-arrow-up-fill';
            bgClass = 'bg-primary-subtle text-primary border-primary-subtle';
            label = 'Uploaded';
            break;
        case 'FILE_DOWNLOADED':
            icon = 'bi-download';
            bgClass = 'bg-info-subtle text-info border-info-subtle';
            label = 'Downloaded';
            break;
        case 'FILE_PREVIEWED':
            icon = 'bi-eye-fill';
            bgClass = 'bg-light text-dark border';
            label = 'Previewed';
            break;
        case 'FILE_RENAMED':
        case 'FOLDER_RENAMED':
            icon = 'bi-pencil-square';
            bgClass = 'bg-info-subtle text-info border-info-subtle';
            label = 'Renamed';
            break;
        case 'FILE_MOVED':
            icon = 'bi-folder-symlink';
            bgClass = 'bg-warning-subtle text-warning border-warning-subtle';
            label = 'Moved';
            break;
        case 'FILE_COPIED':
            icon = 'bi-files';
            bgClass = 'bg-primary-subtle text-primary border-primary-subtle';
            label = 'Copied';
            break;
        case 'FILE_SHARED':
        case 'FOLDER_SHARED':
            icon = 'bi-share-fill';
            bgClass = 'bg-success-subtle text-success border-success-subtle';
            label = 'Shared';
            break;
        case 'PERMISSION_CHANGED':
            icon = 'bi-shield-lock';
            bgClass = 'bg-primary-subtle text-primary border-primary-subtle';
            label = 'Permission Updated';
            break;
        case 'ACCESS_REMOVED':
            icon = 'bi-person-x';
            bgClass = 'bg-danger-subtle text-danger border-danger-subtle';
            label = 'Access Removed';
            break;
        case 'LINK_CREATED':
            icon = 'bi-link-45deg';
            bgClass = 'bg-info-subtle text-info border-info-subtle';
            label = 'Link Created';
            break;
        case 'LINK_DISABLED':
            icon = 'bi-link-45deg';
            bgClass = 'bg-secondary-subtle text-secondary border-secondary-subtle';
            label = 'Link Disabled';
            break;
        case 'VERSION_CREATED':
            icon = 'bi-clock-history';
            bgClass = 'bg-success-subtle text-success border-success-subtle';
            label = 'New Version';
            break;
        case 'VERSION_RESTORED':
            icon = 'bi-arrow-counterclockwise';
            bgClass = 'bg-success-subtle text-success border-success-subtle';
            label = 'Version Restored';
            break;
        case 'FILE_TRASHED':
        case 'FOLDER_TRASHED':
            icon = 'bi-trash';
            bgClass = 'bg-warning-subtle text-warning border-warning-subtle';
            label = 'Moved to Trash';
            break;
        case 'FILE_RESTORED':
        case 'FOLDER_RESTORED':
            icon = 'bi-arrow-counterclockwise';
            bgClass = 'bg-success-subtle text-success border-success-subtle';
            label = 'Restored';
            break;
        case 'FILE_PERMANENTLY_DELETED':
        case 'FOLDER_PERMANENTLY_DELETED':
            icon = 'bi-trash3-fill';
            bgClass = 'bg-danger-subtle text-danger border-danger-subtle';
            label = 'Deleted Forever';
            break;
        case 'FILE_DUPLICATES_CLEANED':
            icon = 'bi-stars';
            bgClass = 'bg-purple-subtle text-purple border-purple-subtle';
            label = 'Duplicates Cleaned';
            break;
        case 'FOLDER_CREATED':
            icon = 'bi-folder-plus';
            bgClass = 'bg-primary-subtle text-primary border-primary-subtle';
            label = 'Folder Created';
            break;
        case 'STORAGE_WARNING':
        case 'STORAGE_EXCEEDED':
            icon = 'bi-exclamation-octagon-fill';
            bgClass = 'bg-danger-subtle text-danger border-danger-subtle';
            label = 'Storage Alert';
            break;
    }

    return `
        <span class="badge ${bgClass} border d-inline-flex align-items-center gap-1 py-1 px-2 fw-semibold" style="font-size: 0.75rem;">
            <i class="bi ${icon}"></i>
            <span>${label}</span>
        </span>
    `;
}

function formatTimeAgo(dateInput) {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    const now = new Date();
    const diffSecs = Math.floor((now - date) / 1000);

    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 172800) return 'Yesterday';
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

