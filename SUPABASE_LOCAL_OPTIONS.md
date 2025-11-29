# Supabase Local Development Options

## Option 1: Completely Local (Recommended for now)

This runs Supabase entirely on your machine with no cloud connection.

### Steps:

1. **Start local Supabase:**
```bash
supabase start
```

2. **Copy local environment file:**
```bash
cp .env.local.development .env.local
```

3. **Push Prisma schema to local database:**
```bash
npx prisma db push
```

4. **Run the app:**
```bash
npm run dev
```

Your app will now use the local Supabase database at `localhost:54322`.

### Local URLs:
- **Studio** (Database UI): http://localhost:54323
- **API**: http://localhost:54321
- **Database**: postgresql://postgres:postgres@localhost:54322/postgres

---

## Option 2: Link to Cloud Project

This syncs your local development with your cloud Supabase project.

### Steps:

1. **Get your project reference ID:**
   - Go to your Supabase dashboard
   - The URL will be: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`
   - Copy the `YOUR_PROJECT_REF` part

2. **Link the project:**
```bash
supabase link --project-ref YOUR_PROJECT_REF
```
You'll be prompted for your database password (the one you set when creating the project).

3. **Pull remote schema (optional):**
```bash
supabase db pull
```
This creates migrations based on your cloud database schema.

4. **Start local Supabase:**
```bash
supabase start
```

5. **Push Prisma schema:**
```bash
npx prisma db push
```

---

## Which Option to Choose?

### Use Option 1 (Completely Local) if:
- You just want to develop locally
- You don't need to sync with cloud yet
- You're testing/experimenting

### Use Option 2 (Link to Cloud) if:
- You want to keep local and cloud schemas in sync
- You need to test with production-like data
- You're working in a team and need consistency

---

## Switching Between Local and Cloud Databases

### For local database:
```bash
cp .env.local.development .env.local
npm run dev
```

### For cloud database:
```bash
# Create a production env file with your cloud credentials
cp .env.local .env.local.production  # First time only
# Then use it
cp .env.local.production .env.local
npm run dev
```

---

## Quick Commands

### Check Supabase status:
```bash
supabase status
```

### Stop Supabase:
```bash
supabase stop
```

### Reset local database:
```bash
supabase db reset
```

### View logs:
```bash
supabase db logs
```