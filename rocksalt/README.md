# Rocksalt

An open-source, city/state-deployable web app for crowdsourced reporting of immigration enforcement activity. Think WAZE for ICE sightings. Optimized for speed, anonymity, and resilience.

## Features

- 🗺️ Real-time map of reported sightings
- 📱 Mobile-first
- 🌐 Multilingual (English, Spanish, Chinese, Japanese, Vietnamese)
- 🔒 Privacy-focused (no tracking, EXIF stripping)
- ⚡ Fast and lightweight
- 🚀 Easy deployment per city

## Roadmap
- Dark mode interface
- More languages
- PWA Push Notifications
- SMS (donation-based?)

---

## Quick Start for Non-Technical Users

**No coding experience required!** This guide will walk you through deploying Rocksalt for your city or state in about 30-60 minutes.

### What You'll Need

- A computer with internet access
- A free GitHub account
- A free Supabase account
- A free Vercel account
- About 30-60 minutes of your time

### Overview

Deploying Rocksalt involves three main steps:

1. **Set up Supabase** - This is your database (where reports are stored)
2. **Configure for your city** - Set your geographic boundaries and city name
3. **Deploy to Vercel** - Make your site live on the internet

Let's get started!

---

## Step 1: Finding Your City/State Boundaries

Before you can deploy Rocksalt, you need to find the geographic boundaries (coordinates) for your area. This tells the app which region to cover.

### Understanding Coordinates

- **SW (Southwest)** = The bottom-left corner of your coverage area
- **NE (Northeast)** = The top-right corner of your coverage area
- Coordinates are always in the format: `latitude,longitude`
- **Latitude** = How far north/south (positive = north)
- **Longitude** = How far east/west (negative = west in the US)

### Method 1: Using Bounding Box Tool (Recommended - Easiest)

This is the easiest method for beginners:

1. Go to [https://boundingbox.klokantech.com/](https://boundingbox.klokantech.com/)
2. In the top-left, select **"CSV"** from the dropdown menu
3. Use the search box or drag the map to find your city/state
4. Click and drag to draw a rectangle around the area you want to cover
5. You'll see coordinates appear in the bottom-left box
6. The format will be: `west,south,east,north`
7. **Convert to our format:**
   - `VITE_BOUNDS_SW` = `south,west` (swap the order)
   - `VITE_BOUNDS_NE` = `north,east` (swap the order)

**Example:** If the tool shows `-103.0,33.6,-94.4,37.0`:
- `VITE_BOUNDS_SW` = `33.6,-103.0`
- `VITE_BOUNDS_NE` = `37.0,-94.4`

### Method 2: Using OpenStreetMap

1. Go to [https://www.openstreetmap.org/](https://www.openstreetmap.org/)
2. Navigate to your city/state
3. Right-click on the **southwest corner** (bottom-left) of your coverage area
4. Click "Show address" or look at the URL - you'll see coordinates like `lat=33.6&lon=-103.0`
5. Copy the latitude and longitude: `33.6,-103.0` → This is your `VITE_BOUNDS_SW`
6. Right-click on the **northeast corner** (top-right) of your coverage area
7. Copy those coordinates: `37.0,-94.4` → This is your `VITE_BOUNDS_NE`

### Method 3: Using Google Maps

1. Go to [https://www.google.com/maps](https://www.google.com/maps)
2. Navigate to your city/state
3. Right-click on the **southwest corner** of your coverage area
4. Click the coordinates that appear at the top of the menu
5. Copy the coordinates (format: `lat, lng`) → This is your `VITE_BOUNDS_SW`
6. Repeat for the **northeast corner** → This is your `VITE_BOUNDS_NE`

### Finding Your Default Center and Zoom

- **Default Center** = The point where the map should start when users first open the app (usually your city center or state capital)
- **Default Zoom** = How zoomed in the map should be (6 = very zoomed out, 12 = very zoomed in)
  - States: Use 6-8
  - Cities: Use 10-12

**To find your center point:**
- Right-click on your city center or capital on any map tool
- Copy the coordinates (lat,long format)

### Example Configurations

Here are ready-to-use configurations for common areas:

| Location | VITE_BOUNDS_SW | VITE_BOUNDS_NE | VITE_DEFAULT_CENTER | VITE_DEFAULT_ZOOM |
|----------|---------------|----------------|---------------------|-------------------|
| Oklahoma | `33.6,-103.0` | `37.0,-94.4` | `35.4676,-97.5164` | `8` |
| Los Angeles | `33.7,-118.7` | `34.3,-118.1` | `34.0522,-118.2437` | `11` |
| Texas | `25.84,-106.65` | `36.5,-93.51` | `31.9686,-99.9018` | `6` |
| New York City | `40.49,-74.26` | `40.92,-73.7` | `40.7128,-74.006` | `11` |
| Chicago | `41.64,-87.94` | `42.02,-87.52` | `41.8781,-87.6298` | `11` |

**Write down your coordinates** - you'll need them in Step 3!

---

## Step 2: Setting Up Supabase

Supabase is a free database service that stores all the sighting reports. Here's how to set it up:

### 1. Create a Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" or "Sign up"
3. Sign up with your GitHub account (recommended) or email

### 2. Create a New Project

1. Click **"New Project"** in the Supabase dashboard
2. Fill in the details:
   - **Name**: Choose a name like `rocksalt-oklahoma` (use your city/state name)
   - **Database Password**: Create a strong password and **save it somewhere safe** (you won't need it often, but keep it!)
   - **Region**: Choose the region closest to your users
3. Click **"Create new project"**
4. Wait 2-3 minutes for your project to be created

### 3. Get Your Credentials

You'll need these for Step 3:

1. In your Supabase project dashboard, click **"Settings"** (gear icon) in the left sidebar
2. Click **"API"** in the settings menu
3. Find these two values:
   - **Project URL** - Copy this (looks like `https://xxxxx.supabase.co`)
   - **anon public** key - Click "Reveal" and copy this long string (starts with `eyJhbGc...`)

**Save both of these** - you'll paste them into Vercel in Step 3!

### 4. Run Database Migrations

Migrations are scripts that set up your database tables. You need to run them in order:

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase/migrations/001_enable_postgis.sql` from this repository
4. Copy all the text from that file
5. Paste it into the SQL Editor
6. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
7. You should see "Success. No rows returned"

Repeat this process for each migration file **in this exact order**:

- `001_enable_postgis.sql` - Enables geographic features (what this does: allows the database to work with maps)
- `002_create_tables.sql` - Creates the main tables (what this does: sets up tables for storing reports and alerts)
- `003_create_functions.sql` - Creates helper functions (what this does: adds functions for finding nearby reports and updating confidence scores)
- `004_create_policies.sql` - Sets up security rules (what this does: makes sure only public reports are visible, allows anyone to submit reports)
- `006_create_storage_policies.sql` - Sets up photo storage rules (what this does: allows photos to be uploaded and viewed)

**Note:** Skip `005_schedule_cron.sql` - this is optional and requires special setup.

### 5. Create Storage Bucket for Photos

1. In your Supabase dashboard, click **"Storage"** in the left sidebar
2. Click **"New bucket"**
3. Name it exactly: `sighting-photos`
4. **Important:** Toggle **"Public bucket"** to ON (this allows photos to be viewed)
5. Click **"Create bucket"**
6. Now go back to the SQL Editor and run `006_create_storage_policies.sql` (if you haven't already)

Great! Your Supabase database is now set up. ✅

---

## Step 3: Deploying to Vercel

Vercel is a free hosting service that makes your website live on the internet.

### 1. Fork the Repository on GitHub

1. Go to the Rocksalt repository on GitHub
2. Click the **"Fork"** button in the top-right corner
3. This creates your own copy of the code that you can customize

**What is forking?** It's like making a copy of a recipe so you can modify it for your own use.

### 2. Connect to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Click **"Sign Up"** and sign up with your GitHub account
3. After signing in, click **"Add New..."** → **"Project"**
4. You'll see a list of your GitHub repositories
5. Find your forked `rocksalt` repository and click **"Import"**

### 3. Configure Your Project

1. **Project Name**: Vercel will suggest a name - you can keep it or change it (e.g., `rocksalt-oklahoma`)
2. **Framework Preset**: Vercel should auto-detect "Vite" - leave this as is
3. **Root Directory**: Leave as `./` (default)

### 4. Add Environment Variables

This is where you'll paste all your configuration. Click **"Environment Variables"** and add each of these:

| Variable Name | Value | Where to Get It |
|--------------|-------|----------------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL | From Step 2, Section 3 |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | From Step 2, Section 3 |
| `VITE_CITY_NAME` | Your city/state name | e.g., `Oklahoma` or `Los Angeles` |
| `VITE_CITY_SLUG` | Short code (no spaces) | e.g., `ok` or `la` |
| `VITE_BOUNDS_SW` | Southwest coordinates | From Step 1 |
| `VITE_BOUNDS_NE` | Northeast coordinates | From Step 1 |
| `VITE_DEFAULT_CENTER` | Center point coordinates | From Step 1 |
| `VITE_DEFAULT_ZOOM` | Zoom level (6-12) | From Step 1 |

**Important:** 
- Don't use quotes around the values (Vercel adds them automatically)
- Make sure there are no spaces before or after your coordinates
- Double-check that your coordinates are in the format `lat,long` (not `long,lat`)

### 5. Deploy!

1. Click **"Deploy"** at the bottom
2. Wait 2-3 minutes while Vercel builds and deploys your site
3. When it's done, you'll see a green "Success" message
4. Click the **"Visit"** button or the URL shown
5. **Your Rocksalt site is now live!** 🎉

---

## Environment Variables Reference

Here's a complete reference of all environment variables:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL | `https://abc123.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `VITE_CITY_NAME` | Yes | Display name for your area | `Oklahoma` |
| `VITE_CITY_SLUG` | Yes | Short code (lowercase, no spaces) | `ok` |
| `VITE_BOUNDS_SW` | Yes | Southwest corner coordinates (lat,long) | `33.6,-103.0` |
| `VITE_BOUNDS_NE` | Yes | Northeast corner coordinates (lat,long) | `37.0,-94.4` |
| `VITE_DEFAULT_CENTER` | Yes | Map center point (lat,long) | `35.4676,-97.5164` |
| `VITE_DEFAULT_ZOOM` | Yes | Initial zoom level (6-12) | `8` |

---

## FAQ for Deployers

### What if I make a mistake with the coordinates?

No problem! You can update your environment variables in Vercel anytime:
1. Go to your project in Vercel
2. Click **"Settings"** → **"Environment Variables"**
3. Edit the variable and save
4. Click **"Redeploy"** - your changes will be live in 2-3 minutes

### How much does this cost?

**Free!** Both Supabase and Vercel offer generous free tiers that are sufficient for most cities:
- **Supabase Free Tier**: 500 MB database, 1 GB file storage, 2 GB bandwidth
- **Vercel Free Tier**: Unlimited deployments, 100 GB bandwidth

For larger cities with heavy traffic, you may eventually need paid plans, but the free tiers are perfect to get started.

### Can I customize the resources/legal help links?

Yes! After deploying, you can customize the resources shown in the app by editing `src/config/city.ts` in your GitHub repository. The `resources` array contains the links shown in the "Resources" tab.

### How do I add more languages?

Rocksalt currently supports English, Spanish, Chinese, and Japanese. To add more languages:
1. Add translation files in `src/locales/[language-code]/translation.json`
2. Update `src/i18n.ts` to include the new language
3. Update `src/components/LanguageSwitcher.tsx` to add the language option
4. Commit and push to GitHub - Vercel will automatically redeploy

### Can I test locally before deploying?

Yes! If you have Node.js installed:
1. Clone your forked repository
2. Run `npm install`
3. Create a `.env` file with your environment variables (see `.env.example`)
4. Run `npm run dev`
5. Open `http://localhost:5173` in your browser

### What if my deployment fails?

Check the Vercel deployment logs:
1. Go to your project in Vercel
2. Click on the failed deployment
3. Check the "Build Logs" tab for error messages
4. Common issues:
   - Missing environment variables
   - Incorrect coordinate format
   - Supabase credentials are wrong

---

## Getting Help

- **Found a bug or have a question?** Open an issue on [GitHub Issues](https://github.com/[your-repo]/issues)
- **Want to contribute?** Pull requests are welcome!
- **Need help with deployment?** Check the FAQ above or open a GitHub issue

---

## For Developers

### Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Maps**: Leaflet + OpenStreetMap
- **Backend**: Supabase (PostgreSQL + PostGIS + Realtime)
- **i18n**: react-i18next

### Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

### Project Structure

```
rocksalt/
├── src/
│   ├── components/      # React components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── locales/        # i18n translations
│   ├── config/         # Location configuration
│   └── types/          # TypeScript types
├── supabase/
│   └── migrations/     # Database migrations
└── public/             # Static assets
```

---

## License

MIT or AGPL-3.0

## Legal Disclaimer

Rocksalt is a community information-sharing tool. Reporting and viewing public activity is protected speech. This app does not provide legal advice. If you need legal help, contact an immigration attorney or one of the resources listed in the app.
