# Imposter Game

A real-time multiplayer word guessing game built with Next.js, Pusher, and PostgreSQL.

## Features

- Create and join lobbies with unique codes
- Real-time multiplayer gameplay using Pusher
- Players give hints about a secret word
- One imposter tries to blend in without knowing the word
- Voting system to identify the imposter
- Scoring system across multiple rounds

## Setup

1. Clone the repository

2. Install dependencies:
```bash
npm install
```

3. Set up Supabase (PostgreSQL database):
   - Create a free account at [supabase.com](https://supabase.com)
   - Create a new project
   - Get your database URLs from Settings > Database
   - See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed instructions

4. Create a Pusher account and get your credentials from [pusher.com](https://pusher.com)

5. Copy `.env.example` to `.env.local` and fill in your credentials:
```env
# Supabase Database URLs
DATABASE_URL="your_supabase_transaction_pooler_url"
DIRECT_URL="your_supabase_direct_connection_url"

# Pusher credentials
NEXT_PUBLIC_PUSHER_APP_KEY="your_pusher_app_key"
PUSHER_APP_ID="your_pusher_app_id"
PUSHER_APP_KEY="your_pusher_app_key"
PUSHER_APP_SECRET="your_pusher_app_secret"
PUSHER_APP_CLUSTER="us2"
NEXT_PUBLIC_PUSHER_APP_CLUSTER="us2"
```

6. Run database migrations:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

7. Start the development server:
```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000)

## How to Play

1. One player creates a lobby and shares the 6-digit code
2. Other players join using the lobby code (minimum 3 players)
3. The host starts the game
4. Everyone except the imposter sees the secret word
5. Players take turns giving one-word hints about the word
6. After two rounds of hints, everyone votes for who they think is the imposter
7. If the imposter is caught, they can guess the word to still win
8. Points are awarded based on successful deception or correct identification

## Deployment

This app is designed to be deployed on Vercel with a PostgreSQL database.

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL) with Prisma ORM
- **Real-time**: Pusher
- **Deployment**: Vercel