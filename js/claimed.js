// ============================================================
// Claimed Receipts — CRUD, Filters, Pagination, Unclaim
// ============================================================

// --------------- State ---------------
let currentPage = 1;
let totalCount = 0;
let grandTotalPrice = 0;
let deleteTargetId = null;
let selectedIds = new Set();
let isUnclaiming = false;

// Column definitions for the table (matches dashboard.js)
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

const $ = (id) => document.getElementById(id);

// --------------- Initialize ---------------
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Claimed dashboard initializing...');
    const session = await requireAuth();
    if (!session) return;

    // Display user info
    $('user-email').textContent = session.user.email;
    const avatarUrl = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '';
    if (avatarUrl) $('user-avatar').src = avatarUrl;
    else $('user-avatar').style.display = 'none';

    // Event listeners
    $('btn-logout').addEventListener('click', signOut);
    $('btn-apply-filter').addEventListener('click', () => { currentPage = 1; loadData(); });
    $('btn-clear-filter').addEventListener('click', clearFilters);
    $('modal-close-btn').addEventListener('click', closeModal);
    $('modal-cancel-btn').addEventListener('click', closeModal);
    $('modal-save-btn').addEventListener('click', saveRecord);
    $('confirm-cancel-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeConfirm(); });
    $('confirm-delete-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); confirmDelete(); });
    
    $('unclaim-cancel-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeUnclaimConfirm(); });
    $('unclaim-confirm-btn').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); unclaimSelected(); });
    $('btn-unclaim-selected').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openUnclaimConfirm(); });

    // Close on overlay click, but isolate the box
    // Close on overlay click
    $('unclaim-overlay').addEventListener('click', (e) => {
        if (e.target === $('unclaim-overlay')) closeUnclaimConfirm();
    });
    $('confirm-overlay').addEventListener('click', (e) => {
        if (e.target === $('confirm-overlay')) closeConfirm();
    });
    $('select-all-checkbox').addEventListener('change', toggleSelectAll);

    // Close modal on overlay click
    $('modal-overlay').addEventListener('click', (e) => {
        if (e.target === $('modal-overlay')) closeModal();
    });

    // Event delegation for image opening
    document.body.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.img-hover-wrapper');
        if (wrapper && wrapper.dataset.fullUrl) {
            e.preventDefault();
            e.stopPropagation();
            const url = wrapper.dataset.fullUrl;
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
    await loadData();
});

// ========================= DATA LOADING =========================

