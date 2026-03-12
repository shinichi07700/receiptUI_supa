// ============================================================
// Dashboard — CRUD, Filters, Pagination, Image Preview
// ============================================================

// --------------- State ---------------
let currentPage = 1;
let totalCount = 0;
let grandTotalPrice = 0; // Cumulative total for filtered records
let deleteTargetId = null;
let editMode = false; // false = add, true = edit
let selectedIds = new Set();
let isClaiming = false; // Guard to prevent double execution

// Column definitions for the table
const COLUMNS = [
    { key: 'id_user', label: 'User ID', editable: true },
    { key: 'first_name', label: 'First Name', editable: true },
    { key: 'date', label: 'Date', editable: true, type: 'datetime' },
    { key: 'receipt_type', label: 'Receipt Type', editable: true },
    { key: 'account_number', label: 'Account #', editable: true },
    { key: 'location', label: 'Location', editable: true },
    { key: 'plate_number', label: 'Plate Number', editable: true },
    { key: 'car_km', label: 'Car KM', editable: true },
    { key: 'fuel_liter', label: 'Fuel Liter', editable: true },
    { key: 'currency', label: 'Currency', editable: true },
    { key: 'total_price', label: 'Total Price', editable: true },
    { key: 'date_input', label: 'Date Input', editable: true },
];

// --------------- DOM Refs ---------------
const $ = (id) => document.getElementById(id);

// --------------- Initialize ---------------
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard initializing...');
    const session = await requireAuth();
    if (!session) {
        console.warn('No session found, redirecting to login.');
        return;
    }
    console.log('Session verified:', session.user.email);

    // Display user info
    const user = session.user;
    $('user-email').textContent = user.email;
    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
    if (avatarUrl) {
        $('user-avatar').src = avatarUrl;
    } else {
        $('user-avatar').style.display = 'none';
    }

    // Event listeners
    $('btn-logout').addEventListener('click', signOut);
    $('btn-apply-filter').addEventListener('click', () => { currentPage = 1; loadData(); });
    $('btn-clear-filter').addEventListener('click', clearFilters);
    $('modal-close-btn').addEventListener('click', closeModal);
    $('modal-cancel-btn').addEventListener('click', closeModal);
    $('modal-save-btn').addEventListener('click', saveRecord);
    $('confirm-cancel-btn').addEventListener('click', closeConfirm);
    $('confirm-delete-btn').addEventListener('click', (e) => { e.preventDefault(); confirmDelete(); });
    $('claim-cancel-btn').addEventListener('click', (e) => { e.preventDefault(); closeClaimConfirm(); });
    $('claim-confirm-btn').addEventListener('click', (e) => { e.preventDefault(); claimSelected(); });
    $('btn-claim-selected').addEventListener('click', (e) => {
        e.preventDefault();
        openClaimConfirm();
    });
    $('select-all-checkbox').addEventListener('change', toggleSelectAll);

    // Close modal on overlay click
    $('modal-overlay').addEventListener('click', (e) => {
        if (e.target === $('modal-overlay')) closeModal();
    });

    // Allow filter on Enter key
    $('filter-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { currentPage = 1; loadData(); }
    });
    $('filter-type').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { currentPage = 1; loadData(); }
    });

    // Event delegation for image opening
    document.body.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.img-hover-wrapper');
        if (wrapper && wrapper.dataset.fullUrl) {
            e.preventDefault();
            e.stopPropagation();

            const url = wrapper.dataset.fullUrl;

            // Create a custom preview window to bypass forced downloads
            const previewWin = window.open('', '_blank');
            if (previewWin) {
                previewWin.document.write(`
                    <html>
                    <head>
                        <title>Receipt Preview</title>
                        <style>
                            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #08080a; color: white; font-family: sans-serif; min-height: 100vh; }
                            .toolbar { position: fixed; top: 0; width: 100%; background: rgba(13,13,22,0.9); padding: 10px; display: flex; justify-content: center; gap: 20px; backdrop-filter: blur(10px); z-index: 10; }
                            img { max-width: 95vw; max-height: 85vh; object-fit: contain; margin-top: 60px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border-radius: 8px; }
                            .btn { padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
                            .btn:hover { background: #818cf8; }
                        </style>
                    </head>
                    <body>
                        <div class="toolbar">
                            <button class="btn" onclick="window.print()">Print Receipt</button>
                            <button class="btn" onclick="window.close()" style="background:#333">Close</button>
                        </div>
                        <img src="${url}" alt="Receipt">
                    </body>
                    </html>
                `);
                previewWin.document.close();
            }
        }
    });

    // Inactivity auto-logoff (10 minutes)
    setupInactivityTimer();

    // Load initial data
    setDefaultDates();
    await loadData();
});

