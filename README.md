# Receipt Manager — Admin UI

A static web dashboard for managing receipt records in Supabase.
Authenticates with Google (via Supabase Auth) and provides a spreadsheet-like CRUD interface.

## Features

- **Google Sign-In** — Only whitelisted Google accounts can access the dashboard
- **Spreadsheet-like table** — View all receipts with sortable columns
- **Add / Edit / Delete** — Full CRUD operations on the `Receipt_Inter` table
- **Filters** — Filter by date range, name, and receipt type
- **Image preview** — View receipt images stored in Supabase Storage
- **Pagination** — Browse large datasets efficiently
- **Dark theme** — Premium dark UI with glassmorphism effects

## Setup

### 1. Supabase Configuration

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Enable **Google** under Authentication → Providers
3. Add your site URL (e.g., `https://yourusername.github.io/receiptUI_supa/`) to:
   - Authentication → URL Configuration → **Redirect URLs**

### 2. Update Config

Edit `js/config.js` with your Supabase credentials (already pre-filled).

### 3. Deploy

Push to GitHub and enable GitHub Pages (Settings → Pages → Source: `main` branch, `/root`).

## Project Structure

```
├── index.html          # Login page
├── dashboard.html      # Admin dashboard
├── css/
│   └── style.css       # Dark theme styles
├── js/
│   ├── config.js       # Supabase URL, key, and settings
│   ├── supabase-init.js# Supabase client initialization
│   ├── auth.js         # Google OAuth authentication
│   └── dashboard.js    # Table, CRUD, filters, pagination
└── README.md
```
