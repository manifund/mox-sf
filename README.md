# mox-sf

## Using bun

Bun (https://bun.sh/) is a fast Javascript runtime & package manager.

```bash
# Install dependencies
bun install

# Start development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Get env variables

After you have vercel access, this will get you API keys:

```
bun add -g vercel
vercel link
vercel env pull .env.local
```

(The weekly door code for moxsf.com/door is stored as an env variable.)

.