/**
 * Set default date filters: 2 weeks ago to today.
 */
function setDefaultDates() {
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);

    const formatDate = (date) => date.toISOString().split('T')[0];

    $('filter-date-from').value = formatDate(twoWeeksAgo);
    $('filter-date-to').value = formatDate(today);
}

// ========================= INACTIVITY AUTO-LOGOFF =========================

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
let inactivityTimer = null;

function setupInactivityTimer() {
    const resetTimer = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(async () => {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        }, INACTIVITY_TIMEOUT);
    };

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();
}

// ========================= DATA LOADING =========================

async function loadData() {
    showLoading(true);

    try {
        // Build query
        let query = supabase
            .from(TABLE_NAME)
            .select('*', { count: 'exact' })
            .order('date_input', { ascending: false });

        // Apply filters
        const dateFrom = $('filter-date-from').value;
        const dateTo = $('filter-date-to').value;
        const nameFilter = $('filter-name').value.trim();
        const typeFilter = $('filter-type').value.trim();

        if (dateFrom) {
            query = query.gte('date', dateFrom + 'T00:00:00');
        }
        if (dateTo) {
            query = query.lte('date', dateTo + 'T23:59:59');
        }
        if (nameFilter) {
            query = query.ilike('first_name', `%${nameFilter}%`);
        }
        if (typeFilter) {
            query = query.ilike('receipt_type', `%${typeFilter}%`);
        }

        // Pagination
        const from = (currentPage - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        // Fetch Grand Total for filtered records (separate query to avoid heavy load)
        let totalQuery = supabase.from(TABLE_NAME).select('total_price');
        // Apply SAME filters as above
        if (dateFrom) totalQuery = totalQuery.gte('date', dateFrom + 'T00:00:00');
        if (dateTo) totalQuery = totalQuery.lte('date', dateTo + 'T23:59:59');
        if (nameFilter) totalQuery = totalQuery.ilike('first_name', `%${nameFilter}%`);
        if (typeFilter) totalQuery = totalQuery.ilike('receipt_type', `%${typeFilter}%`);

        const { data: allPrices, error: totalError } = await totalQuery;
        if (totalError) throw totalError;

        grandTotalPrice = (allPrices || []).reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
        totalCount = count || 0;

        // Clear selection on data reload (optional, but safer)
        selectedIds.clear();
        updateSelectionUI();

        renderTable(data || []);
        renderPagination();

    } catch (err) {
        console.error('Error loading data:', err);
        showToast('Failed to load data: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ========================= TABLE RENDERING =========================

function renderTable(rows) {
    const tbody = $('table-body');
    const emptyState = $('empty-state');

    if (rows.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';

    let totalPriceSum = 0;

    tbody.innerHTML = rows.map(row => {
        // Calculate total sum (handle potential invalid numbers)
        const price = parseFloat(row.total_price) || 0;
        totalPriceSum += price;

        const isChecked = selectedIds.has(row.id);
        const checkboxCell = `
            <td class="col-checkbox">
                <label class="custom-checkbox">
                    <input type="checkbox" class="row-checkbox" data-id="${row.id}" ${isChecked ? 'checked' : ''} onchange="toggleRowSelection(${row.id}, this.checked)">
                    <span class="checkmark"></span>
                </label>
            </td>
        `;

        const cells = COLUMNS.map(col => {
            let value = row[col.key] ?? '';

            // Format date
            if (col.type === 'datetime' && value) {
                try {
                    const d = new Date(value);
                    value = d.toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                } catch (e) {
                    // keep raw value
                }
            }

            const cls = col.key === 'id' ? ' class="col-id"' : '';
            return `<td${cls} title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</td>`;
        }).join('');

        // Image cell — thumbnail with hover + click to open full image
        const thumbPath = row.thumbnail_link || row.receipt_image || row.file_path || '';
        const fullPath = row.receipt_image || row.file_path || thumbPath;

        let imageCell = '<td style="text-align:center">—</td>';
        if (thumbPath) {
            imageCell = `<td style="text-align:center">
              <div class="img-hover-wrapper" 
                   data-img-path="${escapeHtml(thumbPath)}"
                   data-full-path="${escapeHtml(fullPath)}">
                <div class="img-cell-placeholder">⏳</div>
                <div class="img-hover-tooltip">
                  <div class="img-hover-loading">Loading preview...</div>
                </div>
              </div>
            </td>`;
        }

        // Actions cell (edit + delete only)
        const actionsCell = `<td class="col-actions">
      <div class="cell-actions">
        <button class="btn-icon edit" title="Edit" onclick="openEditModal(${row.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon delete" title="Delete" onclick="openDeleteConfirm(${row.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    </td>`;

        return `<tr>${checkboxCell}${cells}${imageCell}${actionsCell}</tr>`;
    }).join('');

    // Add footer summary row
    const summaryRow = document.createElement('tr');
    summaryRow.className = 'summary-row';

    // Find index of Total Price column
    const priceColIndex = COLUMNS.findIndex(c => c.key === 'total_price');

    // Create cells for summary row
    let footerCells = `<td class="col-checkbox"></td>`; // Empty for checkbox col
    for (let i = 0; i < COLUMNS.length; i++) {
        if (i === priceColIndex) {
            footerCells += `<td class="summary-total">${totalPriceSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        } else if (i === priceColIndex - 1) {
            footerCells += `<td style="text-align:right; font-weight:bold; color:var(--text-secondary)">TOTAL</td>`;
        } else {
            footerCells += `<td></td>`;
        }
    }
    // Plus Image and Actions columns
    footerCells += `<td></td><td></td>`;

    summaryRow.innerHTML = footerCells;
    tbody.appendChild(summaryRow);

    // Add Grand Total row if it's the LAST page
    const isLastPage = (currentPage * PAGE_SIZE) >= totalCount;
    if (isLastPage && totalCount > PAGE_SIZE) {
        const grandRow = document.createElement('tr');
        grandRow.className = 'summary-row grand-total-row';

        let grandCells = `<td class="col-checkbox"></td>`;
        for (let i = 0; i < COLUMNS.length; i++) {
            if (i === priceColIndex) {
                grandCells += `<td class="summary-total" style="border-bottom-color:var(--success)">${grandTotalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
            } else if (i === priceColIndex - 1) {
                grandCells += `<td style="text-align:right; font-weight:900; color:var(--success)">GRAND TOTAL</td>`;
            } else {
                grandCells += `<td></td>`;
            }
        }
        // Image and Actions
        grandCells += `<td></td><td></td>`;
        grandRow.innerHTML = grandCells;
        tbody.appendChild(grandRow);
    }
    
    // Fix: Always append the summary row if there are rows
    if (rows.length > 0) {
        tbody.appendChild(summaryRow);
    }

    // Async: resolve signed image URLs after rendering
    loadImagePreviews();
}

/**
 * Load signed image URLs for hover tooltips and click-to-open.
 * Uses transform option to force correct content-type from Supabase.
 */
async function loadImagePreviews() {
    const wrappers = document.querySelectorAll('.img-hover-wrapper[data-img-path]');
    for (const wrapper of wrappers) {
        const thumbPath = wrapper.getAttribute('data-img-path');
        const fullPath = wrapper.getAttribute('data-full-path') || thumbPath;
        if (!thumbPath) continue;

        try {
            // Load both thumbnail and full image URL
            const [thumbUrl, fullUrl] = await Promise.all([
                getImageUrl(thumbPath),
                fullPath === thumbPath ? null : getImageUrl(fullPath)
            ]);

            const finalFullUrl = fullUrl || thumbUrl;

            if (thumbUrl) {
                // Store URLs in dataset for the global click listener
                wrapper.dataset.fullUrl = finalFullUrl;
                wrapper.style.cursor = 'pointer';

                // Set image content (CSS handles hover tooltip visibility)
                wrapper.innerHTML = `
                    <img class="img-cell-thumb" src="${thumbUrl}" alt="thumb">
                    <div class="img-hover-tooltip">
                        <img src="${thumbUrl}" alt="receipt preview" 
                             onerror="this.parentNode.innerHTML='<div class=\\'img-hover-loading\\'>Preview unavailable</div>'">
                    </div>
                `;
            }
        } catch (e) {
            console.warn('Failed to load image URL for:', thumbPath, e);
        }
    }
}

// ========================= PAGINATION =========================

function renderPagination() {
    const info = $('pagination-info');
    const container = $('pagination-buttons');
    const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
    const from = (currentPage - 1) * PAGE_SIZE + 1;
    const to = Math.min(currentPage * PAGE_SIZE, totalCount);

    info.textContent = totalCount > 0
        ? `Showing ${from}–${to} of ${totalCount} records`
        : 'No records found';

    let html = '';

    // Previous
    html += `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>← Prev</button>`;

    // Page numbers (show max 7)
    const startPage = Math.max(1, currentPage - 3);
    const endPage = Math.min(totalPages, currentPage + 3);

    if (startPage > 1) {
        html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
        html += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // Next
    html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>`;

    container.innerHTML = html;
}

function goToPage(page) {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadData();
    $('table-wrapper').scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================= ADD / EDIT MODAL =========================

function openAddModal() {
    editMode = false;
    $('modal-title').textContent = 'Add Receipt';
    $('receipt-form').reset();
    $('form-id').value = '';
    $('modal-overlay').classList.add('active');
}

// ========================= MODAL HANDLING =========================

async function openEditModal(id) {
    editMode = true;
    $('modal-title').textContent = 'Edit Receipt';

    // Clear old data immediately so the user doesn't see previous record
    $('receipt-form').reset();
    $('form-id').value = '';

    // Show modal IMMEDIATELY to avoid blinking
    const modalBody = document.querySelector('.modal-body');
    modalBody.classList.add('is-loading'); // Apply loading FIRST
    $('modal-overlay').classList.add('active');

    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Populate form
        $('form-id').value = data.id;
        $('form-first_name').value = data.first_name || '';
        $('form-receipt_type').value = data.receipt_type || '';
        $('form-date_input').value = data.date_input || '';
        $('form-account_number').value = data.account_number || '';
        $('form-plate_number').value = data.plate_number || '';
        $('form-location').value = data.location || '';
        $('form-car_km').value = data.car_km || '';
        $('form-fuel_liter').value = data.fuel_liter || '';
        $('form-total_price').value = data.total_price || '';
        $('form-currency').value = data.currency || '';
        $('form-id_user').value = data.id_user || '';
        $('form-thumbnail_link').value = data.thumbnail_link || '';

        // Date
        if (data.date) {
            try {
                const d = new Date(data.date);
                const formatted = d.getFullYear() + '-' +
                    String(d.getMonth() + 1).padStart(2, '0') + '-' +
                    String(d.getDate()).padStart(2, '0') + 'T' +
                    String(d.getHours()).padStart(2, '0') + ':' +
                    String(d.getMinutes()).padStart(2, '0');
                $('form-date').value = formatted;
            } catch (e) {
                $('form-date').value = '';
            }
        }
    } catch (err) {
        console.error('Error fetching record:', err);
        showToast('Failed to load record: ' + err.message, 'error');
        closeModal(); // Close if it failed to load
    } finally {
        modalBody.classList.remove('is-loading');
    }
}

function closeModal() {
    $('modal-overlay').classList.remove('active');
}

async function saveRecord() {
    const record = {
        first_name: $('form-first_name').value || null,
        date: $('form-date').value ? new Date($('form-date').value).toISOString() : null,
        receipt_type: $('form-receipt_type').value || null,
        date_input: $('form-date_input').value || null,
        account_number: $('form-account_number').value || null,
        plate_number: $('form-plate_number').value || null,
        location: $('form-location').value || null,
        car_km: $('form-car_km').value || null,
        fuel_liter: $('form-fuel_liter').value || null,
        total_price: $('form-total_price').value || null,
        currency: $('form-currency').value || null,
        id_user: $('form-id_user').value || null,
        thumbnail_link: $('form-thumbnail_link').value || null,
    };

    showLoading(true);

    try {
        if (editMode) {
            // Update
            const id = parseInt($('form-id').value);
            const { error } = await supabase
                .from(TABLE_NAME)
                .update(record)
                .eq('id', id);
            if (error) throw error;
            showToast('Receipt updated successfully', 'success');
        } else {
            // Insert
            const { error } = await supabase
                .from(TABLE_NAME)
                .insert([record]);
            if (error) throw error;
            showToast('Receipt added successfully', 'success');
        }

        closeModal();
        await loadData();
    } catch (err) {
        console.error('Error saving record:', err);
        showToast('Failed to save: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ========================= DELETE =========================

function openDeleteConfirm(id) {
    deleteTargetId = id;
    $('confirm-overlay').classList.add('active');
}

function closeConfirm() {
    deleteTargetId = null;
    $('confirm-overlay').classList.remove('active');
}

async function confirmDelete() {
    if (!deleteTargetId) return;

    showLoading(true);
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('id', deleteTargetId);

        if (error) throw error;

        showToast('Receipt deleted', 'success');
        closeConfirm();
        await loadData();
    } catch (err) {
        console.error('Error deleting:', err);
        showToast('Failed to delete: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ========================= IMAGE PREVIEW =========================

// Supabase Storage base URL pattern
const STORAGE_BASE = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/';

/**
 * Get a displayable image URL.
 * - Supabase Storage URLs → generate a signed URL (works with private buckets)
 * - Google Drive thumbnail URLs → convert to export format
 * - Other URLs → use directly
 * - Plain paths → treat as Supabase Storage file path
 */
async function getImageUrl(path) {
    if (!path) return '';
    console.log('[getImageUrl] Processing path:', path);

    try {
        // 1. Handle full Supabase Storage URLs
        if (path.includes('/storage/v1/object/')) {
            const bucketSearch = '/' + STORAGE_BUCKET + '/';
            const parts = path.split(bucketSearch);
            let filePath = parts.length > 1 ? parts[1].split('?')[0] : path;

            // If split failed or bucket name wasn't found in URL correctly, try a more aggressive approach
            if (filePath.startsWith('http')) {
                const urlParts = filePath.split('/');
                const bucketIdx = urlParts.indexOf(STORAGE_BUCKET);
                if (bucketIdx !== -1) {
                    filePath = urlParts.slice(bucketIdx + 1).join('/').split('?')[0];
                }
            }

            console.log('[getImageUrl] Detected Supabase URL, extracted filePath:', filePath);

            const { data, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(filePath, 3600);

            if (error) console.error('[getImageUrl] Signed URL error (URL type):', error);
            finalUrl = data?.signedUrl || '';
        }
        // 2. Handle Google Drive URLs
        else if (path.includes('drive.google.com/thumbnail')) {
            const match = path.match(/[?&]id=([^&]+)/);
            if (match) finalUrl = `https://lh3.googleusercontent.com/d/${match[1]}=w400`;
        }
        else if (path.includes('drive.google.com/file/d/')) {
            const match = path.match(/\/d\/([^/]+)/);
            if (match) finalUrl = `https://lh3.googleusercontent.com/d/${match[1]}=w400`;
        }
        // 3. Handle external HTTP URLs
        else if (path.startsWith('http://') || path.startsWith('https://')) {
            console.log('[getImageUrl] External HTTP URL detected');
            finalUrl = path;
        }
        // 4. Handle plain file paths
        else {
            // Strip bucket name from start if present (e.g. "receipts/image.jpg" -> "image.jpg")
            let filePath = path;
            if (filePath.startsWith(STORAGE_BUCKET + '/')) {
                filePath = filePath.substring(STORAGE_BUCKET.length + 1);
            }

            console.log('[getImageUrl] Detected plain path, generating signed URL for:', filePath);
            const { data, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(filePath, 3600);

            if (error) console.error('[getImageUrl] Signed URL error (Path type):', error);
            finalUrl = data?.signedUrl || '';
        }

        // Try to force inline display for Supabase URLs
        if (finalUrl && (finalUrl.includes('token=') || finalUrl.includes('/storage/v1/object/'))) {
            const urlObj = new URL(finalUrl);
            urlObj.searchParams.set('download', 'false');
            finalUrl = urlObj.toString();
        }

        console.log('[getImageUrl] Result for', path.substring(0, 30) + '...', '->', finalUrl ? '(valid)' : '(EMPTY)');
        return finalUrl;
    } catch (err) {
        console.error('[getImageUrl] CRITICAL ERROR for:', path, err);
        return '';
    }
}

// ========================= FILTERS =========================

function clearFilters() {
    $('filter-date-from').value = '';
    $('filter-date-to').value = '';
    $('filter-name').value = '';
    $('filter-type').value = '';
    currentPage = 1;
    loadData();
}

// ========================= UI HELPERS =========================

function showLoading(active) {
    const overlay = $('loading-overlay');
    if (active) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

function showToast(message, type = 'success') {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    // Auto-dismiss after 3.5s
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ========================= DELETE =========================

function openDeleteConfirm(id) {
    deleteTargetId = id;
    $('confirm-overlay').classList.add('active');
}

function closeConfirm() {
    deleteTargetId = null;
    $('confirm-overlay').classList.remove('active');
}

async function confirmDelete() {
    if (!deleteTargetId) return;

    showLoading(true);
    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('id', deleteTargetId);

        if (error) throw error;

        showToast('Receipt deleted', 'success');
        closeConfirm();
        await loadData();
    } catch (err) {
        console.error('Error deleting:', err);
        showToast('Failed to delete: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}
// ========================= CLAIM LOGIC =========================

function toggleRowSelection(id, checked) {
    if (checked) {
        selectedIds.add(id);
    } else {
        selectedIds.delete(id);
    }
    updateSelectionUI();
}

function toggleSelectAll(e) {
    const checked = e.target.checked;
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        const id = parseInt(cb.dataset.id);
        cb.checked = checked;
        if (checked) {
            selectedIds.add(id);
        } else {
            selectedIds.delete(id);
        }
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    const count = selectedIds.size;
    $('selected-count').textContent = count;
    $('btn-claim-selected').disabled = (count === 0);

    // Update select-all checkbox state
    const checkboxes = document.querySelectorAll('.row-checkbox');
    const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
    $('select-all-checkbox').checked = allChecked;
}

function openClaimConfirm() {
    if (selectedIds.size === 0 || isClaiming) return;
    $('claim-overlay').classList.add('active');
}

function closeClaimConfirm() {
    $('claim-overlay').classList.remove('active');
}

async function claimSelected() {
    if (selectedIds.size === 0 || isClaiming) return;
    
    isClaiming = true;
    showLoading(true);
    closeClaimConfirm();

    try {
        const idsToClaim = Array.from(selectedIds);
        const adminEmail = $('user-email').textContent;

        console.log('Claiming IDs:', idsToClaim);

        // 1. Fetch data for these IDs
        const { data: records, error: fetchError } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .in('id', idsToClaim);

        if (fetchError) throw fetchError;

        // 2. Prepare data for claimed table
        const claimedRecords = records.map(r => {
            const { id, created_at, ...rest } = r; // Strip ID and created_at
            return {
                ...rest,
                original_id: id,
                claimed_by: adminEmail,
                claimed_at: new Date().toISOString()
            };
        });

        // 3. Insert into claimed table
        const { error: insertError } = await supabase
            .from(CLAIMED_TABLE_NAME)
            .insert(claimedRecords);

        if (insertError) throw insertError;

        // 4. Delete from main table
        const { error: deleteError } = await supabase
            .from(TABLE_NAME)
            .delete()
            .in('id', idsToClaim);

        if (deleteError) throw deleteError;

        showToast(`Successfully claimed ${idsToClaim.length} receipts`, 'success');
        selectedIds.clear();
        await loadData();
    } catch (err) {
        console.error('Error claiming receipts:', err);
        showToast('Failed to claim: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}
