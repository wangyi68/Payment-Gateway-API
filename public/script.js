const API_URL = '/api';

// Helper: Get Auth Headers
const getHeaders = () => {
    const apiKey = document.getElementById('api_key_input').value;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
        headers['x-api-key'] = apiKey;
    }
    return headers;
};

// Helper: Save API Key to localStorage
const saveApiKey = () => {
    const apiKey = document.getElementById('api_key_input').value;
    localStorage.setItem('pg_api_key', apiKey);
};

// Helper: Load API Key from localStorage
const loadApiKey = () => {
    const apiKey = localStorage.getItem('pg_api_key');
    if (apiKey) {
        document.getElementById('api_key_input').value = apiKey;
    }
};

// --- Tab Management System ---
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabBtns.length === 0) return;

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const targetTabId = this.getAttribute('data-tab');
            if (!targetTabId) return;

            console.log('Switching to:', targetTabId);

            // 1. Cập nhật trạng thái nút
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // 2. Cập nhật trạng thái nội dung (CSS + Inline Display)
            tabContents.forEach(content => {
                content.classList.remove('active');
                content.style.display = 'none'; // Ẩn tất cả
            });

            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.style.display = 'block'; // Hiện tab được chọn
            }
        });
    });

    // Thiết lập trạng thái mặc định (hiện tab đầu tiên)
    const firstTab = document.querySelector('.tab-content');
    if (firstTab) {
        firstTab.style.display = 'block';
    }
}

// Format Currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

// --- TheSieuToc Logic ---

async function fetchDiscounts() {
    try {
        const response = await fetch(`${API_URL}/thesieutoc/discount`, {
            headers: getHeaders()
        });
        const data = await response.json();

        if (data.success && data.data) {
            updateDiscountUI(data.data);
        }
    } catch (error) {
        console.error('Lỗi lấy chiết khấu:', error);
    }
}

function updateDiscountUI(discounts) {
    const tbody = document.querySelector('#discount-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // discounts là một Mảng: [{ card_type: '...', discount: {...} }, ...]
    discounts.forEach((item) => {
        const type = item.card_type;
        const rates = item.discount;

        // Lấy đại diện chiết khấu (ưu tiên mốc 100k, nếu không lấy mốc đầu tiên)
        const rateValue = rates['100000'] !== undefined ? rates['100000'] : Object.values(rates)[0];

        // Kiểm tra xem nhà mạng có đang hoạt động không (chiết khấu khác -1)
        const isMaintenance = rateValue === -1 || rateValue === "-1";
        const displayRate = isMaintenance ? 'N/A' : `-${rateValue}%`;
        const statusText = isMaintenance ? 'Bảo trì' : 'Hoạt động';
        const statusClass = isMaintenance ? 'badge-primary' : 'badge-success'; // Dùng tạm badge-primary cho bảo trì

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:700;">${type}</td>
            <td><span class="badge ${isMaintenance ? '' : 'badge-primary'}" style="${isMaintenance ? 'background:rgba(255,255,255,0.1);color:#94a3b8;' : ''}">${displayRate}</span></td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleCardSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById('card-btn');
    const originalText = btn.querySelector('span').innerText;
    const loader = btn.querySelector('.loader');

    try {
        btn.disabled = true;
        btn.querySelector('span').innerText = 'Đang gửi...';
        loader.style.display = 'block';

        saveApiKey(); // Save key on submit

        const payload = {
            username: document.getElementById('username').value,
            card_type: document.getElementById('card_type').value,
            card_amount: document.getElementById('card_amount').value, // Must be string for Zod enum
            serial: document.getElementById('serial').value,
            pin: document.getElementById('pin').value
        };

        const response = await fetch(`${API_URL}/thesieutoc`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            alert('Thẻ đã được gửi thành công! Vui lòng chờ hệ thống duyệt.');
            document.getElementById('card-form').reset();
        } else {
            let msg = 'Lỗi: ' + (data.message || 'Không thể gửi thẻ');
            if (data.error) {
                msg += '\nChi tiết: ' + JSON.stringify(data.error);
            }
            alert(msg);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').innerText = originalText;
        loader.style.display = 'none';
    }
}

// --- PayOS Logic ---

async function handlePayOSSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById('payos-btn');
    const originalText = btn.querySelector('span').innerText;
    const loader = btn.querySelector('.loader');

    try {
        btn.disabled = true;
        btn.querySelector('span').innerText = 'Đang khởi tạo...';
        loader.style.display = 'block';

        saveApiKey();

        const payload = {
            amount: Number(document.getElementById('amount').value),
            description: document.getElementById('description').value,
            returnUrl: window.location.origin + '/success.html',
            cancelUrl: window.location.origin + '/cancel.html'
        };

        const response = await fetch(`${API_URL}/payos/checkout`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success && data.data && data.data.checkoutUrl) {
            window.location.href = data.data.checkoutUrl;
        } else {
            alert('Lỗi: ' + (data.message || 'Không thể tạo link thanh toán'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').innerText = originalText;
        loader.style.display = 'none';
    }
}

// Display Transaction Info (for Success/Cancel pages)
async function displayTransactionInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderCode = urlParams.get('orderCode');
    const status = urlParams.get('status');

    const orderCodeEl = document.getElementById('order-code');
    if (orderCodeEl && orderCode) orderCodeEl.textContent = `#${orderCode}`;

    if (orderCode) {
        fetchOrderDetails(orderCode);
    }
}

async function fetchOrderDetails(orderCode) {
    try {
        // Try local DB first
        let response = await fetch(`${API_URL}/payos/orders/${orderCode}`, { headers: getHeaders() });
        let data = await response.json();

        if (data.success && data.data) {
            updateOrderUI(data.data);
            return;
        }

        // Fallback to PayOS API info
        response = await fetch(`${API_URL}/payos/payment-info/${orderCode}`, { headers: getHeaders() });
        data = await response.json();

        if (data.success && data.data) {
            updateOrderUI(data.data);
        }
    } catch (error) {
        console.error('Lỗi lấy chi tiết đơn hàng:', error);
    }
}

function updateOrderUI(data) {
    const amountEl = document.getElementById('amount');
    if (amountEl && data.amount) {
        amountEl.textContent = formatCurrency(data.amount);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadApiKey(); // Load saved key

    // Setup Navigation
    initTabs();

    // Setup Forms
    const cardForm = document.getElementById('card-form');
    if (cardForm) cardForm.addEventListener('submit', handleCardSubmit);

    const payosForm = document.getElementById('payos-form');
    if (payosForm) payosForm.addEventListener('submit', handlePayOSSubmit);

    // Initial Data
    if (document.getElementById('card-tab')) {
        fetchDiscounts();
    }

    // Check if we are on success/cancel page
    if (document.getElementById('order-code')) {
        displayTransactionInfo();
    }
});

