// ===== Configuration =====
const API_BASE_URL = 'https://privacykit-2.onrender.com';

// ===== DOM Elements =====
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// URL Cleaner
const dirtyUrlInput = document.getElementById('dirty-url');
const cleanUrlBtn = document.getElementById('clean-url-btn');
const cleanResult = document.getElementById('clean-result');
const cleanedUrlInput = document.getElementById('cleaned-url');
const paramsRemovedBadge = document.getElementById('params-removed');
const copyCleanBtn = document.getElementById('copy-clean-btn');

// Link Generator
const originalUrlInput = document.getElementById('original-url');
const expiryHoursInput = document.getElementById('expiry-hours');
const maxClicksInput = document.getElementById('max-clicks');
const generateLinkBtn = document.getElementById('generate-link-btn');
const linkResult = document.getElementById('link-result');
const generatedUrlInput = document.getElementById('generated-url');
const copyLinkBtn = document.getElementById('copy-link-btn');
const linkExpirySpan = document.getElementById('link-expiry');
const linkClicksSpan = document.getElementById('link-clicks');

// ===== Tab Switching =====
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;

        // Update active tab button
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active tab content
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === targetTab) {
                content.classList.add('active');
            }
        });
    });
});

// ===== URL Cleaner =====
cleanUrlBtn.addEventListener('click', () => {
    const dirtyUrl = dirtyUrlInput.value.trim();

    if (!dirtyUrl) {
        alert('Please enter a URL to clean');
        return;
    }

    try {
        const url = new URL(dirtyUrl);
        const paramsCount = url.searchParams.toString() ?
            url.searchParams.toString().split('&').length : 0;

        // Remove all query parameters
        url.search = '';

        // Also remove hash/fragment if present
        url.hash = '';

        const cleanedUrl = url.toString();

        // Display result
        cleanedUrlInput.value = cleanedUrl;
        paramsRemovedBadge.textContent = `${paramsCount} param${paramsCount !== 1 ? 's' : ''} removed`;
        cleanResult.classList.remove('hidden');

    } catch (error) {
        alert('Invalid URL. Please enter a valid URL.');
    }
});

// ===== Link Generator =====
generateLinkBtn.addEventListener('click', async () => {
    const originalUrl = originalUrlInput.value.trim();
    const expiryHours = expiryHoursInput.value;
    const maxClicks = maxClicksInput.value;

    if (!originalUrl) {
        alert('Please enter a URL');
        return;
    }

    // Validate URL
    try {
        new URL(originalUrl);
    } catch {
        alert('Invalid URL. Please enter a valid URL.');
        return;
    }

    // Disable button and show loading
    generateLinkBtn.disabled = true;
    generateLinkBtn.innerHTML = '<span>Generating...</span>';

    try {
        const response = await fetch(`${API_BASE_URL}/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                original_url: originalUrl,
                expiry_hours: expiryHours || null,
                max_clicks: maxClicks || null,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to create link');
        }

        const data = await response.json();

        // Display result
        generatedUrlInput.value = data.short_url;

        // Show expiry info
        if (data.expires_at) {
            const expiryDate = new Date(data.expires_at);
            linkExpirySpan.textContent = `⏱ Expires: ${expiryDate.toLocaleString()}`;
        } else {
            linkExpirySpan.textContent = '⏱ No expiry';
        }

        if (data.max_clicks) {
            linkClicksSpan.textContent = `👆 Max clicks: ${data.max_clicks}`;
        } else {
            linkClicksSpan.textContent = '👆 Unlimited clicks';
        }

        linkResult.classList.remove('hidden');

    } catch (error) {
        console.error('Error:', error);
        alert('Failed to generate link. Make sure the backend is running.');
    } finally {
        generateLinkBtn.disabled = false;
        generateLinkBtn.innerHTML = '<span>Generate Link</span>';
    }
});

// ===== Copy to Clipboard =====
function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        const originalContent = button.textContent;
        button.textContent = '✓';
        button.classList.add('copied');

        setTimeout(() => {
            button.textContent = originalContent;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

copyCleanBtn.addEventListener('click', () => {
    copyToClipboard(cleanedUrlInput.value, copyCleanBtn);
});

copyLinkBtn.addEventListener('click', () => {
    copyToClipboard(generatedUrlInput.value, copyLinkBtn);
});

// ===== Enter key support =====
dirtyUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') cleanUrlBtn.click();
});

originalUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') generateLinkBtn.click();
});
