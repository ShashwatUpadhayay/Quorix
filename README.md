This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Question generation pipeline

Mock interviews now select or generate questions dynamically at session start and
after every answer, calibrated by the candidate profile, stage and difficulty.
The pipeline supports Ollama (local dev) and Gemini (prod), stores a reviewed
question bank in MongoDB, validates every generated question, and falls back to
approved bank questions on failure.

- Architecture and setup: [`docs/QUESTION_PIPELINE.md`](docs/QUESTION_PIPELINE.md)
- Review UI: `/admin/questions` (admin or expert role)
- Commands: `npm run pipeline:python:doctor`, `npm run pipeline:python`

### Python local pipeline

The local-first question pipeline is available in `python_pipeline/` and only
uses the Ollama HTTP API; it does not require MongoDB or Next.js for local
generation.

```bash
ollama pull qwen2.5:7b
npm run pipeline:python:doctor
npm run pipeline:python -- --mode=generate --focus="Kafka" --level=Senior --tags="Kafka,Go"
python -m unittest tests/test_python_question_pipeline.py
```

### Production: Gemini

Set these server-side variables on the hosting platform:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your-server-side-key>
GEMINI_MODEL=gemini-3.8-flash
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_MAX_RETRIES=4
GEMINI_RETRY_BASE_MS=1000
GEMINI_TIMEOUT_MS=120000
```

Never prefix the Gemini key with `NEXT_PUBLIC_`. Production session creation uses
the Gemini HTTP API directly; it does not require Python to be available on the
Node hosting runtime. Local development continues to use Ollama.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
