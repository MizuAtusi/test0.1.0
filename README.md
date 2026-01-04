# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Deploy outside Lovable (Vercel/Netlify/Cloudflare Pages)

This is a Vite + React SPA (uses `react-router-dom`), so you can host it as a static site.

1) Build settings
- Build command: `npm ci && npm run build`
- Output directory: `dist`

2) Environment variables (set them in your hosting provider UI)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

For local development, copy `.env.example` to `.env`.

3) Supabase settings (important when changing domain)
- Supabase Dashboard → Auth → URL Configuration
  - Set **Site URL** to your production URL
  - Add your production URL to **Redirect URLs** (and any preview URLs if you use them)

Notes:
- Netlify: `public/_redirects` is included for SPA routing.
- Vercel: `vercel.json` is included for SPA routing.

## Deploy to GitHub Pages

GitHub Pages can host this as a static site, but because it's an SPA, it needs a small 404 redirect workaround (included: `public/404.html` + `index.html`).

1) Repo settings
- GitHub → Settings → Pages → Build and deployment → Source: **GitHub Actions**

2) Secrets (for build-time env vars)
- GitHub → Settings → Secrets and variables → Actions → New repository secret:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_PROJECT_ID`

3) Deploy
- Push to `main` and the workflow `Deploy to GitHub Pages` will publish automatically.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
