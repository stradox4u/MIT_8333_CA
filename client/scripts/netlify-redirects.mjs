import { writeFile } from "node:fs/promises";

const origin = process.env.API_ORIGIN;
if (!origin)
  throw new Error(
    "Set API_ORIGIN to the public Railway API origin in Netlify.",
  );
const url = new URL(origin);
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
) {
  throw new Error(
    "API_ORIGIN must be an HTTPS origin without credentials, path, query or fragment.",
  );
}
await writeFile(
  new URL("../dist/_redirects", import.meta.url),
  `/api/* ${url.origin}/api/:splat 200!\n/* /index.html 200\n`,
);
