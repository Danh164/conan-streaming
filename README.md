# Conan Cinema — Premium Frontend (Vercel)

## Deploy
1. Push the contents of this folder to a GitHub repository.
2. Import the repository in Vercel, select **Other** framework, root directory `./`, no build command, output directory `./`.
3. Deploy. The UI loads, but live Telegram channels and playback require a separately hosted backend.

## Connect the existing Python backend
- Configure `config.js`: `window.CONAN_API_BASE = 'https://your-private-api.example.com';`
- Backend must support the existing `/api/channels`, `/api/progress` and `/api/channels/.../stream` endpoints, authenticated CORS requests, and streaming HTTP Range requests.
- The existing local Python FastAPI/Telethon backend is **not** included here and should not be deployed to Vercel serverless functions for multi-GB streaming.
- Never commit `.env`, `*.session`, `TG_API_HASH` or Telegram authentication credentials.
- **Security:** a public Vercel frontend pointing at an unauthenticated Telegram backend would expose channel content. Add backend authentication/authorization before publishing or use a private network.
- The frontend currently uses the same request contract as the local backend and does **not** yet implement cross-origin auth or credential management. Treat online streaming as requiring backend integration, not plug-and-play.

## Local preview
Run `python3 -m http.server 3000` from this folder, then open `http://localhost:3000`. For working Telegram playback use the original local FastAPI server with these files copied to its `static/` directory; update the three asset URLs in `index.html` back to `/static/...`, or configure FastAPI to serve the frontend at root.
