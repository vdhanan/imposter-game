# Supabase Setup Guide for Imposter Game

## Step 1: Create Supabase Account & Project

1. Go to [supabase.com](https://supabase.com) and sign up for a free account
2. Click "New project"
3. Fill in:
   - Project name: `imposter-game` (or your choice)
   - Database Password: Create a strong password (save this!)
   - Region: Choose the closest to your users
4. Click "Create new project" and wait for setup

## Step 2: Get Your Database URLs

1. In your Supabase project dashboard, go to **Settings** (gear icon)
2. Click on **Database** in the sidebar
3. Scroll to **Connection string** section
4. You'll need TWO URLs:

### Transaction Pooler URL (for the app):
- Under "Connection pooling" section
- Mode: `Transaction`
- Copy the connection string
- It looks like: `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true`

### Direct Connection URL (for migrations):
- Under "Direct connection" section
- Copy the connection string
- It looks like: `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`

## Step 3: Configure Your App

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` and replace:
   - `DATABASE_URL` with your Transaction Pooler URL
   - `DIRECT_URL` with your Direct Connection URL
   - Add your Pusher credentials (see Pusher setup below)

Example:
```env
# Supabase Database
DATABASE_URL="postgresql://postgres.abcdefghijk:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abcdefghijk:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

## Step 4: Run Database Migrations

1. Install dependencies:
```bash
npm install
```

2. Generate Prisma client:
```bash
npx prisma generate
```

3. Run migrations to create tables:
```bash
npx prisma migrate dev --name init
```

## Step 5: Verify Setup

1. Check your tables in Supabase:
   - Go to Table Editor in your Supabase dashboard
   - You should see: `Lobby`, `Player`, `Round`, `Hint`, `Vote` tables

2. Test the connection:
```bash
npx prisma studio
```
This opens a GUI to view your database

## Pusher Setup (Required for Real-time)

1. Go to [pusher.com](https://pusher.com) and create a free account
2. Create a new Channels app
3. Choose a cluster closest to your users
4. Go to "App Keys" tab
5. Copy your credentials to `.env.local`:
```env
NEXT_PUBLIC_PUSHER_APP_KEY="your_app_key"
PUSHER_APP_ID="your_app_id"
PUSHER_APP_KEY="your_app_key"
PUSHER_APP_SECRET="your_app_secret"
PUSHER_APP_CLUSTER="us2"  # or your cluster
NEXT_PUBLIC_PUSHER_APP_CLUSTER="us2"
```

## Step 6: Run the App

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

1. Push your code to GitHub
2. Import project to Vercel
3. Add ALL environment variables from `.env.local` to Vercel:
   - `DATABASE_URL` (Transaction pooler URL)
   - `DIRECT_URL` (Direct connection URL)
   - All Pusher variables
4. Deploy!

## Troubleshooting

### "Connection timeout" errors
- Make sure you're using the Transaction Pooler URL for `DATABASE_URL`
- Check that your password is correct
- Ensure Supabase project is active (not paused)

### "Too many connections" errors
- Verify you're using the pooler URL (port 6543) for the app
- Only use Direct URL (port 5432) for migrations

### Tables not created
- Run `npx prisma migrate reset` to reset and recreate all tables
- Check migration status: `npx prisma migrate status`

## Free Tier Limits

Supabase free tier includes:
- 500MB database
- 2GB bandwidth
- 50,000 monthly active users
- Pauses after 1 week of inactivity (can be unpaused)

Perfect for this game!