const express = require('express');
const cors = require('cors');
const { initDatabase, getDatabase, saveDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Generate random 6-character short code
function generateShortCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Generate unique short code with collision safety
function generateUniqueShortCode() {
    const db = getDatabase();
    let code;
    let attempts = 0;
    const maxAttempts = 10;

    do {
        code = generateShortCode();
        const result = db.exec(`SELECT id FROM links WHERE short_code = '${code}'`);
        if (result.length === 0) return code;
        attempts++;
    } while (attempts < maxAttempts);

    // Fallback: append timestamp suffix for guaranteed uniqueness
    const timestamp = Date.now().toString(36).slice(-4);
    code = generateShortCode().slice(0, 2) + timestamp;

    // Final check (should never collide with timestamp)
    const result = db.exec(`SELECT id FROM links WHERE short_code = '${code}'`);
    if (result.length > 0) {
        throw new Error('Failed to generate unique short code');
    }

    return code;
}

// POST /create - Create a new expiring link
app.post('/create', (req, res) => {
    try {
        const db = getDatabase();
        const { original_url, expiry_hours, max_clicks } = req.body;

        // Validation
        if (!original_url) {
            return res.status(400).json({ error: 'original_url is required' });
        }

        // Generate unique short code
        const short_code = generateUniqueShortCode();

        // Current timestamp (Unix ms)
        const created_at = Date.now();

        // Calculate expiry time (Unix ms)
        let expires_at = null;
        if (expiry_hours && parseFloat(expiry_hours) > 0) {
            expires_at = created_at + Math.floor(parseFloat(expiry_hours) * 60 * 60 * 1000);
        }

        // Insert into database
        const maxClicksVal = max_clicks ? parseInt(max_clicks) : null;
        db.run(`
      INSERT INTO links (original_url, short_code, max_clicks, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [original_url, short_code, maxClicksVal, expires_at, created_at]);

        saveDatabase();

        // Build short URL - users HATE manual building of URLs
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const short_url = `${baseUrl}/${short_code}`;

        res.json({
            short_code,
            short_url,
            expires_at: expires_at ? new Date(expires_at).toISOString() : null,
            max_clicks: maxClicksVal
        });

    } catch (error) {
        console.error('Error creating link:', error);
        res.status(500).json({ error: 'Failed to create link' });
    }
});

// GET /:code - Redirect or show expiry message
app.get('/:code', (req, res) => {
    try {
        const db = getDatabase();
        const { code } = req.params;

        // Find link
        const result = db.exec(`SELECT * FROM links WHERE short_code = '${code}'`);

        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(404).send(renderMessage('Link not found', 'This link does not exist.'));
        }

        // Map result to object
        const columns = result[0].columns;
        const values = result[0].values[0];
        const link = {};
        columns.forEach((col, i) => {
            link[col] = values[i];
        });

        // Frontend URL for home button
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

        // Check if already inactive
        if (!link.active) {
            return res.status(410).send(renderMessage('Link expired', 'This link is no longer active.', {
                reason: 'Link was previously deactivated',
                homeUrl: frontendUrl
            }));
        }

        // Check time expiry (compare Unix ms timestamps)
        if (link.expires_at !== null) {
            const now = Date.now();
            if (now > link.expires_at) {
                // Deactivate the link
                db.run(`UPDATE links SET active = 0 WHERE id = ${link.id}`);
                saveDatabase();
                return res.status(410).send(renderMessage('Link expired', 'This link has expired.', {
                    reason: 'Time limit reached',
                    expiredAt: link.expires_at,
                    homeUrl: frontendUrl
                }));
            }
        }

        // Check click limit
        if (link.max_clicks !== null && link.click_count >= link.max_clicks) {
            // Deactivate the link
            db.run(`UPDATE links SET active = 0 WHERE id = ${link.id}`);
            saveDatabase();
            return res.status(410).send(renderMessage('Usage limit reached', 'This link has reached its maximum number of clicks.', {
                reason: `Click limit of ${link.max_clicks} reached`,
                homeUrl: frontendUrl
            }));
        }

        // Increment click count
        db.run(`UPDATE links SET click_count = click_count + 1 WHERE id = ${link.id}`);

        // Check if this click exhausts the limit
        if (link.max_clicks !== null && link.click_count + 1 >= link.max_clicks) {
            db.run(`UPDATE links SET active = 0 WHERE id = ${link.id}`);
        }

        saveDatabase();

        // Redirect to original URL
        res.redirect(302, link.original_url);

    } catch (error) {
        console.error('Error accessing link:', error);
        res.status(500).send(renderMessage('Error', 'An error occurred while processing your request.'));
    }
});

// Render simple HTML message with enhanced info
function renderMessage(title, message, details = {}) {
    const { reason, expiredAt, homeUrl } = details;
    const homeLink = homeUrl || '/';

    let detailsHtml = '';
    if (reason) {
        detailsHtml += `<p class="reason"><strong>Reason:</strong> ${reason}</p>`;
    }
    if (expiredAt) {
        const expiredDate = new Date(expiredAt);
        detailsHtml += `<p class="expired-at"><strong>Expired:</strong> ${expiredDate.toLocaleString()}</p>`;
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - PrivacyKit</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 3rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      max-width: 400px;
    }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #f87171; }
    p { color: #94a3b8; line-height: 1.6; margin-bottom: 0.5rem; }
    .reason, .expired-at { font-size: 0.9rem; color: #64748b; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    .home-btn {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .home-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔒</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${detailsHtml}
    <a href="${homeLink}" class="home-btn">← Return Home</a>
  </div>
</body>
</html>
  `;
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'PrivacyKit API is running' });
});

// Initialize database and start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`PrivacyKit server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
