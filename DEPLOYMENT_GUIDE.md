# Deployment Guide

## Step 1: Connect Vercel to GitHub ✓
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Import your repository: `vdhanan/imposter-game`
5. Vercel will auto-detect Next.js framework

## Step 2: Configure Environment Variables in Vercel
Add these environment variables in Vercel project settings:

### Pusher Variables (from .env.local):
- `NEXT_PUBLIC_PUSHER_APP_KEY`: d35c17f4a51fa0aa9459
- `PUSHER_APP_ID`: 2084463
- `PUSHER_APP_KEY`: d35c17f4a51fa0aa9459
- `PUSHER_APP_SECRET`: a7db6b613adca5a65ec3
- `PUSHER_APP_CLUSTER`: us2
- `NEXT_PUBLIC_PUSHER_APP_CLUSTER`: us2

### Supabase Production Variables:
You'll need to get these from your production Supabase project:
- `DATABASE_URL`: Your production Supabase connection string
- `DIRECT_URL`: Your production Supabase direct connection string

## Step 3: Get Production Supabase Connection Strings
1. Go to https://supabase.com/dashboard
2. Select your production project (or create one)
3. Go to Settings → Database
4. Copy:
   - Connection string (Transaction mode) → Use as `DATABASE_URL`
   - Connection string (Session mode) → Use as `DIRECT_URL`

## Step 4: Deploy Database Schema to Production
Once you have your production database URLs:

1. Create a `.env.production` file locally:
```bash
DATABASE_URL="your_production_transaction_url"
DIRECT_URL="your_production_direct_url"
```

2. Push schema to production:
```bash
npx prisma db push --skip-generate
```

3. Verify the deployment:
```bash
npx prisma studio
```

## Step 5: Deploy to Vercel
After configuring all environment variables in Vercel:
1. Click "Deploy" in Vercel dashboard
2. Your app will be available at: `https://imposter-game.vercel.app`

## Important Notes:
- Never commit `.env.production` to git
- Vercel will automatically redeploy when you push to GitHub
- Database migrations will need to be run manually for schema changes