async function loadData() {
    showLoading(true);

    try {
        let query = supabase
            .from(CLAIMED_TABLE_NAME)
            .select('*', { count: 'exact' })
            .order('date_input', { ascending: false });

        // Apply filters
        const dateFrom = $('filter-date-from').value;
        const dateTo = $('filter-date-to').value;
        const nameFilter = $('filter-name').value.trim();
        const typeFilter = $('filter-type').value.trim();

        if (dateFrom) query = query.gte('date', dateFrom + 'T00:00:00');
        if (dateTo) query = query.lte('date', dateTo + 'T23:59:59');
        if (nameFilter) query = query.ilike('first_name', `%${nameFilter}%`);
        if (typeFilter) query = query.ilike('receipt_type', `%${typeFilter}%`);

        // Pagination
        const from = (currentPage - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        // Fetch Grand Total for filtered records
        let totalQuery = supabase.from(CLAIMED_TABLE_NAME).select('total_price');
        if (dateFrom) totalQuery = totalQuery.gte('date', dateFrom + 'T00:00:00');
        if (dateTo) totalQuery = totalQuery.lte('date', dateTo + 'T23:59:59');
        if (nameFilter) totalQuery = totalQuery.ilike('first_name', `%${nameFilter}%`);
        if (typeFilter) totalQuery = totalQuery.ilike('receipt_type', `%${typeFilter}%`);

        const { data: allPrices, error: totalError } = await totalQuery;
        if (totalError) throw totalError;

        grandTotalPrice = (allPrices || []).reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
        totalCount = count || 0;
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
        const price = parseFloat(row.total_price) || 0;
        totalPriceSum += price;

        const isChecked = selectedIds.has(row.id);
        const checkboxCell = `
            <td class="col-checkbox">
                <label class="custom-checkbox">
                    <input type="checkbox" class="row-checkbox" data-id="${row.id}" ${isChecked ? 'checked' : ''} onchange="event.stopPropagation(); toggleRowSelection(${row.id}, this.checked)">
                    <span class="checkmark"></span>
                </label>
            </td>
        `;

        const cells = COLUMNS.map(col => {
            let value = row[col.key] ?? '';
            if (col.type === 'datetime' && value) {
                try {
                    const d = new Date(value);
                    value = d.toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                } catch (e) {}
            }
            return `<td title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</td>`;
        }).join('');

        // Image cell
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

        // Claimed metadata
        const claimedAt = row.claimed_at ? new Date(row.claimed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
        const claimedBy = row.claimed_by || '—';

        const actionsCell = `<td class="col-actions">
          <div class="cell-actions">
            <button class="btn-icon edit" title="Edit" type="button" onclick="event.stopPropagation(); openEditModal(${row.id})">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon delete" title="Delete" type="button" onclick="event.stopPropagation(); openDeleteConfirm(${row.id})">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </td>`;

        return `<tr>${checkboxCell}${cells}${imageCell}<td>${claimedAt}</td><td>${claimedBy}</td>${actionsCell}</tr>`;
    }).join('');

    // Add footer summary row
    const summaryRow = document.createElement('tr');
    summaryRow.className = 'summary-row';
    const priceColIndex = COLUMNS.findIndex(c => c.key === 'total_price');

    let footerCells = `<td class="col-checkbox"></td>`;
    for (let i = 0; i < COLUMNS.length; i++) {
        if (i === priceColIndex) {
            footerCells += `<td class="summary-total">${totalPriceSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        } else if (i === priceColIndex - 1) {
            footerCells += `<td style="text-align:right; font-weight:bold; color:var(--text-secondary)">TOTAL</td>`;
        } else {
            footerCells += `<td></td>`;
        }
    }
    // Image, Claimed At, Claimed By, Actions
    footerCells += `<td></td><td></td><td></td><td></td>`;
    summaryRow.innerHTML = footerCells;
    // Grand Total if last page
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
        // Image, Claimed At, Claimed By, Actions
        grandCells += `<td></td><td></td><td></td><td></td>`;
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

// ========================= IMAGE PREVIEW =========================

async function loadImagePreviews() {
    const wrappers = document.querySelectorAll('.img-hover-wrapper[data-img-path]');
    for (const wrapper of wrappers) {
        const thumbPath = wrapper.getAttribute('data-img-path');
        const fullPath = wrapper.getAttribute('data-full-path') || thumbPath;
        if (!thumbPath) continue;

        try {
            const [thumbUrl, fullUrl] = await Promise.all([
                getImageUrl(thumbPath),
                fullPath === thumbPath ? null : getImageUrl(fullPath)
            ]);
            const finalFullUrl = fullUrl || thumbUrl;

            if (thumbUrl) {
                wrapper.dataset.fullUrl = finalFullUrl;
                wrapper.style.cursor = 'pointer';
                wrapper.innerHTML = `
                    <img class="img-cell-thumb" src="${thumbUrl}" alt="thumb">
                    <div class="img-hover-tooltip">
                        <img src="${thumbUrl}" alt="receipt preview" onerror="this.parentNode.innerHTML='<div class=\\'img-hover-loading\\'>Preview unavailable</div>'">
                    </div>
                `;
            }
        } catch (e) {
            console.warn('Failed to load image URL for:', thumbPath, e);
        }
    }
}

// ========================= NAVIGATION & UI =========================

function renderPagination() {
    const info = $('pagination-info');
    const container = $('pagination-buttons');
    const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
    info.textContent = totalCount > 0 ? `Showing ${(currentPage-1)*PAGE_SIZE+1}–${Math.min(currentPage*PAGE_SIZE, totalCount)} of ${totalCount} records` : 'No records found';

    let html = `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>← Prev</button>`;
    for (let i = Math.max(1, currentPage - 3); i <= Math.min(totalPages, currentPage + 3); i++) {
        html += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>`;
    container.innerHTML = html;
}

function goToPage(page) {
    if (page < 1 || page > Math.ceil(totalCount / PAGE_SIZE)) return;
    currentPage = page;
    loadData();
    $('table-wrapper').scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================= SELECTION & UNCLAIM =========================

function toggleRowSelection(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateSelectionUI();
}

function toggleSelectAll(e) {
    const checked = e.target.checked;
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        const id = parseInt(cb.dataset.id);
        cb.checked = checked;
        if (checked) selectedIds.add(id);
        else selectedIds.delete(id);
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    const count = selectedIds.size;
    $('selected-count').textContent = count;
    $('btn-unclaim-selected').disabled = (count === 0);
    const checkboxes = document.querySelectorAll('.row-checkbox');
    $('select-all-checkbox').checked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
}

function openUnclaimConfirm() {
    console.log('[DEBUG] openUnclaimConfirm called');
    if (selectedIds.size === 0 || isUnclaiming) return;
    $('unclaim-overlay').classList.add('active');
}

function closeUnclaimConfirm() {
    console.log('[DEBUG] closeUnclaimConfirm called');
    console.trace();
    $('unclaim-overlay').classList.remove('active');
}

async function unclaimSelected() {
    console.log('[DEBUG] unclaimSelected initiated');
    if (selectedIds.size === 0 || isUnclaiming) {
        console.log('[DEBUG] unclaimSelected aborted:', { size: selectedIds.size, isUnclaiming });
        return;
    }

    isUnclaiming = true;
    showLoading(true);
    closeUnclaimConfirm();

    try {
        const idsToUnclaim = Array.from(selectedIds);

        // 1. Fetch data from claimed table
        const { data: records, error: fetchError } = await supabase
            .from(CLAIMED_TABLE_NAME)
            .select('*')
            .in('id', idsToUnclaim);

        if (fetchError) throw fetchError;

        // 2. Prepare data for main table (strip claimed-only metadata)
        const unclaimedRecords = records.map(r => {
            const { id, original_id, claimed_at, claimed_by, created_at, ...rest } = r;
            return rest;
        });

        // 3. Insert into main table
        const { error: insertError } = await supabase
            .from(TABLE_NAME)
            .insert(unclaimedRecords);

        if (insertError) throw insertError;

        // 4. Delete from claimed table
        const { error: deleteError } = await supabase
            .from(CLAIMED_TABLE_NAME)
            .delete()
            .in('id', idsToUnclaim);

        if (deleteError) throw deleteError;

        showToast(`Successfully unclaimed ${idsToUnclaim.length} receipts`, 'success');
        selectedIds.clear();
        await loadData();
        console.log('[DEBUG] unclaimSelected completed successfully');
    } catch (err) {
        console.error('Error unclaiming:', err);
        showToast('Failed to unclaim: ' + err.message, 'error');
    } finally {
        showLoading(false);
        isUnclaiming = false;
        console.log('[DEBUG] unclaimSelected finally: isUnclaiming reset to false');
    }
}

// ========================= EDIT / DELETE =========================

async function openEditModal(id) {
    $('modal-title').textContent = 'Edit Claimed Receipt';
    $('receipt-form').reset();
    document.querySelector('.modal-body').classList.add('is-loading');
    $('modal-overlay').classList.add('active');

    try {
        const { data, error } = await supabase.from(CLAIMED_TABLE_NAME).select('*').eq('id', id).single();
        if (error) throw error;

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

        if (data.date) {
            const d = new Date(data.date);
            $('form-date').value = d.toISOString().slice(0, 16);
        }
    } catch (err) {
        showToast('Failed to load: ' + err.message, 'error');
        closeModal();
    } finally {
        document.querySelector('.modal-body').classList.remove('is-loading');
    }
}

function closeModal() {
    $('modal-overlay').classList.remove('active');
}

async function saveRecord() {
    const id = parseInt($('form-id').value);
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
        const { error } = await supabase.from(CLAIMED_TABLE_NAME).update(record).eq('id', id);
        if (error) throw error;
        showToast('Record updated successfully');
        closeModal();
        await loadData();
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

function openDeleteConfirm(id) {
    deleteTargetId = id;
    $('confirm-overlay').classList.add('active');
}

function closeConfirm() {
    console.log('[DEBUG] closeConfirm called (claimed)');
    deleteTargetId = null;
    $('confirm-overlay').classList.remove('active');
}

async function confirmDelete() {
    if (!deleteTargetId) return;
    showLoading(true);
    try {
        const { error } = await supabase.from(CLAIMED_TABLE_NAME).delete().eq('id', deleteTargetId);
        if (error) throw error;
        showToast('Claimed receipt deleted');
        closeConfirm();
        await loadData();
    } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ========================= HELPERS =========================

/**
 * Get a displayable image URL (Robust version synced from dashboard.js).
 */
async function getImageUrl(path) {
    if (!path) return '';
    let finalUrl = '';
    try {
        if (path.includes('/storage/v1/object/')) {
            const bucketSearch = '/' + STORAGE_BUCKET + '/';
            const parts = path.split(bucketSearch);
            let filePath = parts.length > 1 ? parts[1].split('?')[0] : path;
            if (filePath.startsWith('http')) {
                const urlParts = filePath.split('/');
                const bucketIdx = urlParts.indexOf(STORAGE_BUCKET);
                if (bucketIdx !== -1) {
                    filePath = urlParts.slice(bucketIdx + 1).join('/').split('?')[0];
                }
            }
            const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(filePath, 3600);
            finalUrl = data?.signedUrl || '';
        }
        else if (path.includes('drive.google.com/thumbnail') || path.includes('drive.google.com/file/d/')) {
            const match = path.match(/[?&]id=([^&]+)/) || path.match(/\/d\/([^/]+)/);
            if (match) finalUrl = `https://lh3.googleusercontent.com/d/${match[1]}=w400`;
        }
        else if (path.startsWith('http')) {
            finalUrl = path;
        }
        else {
            let filePath = path;
            if (filePath.startsWith(STORAGE_BUCKET + '/')) filePath = filePath.substring(STORAGE_BUCKET.length + 1);
            const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(filePath, 3600);
            finalUrl = data?.signedUrl || '';
        }
        if (finalUrl && (finalUrl.includes('token=') || finalUrl.includes('/storage/v1/object/'))) {
            const urlObj = new URL(finalUrl);
            urlObj.searchParams.set('download', 'false');
            finalUrl = urlObj.toString();
        }
        return finalUrl;
    } catch (err) { return ''; }
}

function clearFilters() {
    $('filter-date-from').value = '';
    $('filter-date-to').value = '';
    $('filter-name').value = '';
    $('filter-type').value = '';
    currentPage = 1;
    loadData();
}

function showLoading(active) {
    $('loading-overlay').classList.toggle('active', active);
}

function showToast(message, type = 'success') {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
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

function setupInactivityTimer() {
    let timer;
    const reset = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        }, 10 * 60 * 1000);
    };
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(e => document.addEventListener(e, reset, { passive: true }));
    reset();
}
