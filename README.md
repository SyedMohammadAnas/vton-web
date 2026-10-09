# VTON

Personal virtual try-on site. The browser talks to this Next.js app. The app proxies the local CatVTON engine, so the API secret never reaches the browser.

CatVTON is non-commercial.

## Setup

Copy `.env.example` to `.env.local` and set:

- `CATVTON_API_URL` — engine base URL, for example `http://127.0.0.1:8787`
- `CATVTON_SECRET` — value of the engine `X-CatVTON-Secret` header

```bash
npm install
npm run dev
```

Open http://localhost:3000.
