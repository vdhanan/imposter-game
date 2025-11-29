# Local Supabase Development Setup

## Prerequisites
- Docker Desktop installed and running
- Supabase CLI installed (`brew install supabase/tap/supabase` on Mac)
- Your Supabase cloud project reference ID

## Step 1: Link to Your Cloud Project

Get your project reference ID from your Supabase dashboard URL:
- It's the part after `https://supabase.com/dashboard/project/`
- Example: `abcdefghijklmnop`

Link your local project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

You'll be prompted to enter your database password (the one you created when setting up the project).

## Step 2: Start Local Supabase

Start the local Supabase stack (PostgreSQL, Auth, Storage, etc.):
```bash
supabase start
```

This will download Docker images on first run (may take a few minutes).

## Step 3: Create Local Environment File

Create `.env.local.development` for local development:
```bash
cp .env.local .env.local.development
```

## Step 4: Update Environment Variables

After `supabase start` completes, it will show you local URLs. Update `.env.local.development`:

```env
# Local Supabase Database
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
DIRECT_URL="postgresql://postgres:postgres@localhost:54322/postgres"

# Keep your Pusher credentials the same
NEXT_PUBLIC_PUSHER_APP_KEY="your_pusher_app_key"
PUSHER_APP_ID="your_pusher_app_id"
PUSHER_APP_KEY="your_pusher_app_key"
PUSHER_APP_SECRET="your_pusher_app_secret"
PUSHER_APP_CLUSTER="us2"
NEXT_PUBLIC_PUSHER_APP_CLUSTER="us2"
```

## Step 5: Push Prisma Schema to Local Database

```bash
# Use local env file
cp .env.local.development .env.local

# Push schema to local database
npx prisma db push

# Generate Prisma Client
npx prisma generate
```

## Step 6: Run the App Locally

```bash
npm run dev
```

Your app is now running with local Supabase!

## Useful Commands

### View local Supabase services:
```bash
supabase status
```

### Access local services:
- Studio (Database UI): http://localhost:54323
- API: http://localhost:54321
- Database: localhost:54322

### Stop local Supabase:
```bash
supabase stop
```

### Reset local database:
```bash
supabase db reset
```

### Pull remote schema changes:
```bash
supabase db pull
```

### Push local changes to remote:
```bash
supabase db push
```

## Switching Between Local and Cloud

### For local development:
```bash
cp .env.local.development .env.local
supabase start
npm run dev
```

### For cloud development:
```bash
cp .env.local.production .env.local  # Your cloud credentials
npm run dev
```

## Troubleshooting

### Docker not running:
Make sure Docker Desktop is running before starting Supabase.

### Port conflicts:
If ports are in use, stop Supabase and restart:
```bash
supabase stop
supabase start
```

### Database connection issues:
Check if local Supabase is running:
```bash
supabase status
```

### Reset everything:
```bash
supabase stop --no-backup
supabase start
```